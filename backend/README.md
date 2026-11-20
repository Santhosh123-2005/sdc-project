# PCOS Explainable AI Backend

This backend is built using FastAPI to support authentication and diagnostic inference endpoints for the PCOS web application.

## Files

- `main.py` - FastAPI application with register, login, and diagnose endpoints.
- `requirements.txt` - Python dependencies.

## Setup

1. Create and activate a Python environment:
   ```bash
   python -m venv venv
   .\venv\Scripts\activate
   ```
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Run the backend:
   ```bash
   uvicorn backend.main:app --reload --port 8000
   ```

## API routes

- `POST /api/register` - register a Doctor or Patient
- `POST /api/login` - login and receive a token
- `POST /api/diagnose` - submit clinical features + ultrasound image for diagnosis

## Notes

- This backend uses in-memory storage for demo purposes.
- Replace the `diagnose` stub with real model inference and explainability logic.
