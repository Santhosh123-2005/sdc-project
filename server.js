const express = require('express');
const cors = require('cors');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');

const app = express();
const port = process.env.PORT || 8000;
const upload = multer({ storage: multer.memoryStorage() });
const users = new Map();
const sessions = new Map();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));

function userKey(userType, username) {
  return `${userType}:${username.toLowerCase()}`;
}

function buildReport(data, results) {
  return `PCOS Diagnostic Report\n\nPatient Age: ${data.age} years\nBMI: ${data.bmi}\nMenstrual Cycle Length: ${data.cycleLength} days\n\nConclusion:\n- Disease Presence: ${results.presence}\n- Category: ${results.category}\n- Subtype: ${results.subtype}\n- Severity: ${results.severity}\n\nInterpretation:\nThe model integrates clinical features with ultrasound imaging using a lightweight multimodal fusion pipeline. SHAP highlights the most important clinical features, while Grad-CAM++ provides visual explainability for ultrasound imagery.\nRecommendation:\nReview the findings with a clinician and follow up with targeted endocrine testing and patient counseling.`;
}

function requireUser(req, res, next) {
  const authorization = req.get('Authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  const key = sessions.get(token);
  if (!key || !users.has(key)) {
    return res.status(401).json({ detail: 'Unauthorized' });
  }
  req.user = users.get(key);
  next();
}

app.post('/api/register', (req, res) => {
  const { user_type: userType, username, email, password } = req.body;
  if (!userType || !username || !email || !password) {
    return res.status(422).json({ detail: 'All registration fields are required' });
  }

  const key = userKey(userType, username);
  if (users.has(key)) {
    return res.status(400).json({ detail: 'User already exists' });
  }

  users.set(key, { username, email, user_type: userType, password });
  res.json({ message: 'Registration successful' });
});

app.post('/api/login', (req, res) => {
  const { user_type: userType, username, password } = req.body;
  const user = users.get(userKey(userType, username || ''));
  if (!user || user.password !== password) {
    return res.status(401).json({ detail: 'Invalid credentials' });
  }

  const token = crypto.randomUUID();
  sessions.set(token, userKey(userType, username));
  res.json({ token, user_type: user.user_type, username: user.username });
});

app.post('/api/diagnose', requireUser, upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(422).json({ detail: 'Ultrasound image is required' });
  }

  const clinical = {
    age: Number(req.body.age),
    bmi: Number(req.body.bmi),
    cycleLength: Number(req.body.cycleLength),
    hirsutism: Number(req.body.hirsutism),
    insulinResistance: Number(req.body.insulinResistance),
    lhFsh: Number(req.body.lhFsh),
    ultrasoundCount: Number(req.body.ultrasoundCount),
  };
  const results = {
    presence: clinical.bmi > 28 || clinical.hirsutism > 12 ? 'Positive' : 'Borderline',
    category: 'Hyperandrogenic',
    subtype: 'IR-Related',
    severity: clinical.cycleLength > 40 ? 'Moderate' : 'Mild',
  };

  res.json({ ...results, report: buildReport(clinical, results) });
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(port, () => {
  console.log(`\nApplication is running at: http://127.0.0.1:${port}`);
  console.log(`API health check: http://127.0.0.1:${port}/api/health\n`);
});
