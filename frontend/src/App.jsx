import { useEffect, useMemo, useState } from 'react';

const emptyClinical = {
  age: '',
  bmi: '',
  cycleLength: '',
  hirsutism: '',
  homaIr: '',
  lhFsh: '',
  follicleCountLeft: '',
  follicleCountRight: '',
};

const translations = {
  en: {
    reportTitle: 'PCOS Research Model Report',
    clinical: 'Clinical model',
    ultrasound: 'Ultrasound model',
    positive: 'PCOS-positive estimate',
    negative: 'PCOS-negative estimate',
    probability: 'Model probability',
    confidence: 'Model confidence',
    uncertainty: 'Model uncertainty',
    band: 'Probability band',
    disclaimer: 'Research output only. These separate model estimates are not a diagnosis or medical advice.',
    noPairing: 'The training datasets are unpaired. Clinical and image estimates are shown separately and are not fused.',
    factors: 'Clinical feature contributions',
    recommendation: 'Discuss these experimental results with a qualified clinician. Do not use them to make treatment decisions.',
    scoreBandNote: 'Probability bands are descriptive model-score ranges, not clinical risk thresholds.',
  },
  hi: {
    reportTitle: 'PCOS शोध मॉडल रिपोर्ट',
    clinical: 'नैदानिक मॉडल',
    ultrasound: 'अल्ट्रासाउंड मॉडल',
    positive: 'PCOS-सकारात्मक अनुमान',
    negative: 'PCOS-नकारात्मक अनुमान',
    probability: 'मॉडल संभावना',
    confidence: 'मॉडल विश्वास',
    uncertainty: 'मॉडल अनिश्चितता',
    band: 'संभावना स्तर',
    disclaimer: 'केवल शोध हेतु। ये अलग-अलग मॉडल अनुमान निदान या चिकित्सीय सलाह नहीं हैं।',
    noPairing: 'प्रशिक्षण डेटासेट में रोगी-स्तर का मिलान नहीं है। अनुमान अलग दिखाए गए हैं और जोड़े नहीं गए हैं।',
    factors: 'नैदानिक विशेषताओं का योगदान',
    recommendation: 'इन प्रायोगिक परिणामों पर योग्य चिकित्सक से चर्चा करें। उपचार के निर्णय हेतु इनका उपयोग न करें।',
    scoreBandNote: 'संभावना स्तर केवल मॉडल स्कोर की सीमा हैं, चिकित्सीय जोखिम के मानदंड नहीं।',
  },
  es: {
    reportTitle: 'Informe del modelo de investigación de SOP',
    clinical: 'Modelo clínico',
    ultrasound: 'Modelo de ultrasonido',
    positive: 'Estimación positiva de SOP',
    negative: 'Estimación negativa de SOP',
    probability: 'Probabilidad del modelo',
    confidence: 'Confianza del modelo',
    uncertainty: 'Incertidumbre del modelo',
    band: 'Rango de probabilidad',
    disclaimer: 'Solo para investigación. Estas estimaciones separadas no son un diagnóstico ni consejo médico.',
    noPairing: 'Los conjuntos de entrenamiento no están emparejados. Las estimaciones se muestran por separado y no se fusionan.',
    factors: 'Contribuciones de características clínicas',
    recommendation: 'Comente estos resultados experimentales con un profesional clínico. No los use para tomar decisiones de tratamiento.',
    scoreBandNote: 'Los rangos son descriptivos y no representan umbrales clínicos de riesgo.',
  },
};

function readSavedUser() {
  try {
    return JSON.parse(sessionStorage.getItem('pcos-user') || 'null');
  } catch {
    sessionStorage.removeItem('pcos-user');
    return null;
  }
}

async function apiRequest(path, { token, ...options } = {}) {
  const headers = new Headers(options.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`/api${path}`, { ...options, headers });
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json()
    : null;

  if (!response.ok) {
    const error = new Error(payload?.detail || 'The request could not be completed.');
    error.status = response.status;
    throw error;
  }
  return payload;
}

function percent(value) {
  return `${(Number(value) * 100).toFixed(1)}%`;
}

