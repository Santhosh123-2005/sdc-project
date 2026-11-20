const loginForm = document.getElementById('loginForm');
const loginSection = document.getElementById('loginSection');
const appContent = document.getElementById('appContent');
const userBanner = document.getElementById('userBanner');
const userGreeting = document.getElementById('userGreeting');
const userRoleText = document.getElementById('userRoleText');
const diagnosisForm = document.getElementById('diagnosisForm');
const imageUpload = document.getElementById('imageUpload');
const imagePreview = document.getElementById('imagePreview');
const resultsSection = document.getElementById('resultsSection');
const presenceValue = document.getElementById('presenceValue');
const categoryValue = document.getElementById('categoryValue');
const subtypeValue = document.getElementById('subtypeValue');
const severityValue = document.getElementById('severityValue');
const shapList = document.getElementById('shapList');
const camPreview = document.getElementById('camPreview');
const reportText = document.getElementById('reportText');
const copyReportButton = document.getElementById('copyReportButton');
const reportLanguage = document.getElementById('reportLanguage');
const diagnosisStatus = document.getElementById('diagnosisStatus');
const toggleMode = document.getElementById('toggleMode');
const submitButton = document.getElementById('submitButton');
const confirmPasswordRow = document.getElementById('confirmPasswordRow');
const logoutButton = document.getElementById('logoutButton');

let authMode = 'login';
let authToken = null;
const API_BASE = `${window.location.origin}/api`;

const sampleSHAP = [
  { label: 'BMI', score: '+0.30' },
  { label: 'Menstrual cycle length', score: '+0.18' },
  { label: 'LH/FSH ratio', score: '+0.12' },
  { label: 'Hirsutism score', score: '+0.08' },
  { label: 'Follicle count', score: '+0.07' }
];

function renderImagePreview(file) {
  if (!file) {
    imagePreview.innerHTML = '<span>No image selected</span>';
    return;
  }

  imagePreview.innerHTML = `<span class="selected-file">Selected: ${file.name}</span>`;
  const reader = new FileReader();
  reader.onload = () => {
    imagePreview.innerHTML = `
      <img src="${reader.result}" alt="Ultrasound preview" />
      <span class="selected-file">${file.name}</span>
    `;
  };
  reader.onerror = () => {
    imagePreview.innerHTML = `<span class="upload-error">Could not preview ${file.name}</span>`;
  };
  reader.readAsDataURL(file);
}

imageUpload.addEventListener('change', (event) => {
  const file = event.target.files[0];
  renderImagePreview(file);
});

function renderSHAP() {
  shapList.innerHTML = sampleSHAP
    .map(
      (item) =>
        `<div class="shap-item"><span>${item.label}</span><span class="shap-value">${item.score}</span></div>`
    )
    .join('');
}

