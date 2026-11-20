const express = require('express');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { fileTypeFromBuffer } = require('file-type');
const { z } = require('zod');
const mongoose = require('mongoose');
const { User, Diagnosis } = require('../models');
const { saveUpload, deleteUpload, readUpload } = require('../db');
const {
  clinicalInputSchema,
  runClinicalInference,
  runImageInference,
  isServiceUnavailable,
} = require('./inference');

const router = express.Router();
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      callback(null, true);
    } else {
      callback(new Error('Upload a JPEG, PNG, or WebP ultrasound image.'));
    }
  },
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { detail: 'Too many authentication attempts. Please wait and try again.' },
});
const diagnosisLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { detail: 'Too many research-model requests. Please try again later.' },
});

function requireAuth(req, res, next) {
  const authorization = req.get('Authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  try {
    if (!token) throw new Error('Missing token');
    const claims = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: claims.sub, role: claims.role, username: claims.username };
    next();
  } catch {
    res.status(401).json({ detail: 'Unauthorized. Sign in again to continue.' });
  }
}

function serializeDiagnosis(record) {
  return {
    _id: record._id.toString(),
    clinicalFeatures: record.clinicalFeatures,
    clinicalPrediction: record.clinicalPrediction,
    imagePrediction: record.imagePrediction,
    clinicalModelVersion: record.clinicalModelVersion,
    imageModelVersion: record.imageModelVersion,
    heatmapAvailable: Boolean(record.heatmapFileId),
    createdAt: record.createdAt,
    feedback: record.feedback,
  };
}

router.get('/health', (_req, res) => {
  const connected = require('mongoose').connection.readyState === 1;
  res.status(connected ? 200 : 503).json({
    status: connected ? 'ok' : 'degraded',
    database: connected ? 'connected' : 'disconnected',
  });
});

router.get('/models/health', async (_req, res, next) => {
  const serviceUrl = process.env.ML_SERVICE_URL || 'http://127.0.0.1:8001';
  try {
    const response = await fetch(`${serviceUrl}/health`, {
      signal: AbortSignal.timeout(3_000),
    });
    const status = await response.json();
    res.status(response.ok ? 200 : 503).json(status);
  } catch (error) {
    if (isServiceUnavailable(error)) {
      return res.status(503).json({
        status: 'unavailable',
        clinicalModelReady: false,
        imageModelReady: false,
        detail: 'The Python inference service is not reachable.',
      });
    }
    next(error);
  }
});

router.post('/auth/register', authLimiter, async (req, res, next) => {
  const schema = z.object({
    role: z.enum(['Doctor', 'Patient']),
    username: z.string().trim().min(3).max(40).regex(/^[\p{L}\p{N}_.-]+$/u),
    email: z.string().trim().email().max(254),
    password: z.string().min(10).max(128),
    doctorRegistrationKey: z.string().max(128).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({ detail: parsed.error.issues[0]?.message || 'Invalid registration details.' });
  }
  if (
    parsed.data.role === 'Doctor'
    && (!process.env.DOCTOR_REGISTRATION_KEY
      || parsed.data.doctorRegistrationKey !== process.env.DOCTOR_REGISTRATION_KEY)
  ) {
    return res.status(403).json({ detail: 'Doctor registration requires a valid invitation key.' });
  }

  try {
    const { username, email, role, password } = parsed.data;
    const user = await User.create({
      username,
      usernameLower: username.toLowerCase(),
      email,
      emailLower: email.toLowerCase(),
      role,
      passwordHash: await bcrypt.hash(password, 12),
    });
    res.status(201).json({
      message: 'Registration successful.',
      user: { id: user.id, username: user.username, role: user.role },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ detail: 'That username or email is already registered.' });
    }
    next(error);
  }
});