function createReport(diagnosis, language) {
  const labels = translations[language] || translations.en;
  const clinical = diagnosis.clinicalFeatures || {};
  const clinicalPrediction = diagnosis.clinicalPrediction || {};
  const imagePrediction = diagnosis.imagePrediction || {};
  const factors = (clinicalPrediction.explanations || [])
    .map((item) => `- ${item.feature}: ${Number(item.contribution).toFixed(4)}`)
    .join('\n');

  return [
    labels.reportTitle,
    `Date: ${new Date(diagnosis.createdAt || Date.now()).toLocaleString()}`,
    '',
    'Clinical inputs:',
    `Age: ${clinical.age ?? '-'}`,
    `BMI: ${clinical.bmi ?? '-'}`,
    `Menstrual cycle length: ${clinical.cycleLength ?? '-'} days`,
    `Hirsutism score: ${clinical.hirsutism ?? '-'}`,
    `HOMA-IR: ${clinical.homaIr ?? '-'}`,
    `LH/FSH ratio: ${clinical.lhFsh ?? '-'}`,
    `Follicle count (left/right): ${clinical.follicleCountLeft ?? '-'} / ${clinical.follicleCountRight ?? '-'}`,
    '',
    `${labels.clinical}:`,
    `Estimate: ${clinicalPrediction.label || '-'}`,
    `${labels.probability}: ${clinicalPrediction.probabilityPositive == null ? '-' : percent(clinicalPrediction.probabilityPositive)}`,
    `${labels.confidence}: ${clinicalPrediction.confidence == null ? '-' : percent(clinicalPrediction.confidence)}`,
    `${labels.uncertainty}: ${clinicalPrediction.uncertainty == null ? '-' : percent(clinicalPrediction.uncertainty)}`,
    `${labels.band}: ${clinicalPrediction.probabilityBand || '-'}`,
    '',
    `${labels.factors}:`,
    factors || '- Not available',
    '',
    `${labels.ultrasound}:`,
    `Estimate: ${imagePrediction.label || '-'}`,
    `${labels.probability}: ${imagePrediction.probabilityPositive == null ? '-' : percent(imagePrediction.probabilityPositive)}`,
    `${labels.confidence}: ${imagePrediction.confidence == null ? '-' : percent(imagePrediction.confidence)}`,
    `${labels.uncertainty}: ${imagePrediction.uncertainty == null ? '-' : percent(imagePrediction.uncertainty)}`,
    `${labels.band}: ${imagePrediction.probabilityBand || '-'}`,
    '',
    `Clinical model version: ${diagnosis.clinicalModelVersion || '-'}`,
    `Ultrasound model version: ${diagnosis.imageModelVersion || '-'}`,
    labels.noPairing,
    labels.scoreBandNote,
    labels.disclaimer,
    labels.recommendation,
  ].join('\n');
}

function ProbabilityCard({ title, prediction }) {
  if (!prediction) return null;
  return (
    <article className="summary-card model-result-card">
      <h3>{title}</h3>
      <p className="model-label">{prediction.label}</p>
      <dl className="result-metrics">
        <div><dt>PCOS-positive probability</dt><dd>{percent(prediction.probabilityPositive)}</dd></div>
        <div><dt>Confidence</dt><dd>{percent(prediction.confidence)}</dd></div>
        <div><dt>Uncertainty</dt><dd>{percent(prediction.uncertainty)}</dd></div>
        <div><dt>Probability band</dt><dd>{prediction.probabilityBand}</dd></div>
        {prediction.validationMetrics && (
          <>
            <div><dt>5-fold validation AUC</dt><dd>{Number(prediction.validationMetrics.rocAuc).toFixed(3)}</dd></div>
            <div><dt>5-fold validation F1</dt><dd>{Number(prediction.validationMetrics.f1).toFixed(3)}</dd></div>
            <div><dt>5-fold Brier score</dt><dd>{Number(prediction.validationMetrics.brierScore).toFixed(3)}</dd></div>
          </>
        )}
      </dl>
    </article>
  );
}