const reportTranslations = {
  en: {
    title: 'PCOS Diagnostic Report', patientAge: 'Patient Age', cycleLength: 'Menstrual Cycle Length', conclusion: 'Conclusion', presence: 'Disease Presence', category: 'Category', subtype: 'Subtype', severity: 'Severity', interpretation: 'Interpretation', recommendation: 'Recommendation', years: 'years', days: 'days', explanation: 'The model integrates clinical features with ultrasound imaging using a lightweight multimodal fusion pipeline. SHAP highlights BMI, cycle irregularity, and LH/FSH ratio as top clinical contributors, while Grad-CAM++ identifies the most informative ovarian ultrasound regions.', advice: 'Review the report with a clinician. Further endocrine evaluation and management should be based on the patient’s full clinical presentation and laboratory data.', values: {}
  },
  hi: {
    title: 'PCOS निदान रिपोर्ट', patientAge: 'रोगी की आयु', cycleLength: 'मासिक चक्र की अवधि', conclusion: 'निष्कर्ष', presence: 'रोग की स्थिति', category: 'श्रेणी', subtype: 'उप-प्रकार', severity: 'गंभीरता', interpretation: 'व्याख्या', recommendation: 'सुझाव', years: 'वर्ष', days: 'दिन', explanation: 'यह मॉडल नैदानिक जानकारी और अल्ट्रासाउंड इमेजिंग को मिलाकर विश्लेषण करता है। SHAP ने BMI, मासिक चक्र की अनियमितता और LH/FSH अनुपात को प्रमुख कारक बताया है, जबकि Grad-CAM++ अंडाशय के सबसे महत्वपूर्ण इमेजिंग क्षेत्रों को दिखाता है।', advice: 'इस रिपोर्ट की समीक्षा किसी चिकित्सक के साथ करें। आगे की हार्मोन जाँच और उपचार रोगी की पूरी चिकित्सीय स्थिति और प्रयोगशाला परिणामों के आधार पर होना चाहिए।', values: { Positive: 'सकारात्मक', Borderline: 'सीमांत', Hyperandrogenic: 'हाइपरएंड्रोजेनिक', 'IR-Related': 'इंसुलिन प्रतिरोध से संबंधित', Moderate: 'मध्यम', Mild: 'हल्का' }
  },
  es: {
    title: 'Informe de diagnóstico de SOP', patientAge: 'Edad del paciente', cycleLength: 'Duración del ciclo menstrual', conclusion: 'Conclusión', presence: 'Presencia de la enfermedad', category: 'Categoría', subtype: 'Subtipo', severity: 'Gravedad', interpretation: 'Interpretación', recommendation: 'Recomendación', years: 'años', days: 'días', explanation: 'El modelo combina los datos clínicos con las imágenes de ultrasonido mediante un análisis multimodal. SHAP identifica el IMC, la irregularidad del ciclo y la proporción LH/FSH como factores principales, mientras Grad-CAM++ muestra las regiones ováricas más importantes.', advice: 'Revise este informe con un profesional de la salud. La evaluación hormonal y el tratamiento deben basarse en la situación clínica completa y en los resultados de laboratorio.', values: { Positive: 'Positivo', Borderline: 'Límite', Hyperandrogenic: 'Hiperandrogénico', 'IR-Related': 'Relacionado con resistencia a la insulina', Moderate: 'Moderado', Mild: 'Leve' }
  }
};

function formatReport(data, language = 'en') {
  const labels = reportTranslations[language] || reportTranslations.en;
  const translateValue = (value) => labels.values[value] || value;
  return `${labels.title}\n\n${labels.patientAge}: ${data.age} ${labels.years}\nBMI: ${data.bmi}\n${labels.cycleLength}: ${data.cycleLength} ${labels.days}\n\n${labels.conclusion}:\n- ${labels.presence}: ${translateValue(data.presence)}\n- ${labels.category}: ${translateValue(data.category)}\n- ${labels.subtype}: ${translateValue(data.subtype)}\n- ${labels.severity}: ${translateValue(data.severity)}\n\n${labels.interpretation}:\n${labels.explanation}\n\n${labels.recommendation}:\n${labels.advice}`;
}

function simulateDiagnosis(formData) {
  return new Promise((resolve) => {
    diagnosisStatus.textContent = 'Evaluating';

    setTimeout(() => {
      const result = {
        presence: formData.bmi > 28 || formData.hirsutism > 12 ? 'Positive' : 'Borderline',
        category: 'Hyperandrogenic',
        subtype: 'IR-Related',
        severity: formData.cycleLength > 40 ? 'Moderate' : 'Mild',
        age: formData.age,
        bmi: formData.bmi,
        cycleLength: formData.cycleLength
      };
      resolve(result);
    }, 1300);
  });
}

function updateResults(result) {
  presenceValue.textContent = result.presence;
  categoryValue.textContent = result.category;
  subtypeValue.textContent = result.subtype;
  severityValue.textContent = result.severity;
  reportText.value = formatReport(result, reportLanguage.value);
  reportText.dataset.result = JSON.stringify(result);
  camPreview.innerHTML = '<span>Grad-CAM++ overlay simulated for the uploaded image.</span>';
  diagnosisStatus.textContent = 'Completed';
  resultsSection.classList.remove('hidden');
}