router.post('/auth/login', authLimiter, async (req, res, next) => {
  const parsed = z.object({
    role: z.enum(['Doctor', 'Patient']),
    username: z.string().trim().min(1).max(40),
    password: z.string().min(1).max(128),
  }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({ detail: 'Enter a valid account type, username, and password.' });
  }

  try {
    const user = await User.findOne({
      usernameLower: parsed.data.username.toLowerCase(),
      role: parsed.data.role,
    }).select('+passwordHash');
    if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
      return res.status(401).json({ detail: 'Invalid username, role, or password.' });
    }

    const token = jwt.sign(
      { sub: user.id, role: user.role, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '8h', issuer: 'pcos-research-dashboard' }
    );
    res.json({
      token,
      user: { id: user.id, username: user.username, role: user.role },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/auth/me', requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('username role');
    if (!user) return res.status(401).json({ detail: 'Account no longer exists.' });
    res.json({ id: user.id, username: user.username, role: user.role });
  } catch (error) {
    next(error);
  }
});

router.post('/diagnoses', requireAuth, diagnosisLimiter, imageUpload.single('image'), async (req, res, next) => {
  const featuresText = req.body.clinicalFeatures;
  let clinicalFeatures;
  try {
    clinicalFeatures = JSON.parse(featuresText);
  } catch {
    return res.status(422).json({ detail: 'Clinical features must be valid JSON.' });
  }
  const parsedFeatures = clinicalInputSchema.safeParse(clinicalFeatures);
  if (!parsedFeatures.success) {
    return res.status(422).json({ detail: parsedFeatures.error.issues[0]?.message || 'Clinical values are invalid.' });
  }
  if (!req.file) return res.status(422).json({ detail: 'An ultrasound image is required.' });

  const detectedType = await fileTypeFromBuffer(req.file.buffer);
  if (!detectedType || !['image/jpeg', 'image/png', 'image/webp'].includes(detectedType.mime)) {
    return res.status(422).json({ detail: 'The uploaded file is not a supported image.' });
  }

  let imageFileId;
  let heatmapFileId;
  try {
    const [clinicalPrediction, imagePrediction] = await Promise.all([
      runClinicalInference(parsedFeatures.data),
      runImageInference(req.file.buffer, detectedType.mime),
    ]);
    const heatmap = imagePrediction.heatmapPngBase64
      ? Buffer.from(imagePrediction.heatmapPngBase64, 'base64')
      : null;
    imageFileId = await saveUpload(
      req.file.buffer,
      `ultrasound-${Date.now()}.${detectedType.ext}`,
      detectedType.mime,
      req.user.id
    );
    if (heatmap) {
      heatmapFileId = await saveUpload(
        heatmap,
        `grad-cam-${Date.now()}.png`,
        'image/png',
        req.user.id
      );
    }
    const { heatmapPngBase64: _heatmapPngBase64, ...storedImagePrediction } = imagePrediction;
    const diagnosis = await Diagnosis.create({
      ownerId: req.user.id,
      clinicalFeatures: parsedFeatures.data,
      clinicalPrediction,
      imagePrediction: storedImagePrediction,
      imageFileId,
      heatmapFileId: heatmapFileId || null,
      clinicalModelVersion: clinicalPrediction.modelVersion,
      imageModelVersion: imagePrediction.modelVersion,
    });
    res.status(201).json(serializeDiagnosis(diagnosis));
  } catch (error) {
    await Promise.all([imageFileId, heatmapFileId].filter(Boolean).map((id) => deleteUpload(id)));
    if (isServiceUnavailable(error)) {
      error.status = 503;
      error.message = 'The model service is unavailable. Start the inference service and train both models before submitting.';
    }
    next(error);
  }
});

router.get('/diagnoses', requireAuth, async (req, res, next) => {
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 50);
  try {
    const items = await Diagnosis.find({ ownerId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    res.json({ items: items.map(serializeDiagnosis) });
  } catch (error) {
    next(error);
  }
});

router.get('/diagnoses/:id/heatmap', requireAuth, async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ detail: 'Report not found.' });
  }
  try {
    const diagnosis = await Diagnosis.findOne({ _id: req.params.id, ownerId: req.user.id }).lean();
    if (!diagnosis?.heatmapFileId) return res.status(404).json({ detail: 'Heatmap not found.' });
    res.type('image/png');
    const stream = readUpload(diagnosis.heatmapFileId);
    stream.on('error', next);
    stream.pipe(res);
  } catch (error) {
    next(error);
  }
});

router.post('/diagnoses/:id/feedback', requireAuth, async (req, res, next) => {
  if (req.user.role !== 'Doctor') {
    return res.status(403).json({ detail: 'Only a Doctor account can add review feedback.' });
  }
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ detail: 'Report not found.' });
  }
  const parsed = z.object({
    reviewedLabel: z.enum(['positive', 'negative']),
    note: z.string().trim().max(1000).optional().default(''),
  }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({ detail: 'Provide a valid reviewed label and optional note.' });
  }
  try {
    const record = await Diagnosis.findOne({ _id: req.params.id, ownerId: req.user.id });
    if (!record) return res.status(404).json({ detail: 'Report not found.' });
    record.feedback = {
      ...parsed.data,
      reviewedBy: req.user.id,
      reviewedAt: new Date(),
    };
    await record.save();
    res.json({ message: 'Feedback saved for later review; model weights were not changed.' });
  } catch (error) {
    next(error);
  }
});

router.delete('/diagnoses/:id', requireAuth, async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ detail: 'Report not found.' });
  }
  try {
    const diagnosis = await Diagnosis.findOne({ _id: req.params.id, ownerId: req.user.id });
    if (!diagnosis) return res.status(404).json({ detail: 'Report not found.' });
    await Promise.all(
      [diagnosis.imageFileId, diagnosis.heatmapFileId]
        .filter(Boolean)
        .map((id) => deleteUpload(id))
    );
    await diagnosis.deleteOne();
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

module.exports = router;