export default function App() {
  const [token, setToken] = useState(() => sessionStorage.getItem('pcos-token'));
  const [user, setUser] = useState(readSavedUser);
  const [authMode, setAuthMode] = useState('login');
  const [authRole, setAuthRole] = useState('Patient');
  const [authBusy, setAuthBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [history, setHistory] = useState([]);
  const [modelStatus, setModelStatus] = useState(null);
  const [diagnosis, setDiagnosis] = useState(null);
  const [language, setLanguage] = useState('en');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [heatmapUrl, setHeatmapUrl] = useState('');
  const reportText = useMemo(
    () => diagnosis ? createReport(diagnosis, language) : '',
    [diagnosis, language]
  );
  const text = translations[language] || translations.en;
  const modelsReady = Boolean(modelStatus?.clinicalModelReady && modelStatus?.imageModelReady);

  useEffect(() => {
    if (!imageFile) {
      setImagePreview('');
      return undefined;
    }
    const url = URL.createObjectURL(imageFile);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  useEffect(() => {
    if (!token || !diagnosis?._id) {
      setHeatmapUrl('');
      return undefined;
    }
    setHeatmapUrl('');
    let objectUrl;
    let cancelled = false;
    fetch(`/api/diagnoses/${diagnosis._id}/heatmap`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((response) => response.ok ? response.blob() : null)
      .then((imageBlob) => {
        if (!imageBlob || cancelled) return;
        objectUrl = URL.createObjectURL(imageBlob);
        setHeatmapUrl(objectUrl);
      })
      .catch(() => setHeatmapUrl(''));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [diagnosis?._id, token]);

  useEffect(() => {
    apiRequest('/models/health')
      .then(setModelStatus)
      .catch((requestError) => setModelStatus({
        clinicalModelReady: false,
        imageModelReady: false,
        detail: requestError.message,
      }));
  }, []);

  useEffect(() => {
    if (!token) {
      setHistory([]);
      return;
    }
    apiRequest('/diagnoses?limit=20', { token })
      .then((payload) => setHistory(payload.items || []))
      .catch((requestError) => {
        setError(requestError.message);
        if (requestError.status === 401) {
          handleLogout();
        }
      });
  }, [token]);

  function handleLogout() {
    sessionStorage.removeItem('pcos-token');
    sessionStorage.removeItem('pcos-user');
    setToken(null);
    setUser(null);
    setHistory([]);
    setDiagnosis(null);
    setError('');
    setMessage('');
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    setAuthBusy(true);
    const form = new FormData(event.currentTarget);
    const role = form.get('role');
    const username = String(form.get('username') || '').trim();
    const email = String(form.get('email') || '').trim();
    const password = String(form.get('password') || '');
    const doctorRegistrationKey = String(form.get('doctorRegistrationKey') || '');

    try {
      if (authMode === 'register') {
        await apiRequest('/auth/register', {
          method: 'POST',
          body: JSON.stringify({ role, username, email, password, doctorRegistrationKey }),
        });
        setAuthMode('login');
        setMessage('Account created. Sign in with your username and password.');
      } else {
        const result = await apiRequest('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ role, username, password }),
        });
        sessionStorage.setItem('pcos-token', result.token);
        sessionStorage.setItem('pcos-user', JSON.stringify(result.user));
        setUser(result.user);
        setToken(result.token);
        setDiagnosis(null);
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleDiagnosisSubmit(event) {
    event.preventDefault();
    if (!imageFile) {
      setError('Choose an ultrasound image before requesting model estimates.');
      return;
    }
    setError('');
    setMessage('');
    setBusy(true);

    const form = new FormData(event.currentTarget);
    const clinicalFeatures = Object.fromEntries(
      Object.keys(emptyClinical).map((key) => [key, Number(form.get(key))])
    );
    const payload = new FormData();
    payload.append('clinicalFeatures', JSON.stringify(clinicalFeatures));
    payload.append('image', imageFile);

    try {
      const result = await apiRequest('/diagnoses', {
        method: 'POST',
        token,
        body: payload,
      });
      setDiagnosis(result);
      setHistory((items) => [result, ...items.filter((item) => item._id !== result._id)].slice(0, 20));
      setMessage('Separate research-model estimates are ready. They are not a clinical diagnosis.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  function handleDownload() {
    const link = document.createElement('a');
    const url = URL.createObjectURL(new Blob([reportText], { type: 'text/plain;charset=utf-8' }));
    link.href = url;
    link.download = `pcos-research-report-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(reportText);
      setMessage('Report copied to clipboard.');
    } catch {
      setError('Clipboard access is unavailable. You can still download the report.');
    }

    function handleSpeakReport() {
      if (!('speechSynthesis' in window)) {
        setError('Speech playback is not available in this browser.');
        return;
      }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(reportText);
      utterance.lang = { en: 'en-US', hi: 'hi-IN', es: 'es-ES' }[language];
      window.speechSynthesis.speak(utterance);
    }

    async function handleFeedbackSubmit(event) {
      event.preventDefault();
      if (!diagnosis?._id) return;
      const form = new FormData(event.currentTarget);
      const feedback = {
        reviewedLabel: form.get('reviewedLabel'),
        note: form.get('note'),
      };
      try {
        await apiRequest(`/diagnoses/${diagnosis._id}/feedback`, {
          method: 'POST',
          token,
          body: JSON.stringify(feedback),
        });
        setDiagnosis((current) => ({ ...current, feedback: { ...feedback, reviewedAt: new Date().toISOString() } }));
        setMessage('Doctor feedback saved for later review. Model weights were not changed.');
      } catch (requestError) {
        setError(requestError.message);
      }

      async function handleDeleteReport(recordId) {
        if (!window.confirm('Delete this saved report and its stored images? This cannot be undone.')) return;
        try {
          await apiRequest(`/diagnoses/${recordId}`, { method: 'DELETE', token });
          setHistory((items) => items.filter((item) => item._id !== recordId));
          setDiagnosis((current) => current?._id === recordId ? null : current);
          setMessage('Saved report and stored images deleted.');
        } catch (requestError) {
          setError(requestError.message);
        }
      }
    }
  }

  if (!token || !user) {
    return (
      <>
        <header className="hero">
          <div className="hero-content">
            <h1>PCOS Explainable Research Dashboard</h1>
            <p>Separate clinical and ultrasound model estimates, with transparent uncertainty and saved reports.</p>
          </div>
        </header>
        <main className="container">
          <section className="panel login-panel">
            <h2>{authMode === 'login' ? 'Sign in' : 'Create an account'}</h2>
            <p>Use a Doctor or Patient account to open the research dashboard.</p>
            {error && <p className="notice notice-error" role="alert">{error}</p>}
            {message && <p className="notice notice-success" role="status">{message}</p>}
            <form onSubmit={handleAuthSubmit}>
              <div className="field-grid">
                <div className="field-group">
                  <label htmlFor="role">Account type</label>
                  <select id="role" name="role" required value={authRole} onChange={(event) => setAuthRole(event.target.value)}>
                    <option value="Patient">Patient</option>
                    <option value="Doctor">Doctor</option>
                  </select>
                </div>
                <div className="field-group">
                  <label htmlFor="username">Username</label>
                  <input id="username" name="username" autoComplete="username" minLength="3" maxLength="40" required />
                </div>
              </div>
              {authMode === 'register' && (
                <div className="field-group">
                  <label htmlFor="email">Email</label>
                  <input id="email" name="email" type="email" autoComplete="email" required />
                </div>
              )}
              {authMode === 'register' && authRole === 'Doctor' && (
                <div className="field-group">
                  <label htmlFor="doctorRegistrationKey">Doctor invitation key</label>
                  <input id="doctorRegistrationKey" name="doctorRegistrationKey" type="password" autoComplete="off" required />
                </div>
              )}
              <div className="field-group">
                <label htmlFor="password">Password</label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                  minLength="10"
                  required
                />
              </div>
              <div className="form-actions">
                <button className="primary-button" type="submit" disabled={authBusy}>
                  {authBusy ? 'Please wait…' : authMode === 'login' ? 'Sign in' : 'Register'}
                </button>
                <button
                  className="link-button"
                  type="button"
                  onClick={() => { setAuthMode(authMode === 'login' ? 'register' : 'login'); setError(''); }}
                >
                  {authMode === 'login' ? 'Create an account' : 'Already have an account? Sign in'}
                </button>
              </div>
            </form>
          </section>
          <p className="medical-disclaimer">{text.disclaimer}</p>
        </main>
      </>
    );
  }

  return (
    <>
      <header className="hero">
        <div className="hero-content">
          <h1>PCOS Explainable Research Dashboard</h1>
          <p>Clinical and ultrasound estimates are produced by independent models trained on unpaired datasets.</p>
        </div>
      </header>
      <main className="container">
        <section className="user-banner">
          <div>
            <p className="small-label">Signed in as {user.role}</p>
            <h2>{user.username}</h2>
          </div>
          <button className="secondary-button logout-button" type="button" onClick={handleLogout}>Sign out</button>
        </section>

        {error && <p className="notice notice-error" role="alert">{error}</p>}
        {message && <p className="notice notice-success" role="status">{message}</p>}

        <section className="panel input-panel">
          <h2>Research model input</h2>
          <p>Submit the clinical measurements and the ultrasound image for independent model estimates.</p>
          <p className={modelsReady ? 'notice notice-success' : 'notice notice-warning'} role="status">
            {modelsReady
              ? 'Clinical and ultrasound model services are ready.'
              : `Model predictions are unavailable: ${modelStatus?.detail || modelStatus?.errors?.clinical || 'Train both model ensembles and start the inference service.'}`}
          </p>
          <p className="notice notice-warning">{text.noPairing} {text.disclaimer}</p>
          <form onSubmit={handleDiagnosisSubmit}>
            <div className="field-grid">
              <div className="field-group">
                <label htmlFor="age">Age (years)</label>
                <input id="age" name="age" type="number" min="10" max="70" required />
              </div>
              <div className="field-group">
                <label htmlFor="bmi">BMI</label>
                <input id="bmi" name="bmi" type="number" min="10" max="70" step="0.1" required />
              </div>
              <div className="field-group">
                <label htmlFor="cycleLength">Menstrual cycle length (days)</label>
                <input id="cycleLength" name="cycleLength" type="number" min="10" max="120" required />
              </div>
              <div className="field-group">
                <label htmlFor="hirsutism">Hirsutism score</label>
                <input id="hirsutism" name="hirsutism" type="number" min="0" max="36" required />
              </div>
              <div className="field-group">
                <label htmlFor="homaIr">HOMA-IR</label>
                <input id="homaIr" name="homaIr" type="number" min="0" max="100" step="0.1" required />
              </div>
              <div className="field-group">
                <label htmlFor="lhFsh">LH/FSH ratio</label>
                <input id="lhFsh" name="lhFsh" type="number" min="0" max="30" step="0.1" required />
              </div>
              <div className="field-group">
                <label htmlFor="follicleCountLeft">Left ovary follicle count</label>
                <input id="follicleCountLeft" name="follicleCountLeft" type="number" min="0" max="100" required />
              </div>
              <div className="field-group">
                <label htmlFor="follicleCountRight">Right ovary follicle count</label>
                <input id="follicleCountRight" name="follicleCountRight" type="number" min="0" max="100" required />
              </div>
            </div>
            <div className="upload-card">
              <label className="upload-label" htmlFor="imageUpload">Ovarian ultrasound image</label>
              <input
                id="imageUpload"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                required
                onChange={(event) => setImageFile(event.target.files?.[0] || null)}
              />
              {imagePreview && <img className="input-image-preview" src={imagePreview} alt="Selected ultrasound preview" />}
            </div>
            <button className="primary-button" type="submit" disabled={busy || !modelsReady}>
              {busy ? 'Calculating separate estimates…' : modelsReady ? 'Run research models' : 'Models not ready'}
            </button>
          </form>
        </section>

        {diagnosis && (
          <section className="panel results-panel" aria-live="polite">
            <div className="panel-header">
              <div>
                <h2>Separate model results</h2>
                <p className="small-label">Report ID: {diagnosis._id}</p>
              </div>
              <span className="status-badge">Research only</span>
            </div>
            <p className="notice notice-warning">{text.noPairing} {text.disclaimer}</p>
            <div className="summary-grid">
              <ProbabilityCard title={text.clinical} prediction={diagnosis.clinicalPrediction} />
              <ProbabilityCard title={text.ultrasound} prediction={diagnosis.imagePrediction} />
            </div>

            {diagnosis.clinicalPrediction?.explanations?.length > 0 && (
              <section className="explain-card">
                <h3>Clinical model feature contributions</h3>
                <p>Local SHAP contributions from the clinical model; these do not explain or alter the image estimate.</p>
                <div className="shap-list">
                  {diagnosis.clinicalPrediction.explanations.map((item) => (
                    <div className="shap-item" key={item.feature}>
                      <span>{item.feature}</span>
                      <span className="shap-value">{Number(item.contribution).toFixed(4)}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <div className="explain-card">
              <h3>Ultrasound model explanation (Grad-CAM++)</h3>
              {heatmapUrl
                ? <img className="heatmap-preview" src={heatmapUrl} alt="Grad-CAM++ model attention heatmap" />
                : <p>Heatmap unavailable for this saved result.</p>}
              <p>Highlighted regions indicate model attention, not a clinical finding.</p>
            </div>

            <div className="report-card">
              <div className="report-header">
                <h3>Research report</h3>
                <div className="report-language">
                  <label htmlFor="reportLanguage">Report language</label>
                  <select id="reportLanguage" value={language} onChange={(event) => setLanguage(event.target.value)}>
                    <option value="en">English</option>
                    <option value="hi">हिन्दी</option>
                    <option value="es">Español</option>
                  </select>
                </div>
              </div>
              <textarea aria-label="Research report" readOnly value={reportText} />
              <div className="report-actions">
                <button className="secondary-button" type="button" onClick={handleCopy}>Copy report</button>
                <button className="secondary-button" type="button" onClick={handleDownload}>Download report</button>
                <button className="secondary-button" type="button" onClick={handleSpeakReport}>Read report aloud</button>
              </div>
            </div>
            {user.role === 'Doctor' && (
              <form className="feedback-form" onSubmit={handleFeedbackSubmit}>
                <h3>Doctor review feedback</h3>
                <p>Feedback is stored for review and does not automatically retrain either model.</p>
                <div className="field-group">
                  <label htmlFor="reviewedLabel">Clinician-reviewed reference label</label>
                  <select id="reviewedLabel" name="reviewedLabel" required defaultValue={diagnosis.feedback?.reviewedLabel || ''}>
                    <option value="" disabled>Select label</option>
                    <option value="positive">PCOS positive</option>
                    <option value="negative">PCOS negative</option>
                  </select>
                </div>
                <div className="field-group">
                  <label htmlFor="feedbackNote">Optional note</label>
                  <textarea id="feedbackNote" name="note" maxLength="1000" defaultValue={diagnosis.feedback?.note || ''} />
                </div>
                <button className="secondary-button" type="submit">Save review feedback</button>
              </form>
            )}
          </section>
        )}

        <section className="panel history-panel">
          <div className="panel-header">
            <div>
              <h2>Saved reports</h2>
              <p>Your account’s recent research submissions.</p>
            </div>
            <button
              className="secondary-button"
              type="button"
              onClick={() => apiRequest('/diagnoses?limit=20', { token }).then((data) => setHistory(data.items || [])).catch((e) => setError(e.message))}
            >
              Refresh
            </button>
          </div>
          {history.length === 0
            ? <p>No saved reports yet. Model artifacts must be trained before a submission can run.</p>
            : (
              <ul className="history-list">
                {history.map((item) => (
                  <li key={item._id}>
                    <div>
                      <strong>{new Date(item.createdAt).toLocaleString()}</strong>
                      <span>Clinical {item.clinicalPrediction?.label || '-'} · Ultrasound {item.imagePrediction?.label || '-'}</span>
                    </div>
                    <div className="history-actions">
                      <button className="link-button" type="button" onClick={() => setDiagnosis(item)}>Open report</button>
                      <button className="link-button delete-link" type="button" onClick={() => handleDeleteReport(item._id)}>Delete</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
        </section>
        <p className="medical-disclaimer">{text.recommendation}</p>
      </main>
      <footer className="footer">
        <p>Experimental research software. Model estimates require independent clinical validation.</p>
      </footer>
    </>
  );
}