function logout() {
  authToken = null;
  loginSection.classList.remove('hidden');
  appContent.classList.add('hidden');
  userBanner.classList.add('hidden');
  resultsSection.classList.add('hidden');
  diagnosisForm.reset();
  renderImagePreview(null);
  loginForm.reset();
  setAuthMode('login');
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const userType = document.getElementById('userType').value;
  const username = document.getElementById('username').value.trim();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const confirmPassword = document.getElementById('confirmPassword').value;

  if (!userType || !username || !email || !password) {
    alert('Please complete all fields to continue.');
    return;
  }

  if (authMode === 'register') {
    if (password !== confirmPassword) {
      alert('Passwords do not match. Please verify and try again.');
      return;
    }

    try {
      await registerUser({ user_type: userType, username, email, password });
      alert('Registration successful! Please sign in.');
      setAuthMode('login');
    } catch (error) {
      alert(error.message || 'Registration failed.');
    }
    return;
  }

  try {
    const auth = await loginUser({ user_type: userType, username, password });
    authToken = auth.token;
    loginSection.classList.add('hidden');
    appContent.classList.remove('hidden');
    userBanner.classList.remove('hidden');
    userGreeting.textContent = auth.username;
    userRoleText.textContent = auth.user_type;
  } catch (error) {
    alert(error.message || 'Invalid credentials. Please check your username and password or register a new account.');
  }
});

async function registerUser(payload) {
  const response = await fetch(`${API_BASE}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.detail || 'Registration error');
  }

  return response.json();
}

async function loginUser(payload) {
  const response = await fetch(`${API_BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.detail || 'Login failed');
  }

  return response.json();
}

function setAuthMode(mode) {
  authMode = mode;
  const heading = loginSection.querySelector('h2');
  const description = loginSection.querySelector('p');
  const emailField = document.getElementById('email');
  const confirmPassword = document.getElementById('confirmPassword');

  if (mode === 'register') {
    heading.textContent = 'Register';
    description.textContent = 'Create a Doctor or Patient account to access the PCOS diagnosis workspace.';
    submitButton.textContent = 'Register';
    toggleMode.textContent = 'Already have an account? Sign In';
    confirmPasswordRow.classList.remove('hidden');
    emailField.required = true;
    confirmPassword.required = true;
  } else {
    heading.textContent = 'Login';
    description.textContent = 'Sign in as a Doctor or Patient to access the PCOS diagnosis workspace.';
    submitButton.textContent = 'Sign In';
    toggleMode.textContent = 'Don\'t have an account? Register';
    confirmPasswordRow.classList.add('hidden');
    emailField.required = true;
    confirmPassword.required = false;
  }
}

toggleMode.addEventListener('click', () => {
  setAuthMode(authMode === 'login' ? 'register' : 'login');
});

logoutButton.addEventListener('click', logout);

setAuthMode('login');

diagnosisForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!authToken) {
    alert('Please login before submitting a diagnosis.');
    return;
  }
  if (!imageUpload.files.length) {
    alert('Please upload an ultrasound image before diagnosing.');
    return;
  }

  const data = new FormData();
  data.append('age', document.getElementById('age').value);
  data.append('bmi', document.getElementById('bmi').value);
  data.append('cycleLength', document.getElementById('cycleLength').value);
  data.append('hirsutism', document.getElementById('hirsutism').value);
  data.append('insulinResistance', document.getElementById('insulinResistance').value);
  data.append('lhFsh', document.getElementById('lhFsh').value);
  data.append('ultrasoundCount', document.getElementById('ultrasoundCount').value);
  data.append('image', imageUpload.files[0]);

  try {
    diagnosisStatus.textContent = 'Evaluating';
    const response = await fetch(`${API_BASE}/diagnose`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
      body: data,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || 'Diagnosis request failed');
    }

    const diagnosis = await response.json();
    renderSHAP();
    updateResults(diagnosis);
  } catch (error) {
    alert(error.message || 'Failed to submit diagnosis.');
    diagnosisStatus.textContent = 'Error';
  }
});

copyReportButton.addEventListener('click', () => {
  reportText.select();
  document.execCommand('copy');
  copyReportButton.textContent = 'Copied!';
  setTimeout(() => {
    copyReportButton.textContent = 'Copy Report';
  }, 1300);
});

reportLanguage.addEventListener('change', () => {
  if (reportText.dataset.result) {
    reportText.value = formatReport(JSON.parse(reportText.dataset.result), reportLanguage.value);
  }
});

// initial render
resultsSection.classList.add('hidden');
appContent.classList.add('hidden');
