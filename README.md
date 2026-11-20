# PCOS Explainable Research Dashboard

This project is a React + Node.js + MongoDB application with a separate Python inference service. It is a research prototype, not a clinical diagnostic device.

## Stack and responsibilities

- **React + Vite** (`frontend/`) — responsive dashboard, account forms, clinical input, separate model results, report history, language selection, and TXT report download.
- **Node.js + Express** (`server.js`, `backend/api/`) — API, validation, password hashing, JWT authentication, upload checks, and the application-facing inference gateway.
- **MongoDB + Mongoose** (`backend/db.js`, `backend/models.js`) — users, clinical features, model outputs, clinician review feedback, and report metadata.
- **MongoDB GridFS** — ultrasound and Grad-CAM++ image files, stored separately from bounded diagnosis documents.
- **Python + FastAPI** (`backend/main.py`) — independent clinical and ultrasound inference endpoints.
- **scikit-learn, imbalanced-learn, SHAP, PyTorch, OpenCV, Pillow, pandas** (`backend/ml/`) — feature preprocessing, five-fold training/calibration, clinical explanations, and image preprocessing/attention maps.

## Important dataset limitation

The supplied clinical spreadsheet has 468 labeled records (`PCOS_Diagnosis`: 260 negative, 208 positive). The image ZIP has `infected` (6,784) and `noninfected` (5,000) images, confirmed by the project owner as PCOS-positive and PCOS-negative labels. Exact-content deduplication leaves 3,996 image files (3,184 positive, 812 negative); the image trainer uses class-weighted loss. The archives do **not** contain a patient-level matching key.

For that reason, the application trains and presents two independent estimates. It does not join unrelated people, run cross-attention, or report a fused multimodal diagnosis. The clinical and image training metrics are evaluated separately. Feedback is saved for review but never changes trained weights automatically.

## Local setup

Requirements: Node.js 20+, Python 3.10+, and a reachable MongoDB deployment (local MongoDB or Atlas).

1. Install Node packages:
   ```powershell
   npm install
   ```
2. Create a Python environment and install the model/inference dependencies:
   ```powershell
   py -m venv .venv
   .\.venv\Scripts\Activate.ps1
   pip install -r backend\requirements.txt
   ```
3. Create a local `.env` from `.env.example`. Set `MONGODB_URI`, replace `JWT_SECRET` with a random secret at least 32 characters long, and set a private `DOCTOR_REGISTRATION_KEY` if Doctor registration is needed. Without that key, public Doctor account creation is disabled. Do not commit `.env`.
4. Train the separate model ensembles from the provided archives:
   ```powershell
   python -m backend.ml.train `
     --clinical-archive "C:\Users\malot\Desktop\SDC 2\archive (3) (2).zip" `
     --image-archive "C:\Users\malot\Desktop\SDC 2\archive (2).zip"
   ```
   Training runs stratified five-fold evaluation. Exact duplicate ultrasound files are removed before splitting to reduce image leakage. Clinical missing numeric values and 1st/99th percentile outlier bounds are fitted inside each training fold. SMOTE is applied inside clinical training folds only when class imbalance is substantial; it is skipped for the observed clinical label ratio (260:208). The image model uses class-weighted loss rather than synthetic image oversampling. Image calibration temperatures are fitted on inner validation data.
5. Start the Vite UI, Express API, and FastAPI model service:
   ```powershell
   npm run dev
   ```
   Open `http://127.0.0.1:5173`.

The model service reports itself as not ready until all five model checkpoints for both modalities exist under `backend/models/`. The API returns an explicit unavailable response rather than generating rule-based or simulated predictions.

For a production frontend build:

```powershell
npm run build
npm start
```

## Persistence and access

- Passwords are stored as bcrypt hashes; API tokens expire after eight hours.
- Each account can view only its own reports and associated heatmaps.
- Image uploads are restricted to JPEG/PNG/WebP and 8 MB, then stored in GridFS.
- Doctor feedback is attached to the submitting account's own saved report and is not automatically used for retraining.

Configure TLS, secrets, backup/retention, authorization policies, and a healthcare privacy/compliance review before using real patient data. This prototype does not establish clinical validity or regulatory compliance.

## Validation

```powershell
npm test
npm run build
```

Python model smoke tests:

```powershell
python -m unittest backend.ml.test_pipeline
```

Python inference and training dependencies are declared in `backend/requirements.txt`. Model metrics are written to `backend/models/training_metrics.json` after training.
