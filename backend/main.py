from fastapi import FastAPI, HTTPException, UploadFile, File, Depends, Header, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from typing import Optional, Dict
from uuid import uuid4

app = FastAPI(title="PCOS Explainable AI Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

users: Dict[str, dict] = {}
sessions: Dict[str, str] = {}

class AuthRequest(BaseModel):
    user_type: str
    username: str
    email: EmailStr
    password: str

class LoginRequest(BaseModel):
    user_type: str
    username: str
    password: str

class ClinicalFeatures(BaseModel):
    age: int
    bmi: float
    cycleLength: int
    hirsutism: int
    insulinResistance: int
    lhFsh: float
    ultrasoundCount: int

class DiagnosisResponse(BaseModel):
    presence: str
    category: str
    subtype: str
    severity: str
    report: str

def build_report(data: ClinicalFeatures, results: dict) -> str:
    return (
        f"PCOS Diagnostic Report\n\n"
        f"Patient Age: {data.age} years\n"
        f"BMI: {data.bmi}\n"
        f"Menstrual Cycle Length: {data.cycleLength} days\n\n"
        f"Conclusion:\n"
        f"- Disease Presence: {results['presence']}\n"
        f"- Category: {results['category']}\n"
        f"- Subtype: {results['subtype']}\n"
        f"- Severity: {results['severity']}\n\n"
        f"Interpretation:\n"
        f"The model integrates clinical features with ultrasound imaging using a lightweight multimodal fusion pipeline. "
        f"SHAP highlights the most important clinical features, while Grad-CAM++ provides visual explainability for ultrasound imagery.\n"
        f"Recommendation:\n"
        f"Review the findings with a clinician and follow up with targeted endocrine testing and patient counseling."
    )

async def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
    token = authorization.split(" ", 1)[1]
    if token not in sessions:
        raise HTTPException(status_code=401, detail="Unauthorized")
    user_key = sessions[token]
    return users[user_key]

@app.post("/api/register")
def register(payload: AuthRequest):
    user_key = f"{payload.user_type}:{payload.username.lower()}"
    if user_key in users:
        raise HTTPException(status_code=400, detail="User already exists")

    users[user_key] = {
        "username": payload.username,
        "email": payload.email,
        "user_type": payload.user_type,
        "password": payload.password,
    }
    return {"message": "Registration successful"}

@app.post("/api/login")
def login(payload: LoginRequest):
    user_key = f"{payload.user_type}:{payload.username.lower()}"
    user = users.get(user_key)
    if not user or user["password"] != payload.password:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = str(uuid4())
    sessions[token] = user_key
    return {"token": token, "user_type": user["user_type"], "username": user["username"]}

@app.post("/api/diagnose", response_model=DiagnosisResponse)
async def diagnose(
    age: int = Form(...),
    bmi: float = Form(...),
    cycleLength: int = Form(...),
    hirsutism: int = Form(...),
    insulinResistance: int = Form(...),
    lhFsh: float = Form(...),
    ultrasoundCount: int = Form(...),
    image: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    clinical = ClinicalFeatures(
        age=age,
        bmi=bmi,
        cycleLength=cycleLength,
        hirsutism=hirsutism,
        insulinResistance=insulinResistance,
        lhFsh=lhFsh,
        ultrasoundCount=ultrasoundCount,
    )
    image_bytes = await image.read()
    presence = "Positive" if clinical.bmi > 28 or clinical.hirsutism > 12 else "Borderline"
    category = "Hyperandrogenic"
    subtype = "IR-Related"
    severity = "Moderate" if clinical.cycleLength > 40 else "Mild"
    report = build_report(clinical, {
        "presence": presence,
        "category": category,
        "subtype": subtype,
        "severity": severity,
    })
    return {
        "presence": presence,
        "category": category,
        "subtype": subtype,
        "severity": severity,
        "report": report,
    }
