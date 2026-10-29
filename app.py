"""
FastAPI Application — Campus Attendance Prediction API

Provides endpoints for:
- Student management
- Event management
- Attendance marking
- ML-based attendance prediction
- Dashboard analytics
"""
from fastapi import FastAPI, Depends, File, Header, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime, timedelta
from pathlib import Path
import hashlib
import hmac
import json
import secrets
import uuid
import uvicorn

from .database import get_db, initialize_database, SessionLocal
from .models import AuthSession, Student, Event, Attendance, PredictionHistory, PermissionLetter, User
from .schemas import (
    StudentResponse, EventCreate, EventResponse,
    AttendanceMark, PredictionInput, PredictionResponse,
    AuthLoginRequest, AuthRegisterRequest,
)
from . import crud
from .ml.predict import predict_attendance, get_model_info
from .permission_verification import (
    MAX_PERMISSION_FILE_SIZE,
    extract_and_verify_permission_letter,
    validate_permission_file,
)

# =============================================
# Create database tables
# =============================================
initialize_database()

# =============================================
# FastAPI App
# =============================================
app = FastAPI(
    title="Campus Attendance Prediction API",
    description="ML-based campus event attendance prediction and management system",
    version="1.0.0"
)

# =============================================
# CORS Middleware (for React frontend)
# =============================================
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =============================================
# Startup Event — seed students from CSV
# =============================================
@app.on_event("startup")
def startup_event():
    """Seed students from CSV on application startup."""
    db = SessionLocal()
    try:
        crud.seed_students(db)
        print("Students seeded from CSV successfully.")
    except Exception as e:
        print(f"Error seeding students: {e}")
    finally:
        db.close()


# =============================================
# Root & Health Endpoints
# =============================================

@app.get("/")
def root():
    """API root endpoint."""
    return {
        "message": "Campus Attendance Prediction API",
        "version": "1.0.0",
        "status": "running"
    }


@app.get("/health")
def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}


# =============================================
# Auth Endpoints
# =============================================

def _hash_password(password: str) -> str:
    """Hash a password with a per-password salt using scrypt."""
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1)
    return f"scrypt${salt.hex()}${digest.hex()}"


def _verify_password(password: str, stored_hash: str) -> tuple[bool, bool]:
    """Return whether a password matches and whether the hash needs upgrading."""
    if stored_hash.startswith("scrypt$"):
        try:
            _, salt_hex, digest_hex = stored_hash.split("$", 2)
            digest = hashlib.scrypt(
                password.encode("utf-8"), salt=bytes.fromhex(salt_hex),
                n=2**14, r=8, p=1,
            )
            return hmac.compare_digest(digest.hex(), digest_hex), False
        except (ValueError, TypeError):
            return False, False

    legacy_hash = hashlib.sha256(password.encode("utf-8")).hexdigest()
    return hmac.compare_digest(legacy_hash, stored_hash), True


def _issue_session(db: Session, user: User) -> str:
    token = secrets.token_urlsafe(32)
    now = datetime.now()
    db.add(AuthSession(
        token_hash=hashlib.sha256(token.encode("utf-8")).hexdigest(),
        user_id=user.id,
        created_at=now.isoformat(),
        expires_at=(now + timedelta(days=30)).isoformat(),
    ))
    db.commit()
    return token


def _user_response(user: User) -> dict:
    return {
        "id": user.id,
        "full_name": user.full_name,
        "email": user.email,
        "role": user.role,
    }


def _session_user(authorization: Optional[str], db: Session) -> Optional[User]:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    token = authorization[7:].strip()
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    session = db.query(AuthSession).filter(AuthSession.token_hash == token_hash).first()
    if not session or datetime.fromisoformat(session.expires_at) <= datetime.now():
        if session:
            db.delete(session)
            db.commit()
        return None
    return db.query(User).filter(User.id == session.user_id).first()


@app.post("/auth/register")
def register(data: AuthRegisterRequest, db: Session = Depends(get_db)):
    """
    Register a new user account.
    Expected body: { full_name, email, password, role (optional) }
    """
    full_name = data.full_name.strip()
    email = data.email.strip().lower()
    password = data.password
    role = data.role.strip().lower()

    if not full_name:
        raise HTTPException(status_code=400, detail="Full name is required.")
    if not email or '@' not in email:
        raise HTTPException(status_code=400, detail="A valid email address is required.")
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")
    if role not in ('admin', 'hod', 'staff'):
        role = 'staff'

    existing = db.query(User).filter(User.email == email).first()
    if existing:
        raise HTTPException(status_code=409, detail="An account with this email already exists.")

    user = User(
        full_name=full_name,
        email=email,
        role=role,
        hashed_password=_hash_password(password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = _issue_session(db, user)
    return {
        "message": "Account created successfully.",
        "access_token": token,
        "token_type": "bearer",
        "user": _user_response(user),
    }


@app.post("/auth/login")
def login(data: AuthLoginRequest, db: Session = Depends(get_db)):
    """
    Authenticate a user.
    Expected body: { email, password }
    """
    email = data.email.strip().lower()
    password = data.password

    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    password_matches, needs_upgrade = _verify_password(password, user.hashed_password)
    if not password_matches:
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    if needs_upgrade:
        user.hashed_password = _hash_password(password)
        db.commit()

    token = _issue_session(db, user)
    return {
        "message": "Login successful.",
        "access_token": token,
        "token_type": "bearer",
        "user": _user_response(user),
    }


@app.get("/auth/me")
def get_me(
    email: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Get the current session profile, retaining the legacy email lookup."""
    user = _session_user(authorization, db)
    if user is None and email:
        user = db.query(User).filter(User.email == email.lower()).first()
    if not user:
        raise HTTPException(status_code=401, detail="Authentication session is invalid or expired.")
    return _user_response(user)


@app.post("/auth/logout")
def logout(authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    """Revoke the current authentication session."""
    if authorization and authorization.lower().startswith("bearer "):
        token_hash = hashlib.sha256(authorization[7:].strip().encode("utf-8")).hexdigest()
        session = db.query(AuthSession).filter(AuthSession.token_hash == token_hash).first()
        if session:
            db.delete(session)
            db.commit()
    return {"message": "Logged out successfully."}

# =============================================
# Student Endpoints
# =============================================

@app.get("/students", response_model=list[StudentResponse])
def get_students(
    search: Optional[str] = Query(None, description="Search by roll number or name"),
    db: Session = Depends(get_db)
):
    """Get all students. Optionally search by roll number or name."""
    return crud.get_students(db, search)


@app.get("/students/{roll_number}", response_model=StudentResponse)
def get_student(roll_number: str, db: Session = Depends(get_db)):
    """Get a specific student by roll number."""
    student = crud.get_student_by_roll(db, roll_number)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found.")
    return student


# =============================================
# Event Endpoints
# =============================================

@app.get("/events", response_model=list[EventResponse])
def get_events(db: Session = Depends(get_db)):
    """Get all events."""
    return crud.get_events(db)


@app.post("/events", response_model=EventResponse)
def create_event(event: EventCreate, db: Session = Depends(get_db)):
    """Create a new event."""
    return crud.create_event(db, event.model_dump())


def _permission_letter_response(letter: PermissionLetter) -> dict:
    try:
        extracted_fields = json.loads(letter.extracted_fields or "{}")
    except (TypeError, json.JSONDecodeError):
        extracted_fields = {}
    return {
        "id": letter.id,
        "event_id": letter.event_id,
        "original_filename": letter.original_filename or letter.file_name,
        "file_type": letter.file_type,
        "created_at": letter.created_at or letter.uploaded_at,
        "verification_status": letter.verification_status,
        "verification_message": letter.verification_message or letter.verification_reason,
        "extracted_text": letter.extracted_text or letter.ocr_text or "",
        "extracted_fields": extracted_fields,
        "event_match": letter.event_match,
        "date_match": letter.date_match,
        "venue_match": letter.venue_match,
        "department_match": letter.department_match,
        "year_match": letter.year_match,
        "hod_approval_detected": letter.hod_approval_detected,
        "signature_detected": letter.signature_detected,
        "signature_status": letter.signature_status,
        "authenticity_risk": letter.authenticity_risk or letter.authenticity_reason,
        "score": letter.verification_score,
    }


@app.post("/events/{event_id}/permission-letter/upload")
async def upload_permission_letter(
    event_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    event = crud.get_event_by_id(db, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found.")

    filename = (file.filename or "permission-letter").replace("\\", "/").rsplit("/", 1)[-1]
    content = await file.read(MAX_PERMISSION_FILE_SIZE + 1)
    try:
        file_type, extension = validate_permission_file(filename, content)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    storage_dir = Path(__file__).resolve().parent / "uploads" / "permission_letters"
    storage_dir.mkdir(parents=True, exist_ok=True)
    stored_path = storage_dir / f"{uuid.uuid4().hex}{extension}"
    stored_path.write_bytes(content)
    timestamp = datetime.now().isoformat(timespec="seconds")

    letter = db.query(PermissionLetter).filter(
        PermissionLetter.event_id == event_id
    ).first()
    if letter is None:
        letter = PermissionLetter(
            event_id=event_id,
            file_name=filename,
            file_path=str(stored_path),
            file_type=file_type,
            uploaded_at=timestamp,
        )
        db.add(letter)
    else:
        previous_path = letter.stored_file_path or letter.file_path
        letter.file_name = filename
        letter.file_path = str(stored_path)
        letter.file_type = file_type
        letter.uploaded_at = timestamp
        previous_file = Path(previous_path).resolve()
        if storage_dir.resolve() in previous_file.parents:
            previous_file.unlink(missing_ok=True)

    letter.original_filename = filename
    letter.stored_file_path = str(stored_path)
    letter.created_at = timestamp
    letter.extracted_text = None
    letter.ocr_text = None
    letter.extracted_fields = "{}"
    letter.verification_status = "PENDING"
    letter.verification_message = "Permission letter uploaded. Verification is required."
    letter.verification_reason = letter.verification_message
    letter.verification_score = None
    letter.event_match = False
    letter.date_match = False
    letter.venue_match = False
    letter.department_match = False
    letter.year_match = False
    letter.hod_details_detected = False
    letter.hod_approval_detected = False
    letter.signature_detected = False
    letter.signature_status = "Signature Not Detected"
    letter.authenticity_status = "Unable to Verify"
    letter.authenticity_reason = "Verification has not been run."
    letter.authenticity_risk = letter.authenticity_reason
    event.permission_status = "PENDING"
    event.attendance_enabled = False
    db.commit()
    db.refresh(letter)
    return _permission_letter_response(letter)


@app.post("/events/{event_id}/permission-letter/verify")
def verify_permission_letter(event_id: int, db: Session = Depends(get_db)):
    event = crud.get_event_by_id(db, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found.")
    letter = db.query(PermissionLetter).filter(
        PermissionLetter.event_id == event_id
    ).first()
    if not letter:
        raise HTTPException(status_code=404, detail="Upload a HOD permission letter first.")

    result = extract_and_verify_permission_letter(
        event,
        letter.stored_file_path or letter.file_path,
        letter.file_type,
    )
    letter.verification_status = result["status"]
    letter.verification_message = result["reason"]
    letter.verification_reason = result["reason"]
    letter.extracted_text = result["ocr_text"]
    letter.ocr_text = result["ocr_text"]
    letter.extracted_fields = json.dumps(result["extracted_fields"], ensure_ascii=False)
    letter.verification_score = result["score"]
    letter.event_match = result["event_match"]
    letter.date_match = result["date_match"]
    letter.venue_match = result["venue_match"]
    letter.department_match = result["department_match"]
    letter.year_match = result["year_match"]
    letter.hod_details_detected = result["hod_details_detected"]
    letter.hod_approval_detected = result["hod_approval_detected"]
    letter.signature_detected = result["signature_detected"]
    letter.signature_status = result["signature_status"]
    letter.authenticity_status = result["authenticity_status"]
    letter.authenticity_reason = result["authenticity_reason"]
    letter.authenticity_risk = result["authenticity_risk"]
    event.permission_status = result["status"]
    event.attendance_enabled = result["status"] == "VERIFIED"
    db.commit()
    db.refresh(letter)
    response = _permission_letter_response(letter)
    response.update({
        "matches": result["matches"],
        "hod_details_detected": result["hod_details_detected"],
        "authenticity_status": result["authenticity_status"],
        "authenticity_reason": result["authenticity_reason"],
        "signature_region_detected": result["signature_region_detected"],
    })
    return response
 
 
@app.post("/events/{event_id}/permission-letter/approve")
def approve_permission_letter_manually(event_id: int, db: Session = Depends(get_db)):
    """Allow HOD or admin to directly approve and verify permission for an event."""
    event = crud.get_event_by_id(db, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found.")
    letter = db.query(PermissionLetter).filter(
        PermissionLetter.event_id == event_id
    ).first()
    timestamp = datetime.now().isoformat(timespec="seconds")
    if not letter:
        letter = PermissionLetter(
            event_id=event_id,
            file_name="HOD_Permission_Approved.txt",
            file_path="manual",
            file_type="text/plain",
            uploaded_at=timestamp,
            original_filename="HOD Permission Approved",
            stored_file_path="manual",
        )
        db.add(letter)
    letter.verification_status = "VERIFIED"
    letter.verification_message = "Permission accepted and verified by Head of Department."
    letter.verification_reason = letter.verification_message
    letter.verification_score = 100.0
    letter.event_match = True
    letter.date_match = True
    letter.venue_match = True
    letter.department_match = True
    letter.year_match = True
    letter.hod_details_detected = True
    letter.hod_approval_detected = True
    letter.signature_detected = True
    letter.signature_status = "Directly Approved by HOD"
    letter.authenticity_status = "Verified by HOD"
    letter.authenticity_reason = "Manually verified and approved by Department Head."
    letter.authenticity_risk = "Direct HOD authorization."
    event.permission_status = "VERIFIED"
    event.attendance_enabled = True
    db.commit()
    db.refresh(letter)
    response = _permission_letter_response(letter)
    response.update({
        "matches": {
            "event_name": True,
            "event_date": True,
            "venue": True,
            "department": True,
            "year": True,
        },
        "hod_details_detected": True,
        "authenticity_status": "Verified by HOD",
        "authenticity_reason": "Manually verified and approved by Department Head.",
        "signature_region_detected": True,
    })
    return response


@app.post("/events/{event_id}/permission-letter/reject")
def reject_permission_letter_manually(
    event_id: int,
    reason: Optional[str] = Query("Permission letter rejected by Head of Department."),
    db: Session = Depends(get_db),
):
    """Allow HOD or admin to directly reject permission for an event."""
    event = crud.get_event_by_id(db, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found.")
    letter = db.query(PermissionLetter).filter(
        PermissionLetter.event_id == event_id
    ).first()
    timestamp = datetime.now().isoformat(timespec="seconds")
    if not letter:
        letter = PermissionLetter(
            event_id=event_id,
            file_name="HOD_Permission_Rejected.txt",
            file_path="manual",
            file_type="text/plain",
            uploaded_at=timestamp,
            original_filename="HOD Permission Rejected",
            stored_file_path="manual",
        )
        db.add(letter)
    letter.verification_status = "REJECTED"
    letter.verification_message = reason or "Permission letter rejected by Head of Department."
    letter.verification_reason = letter.verification_message
    letter.verification_score = 0.0
    letter.event_match = False
    letter.date_match = False
    letter.venue_match = False
    letter.department_match = False
    letter.year_match = False
    letter.hod_details_detected = False
    letter.hod_approval_detected = False
    letter.signature_detected = False
    letter.signature_status = "Rejected by HOD"
    letter.authenticity_status = "Rejected by HOD"
    letter.authenticity_reason = reason or "Rejected by Department Head."
    letter.authenticity_risk = "Direct HOD rejection."
    event.permission_status = "REJECTED"
    event.attendance_enabled = False
    db.commit()
    db.refresh(letter)
    response = _permission_letter_response(letter)
    response.update({
        "matches": {
            "event_name": False,
            "event_date": False,
            "venue": False,
            "department": False,
            "year": False,
        },
        "hod_details_detected": False,
        "authenticity_status": "Rejected by HOD",
        "authenticity_reason": reason or "Rejected by Department Head.",
        "signature_region_detected": False,
    })
    return response


@app.get("/events/{event_id}/permission-letter")
def get_permission_letter(event_id: int, db: Session = Depends(get_db)):
    if not crud.get_event_by_id(db, event_id):
        raise HTTPException(status_code=404, detail="Event not found.")
    letter = db.query(PermissionLetter).filter(
        PermissionLetter.event_id == event_id
    ).first()
    if not letter:
        raise HTTPException(status_code=404, detail="Permission letter not uploaded.")
    return _permission_letter_response(letter)


# =============================================
# Attendance Endpoints
# =============================================

@app.post("/attendance/mark")
def mark_attendance(data: AttendanceMark, db: Session = Depends(get_db)):
    """
    Mark a student as present for an event.
    Prevents duplicate attendance and validates student/event existence.
    """
    event = crud.get_event_by_id(db, data.event_id)
    if not event:
        raise HTTPException(status_code=400, detail="Event not found.")
    if event.permission_status != "VERIFIED":
        raise HTTPException(
            status_code=403,
            detail="Attendance is locked. HOD permission letter must be verified first.",
        )

    attendance, error = crud.mark_attendance(db, data.event_id, data.roll_number)
    if error:
        raise HTTPException(status_code=400, detail=error)

    student = crud.get_student_by_roll(db, data.roll_number)
    return {
        "message": "Attendance marked successfully",
        "attendance": {
            "id": attendance.id,
            "event_id": attendance.event_id,
            "roll_number": attendance.roll_number,
            "status": attendance.status,
            "check_in_time": attendance.check_in_time,
            "student_name": student.student_name if student else None,
            "department": student.department if student else None,
            "year": student.year if student else None
        }
    }


@app.get("/attendance")
def get_attendance(
    event_id: Optional[int] = Query(None, description="Filter by event ID"),
    db: Session = Depends(get_db)
):
    """Get attendance records, optionally filtered by event."""
    return crud.get_attendance_with_details(db, event_id)


# =============================================
# Prediction Endpoint
# =============================================

@app.post("/predict", response_model=PredictionResponse)
def predict(data: PredictionInput, db: Session = Depends(get_db)):
    """
    Predict expected attendance for an event using the trained ML model.
    Saves prediction to history.
    """
    try:
        result = predict_attendance(data.model_dump(), crud.get_students(db))
    except FileNotFoundError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction error: {str(e)}")

    # Save to prediction history
    crud.save_prediction(db, result['predicted_percentage'], result['predicted_students'])

    return result


# =============================================
# Dashboard Endpoints
# =============================================

@app.get("/dashboard/stats")
def dashboard_stats():
    """Get overall dashboard statistics from historical data."""
    return crud.get_dashboard_stats()


@app.get("/dashboard/department-wise")
def department_wise():
    """Get department-wise attendance breakdown."""
    return crud.get_department_wise()


@app.get("/dashboard/year-wise")
def year_wise():
    """Get year-wise attendance breakdown."""
    return crud.get_year_wise()


@app.get("/dashboard/event-wise")
def event_wise():
    """Get event-wise attendance breakdown."""
    return crud.get_event_wise()


@app.get("/dashboard/date-wise")
def date_wise():
    """Get date-wise attendance breakdown."""
    return crud.get_date_wise()


@app.get("/reports/attendance")
def attendance_report(
    department: Optional[str] = Query(None),
    year: Optional[str] = Query(None),
    event_name: Optional[str] = Query(None),
    event_date: Optional[str] = Query(None)
):
    """Historical CSV report with optional combined filters."""
    return crud.get_attendance_report(department, year, event_name, event_date)


# =============================================
# Model Info Endpoint
# =============================================

@app.get("/model/info")
def model_info():
    """Get trained model metadata (features, metrics, unique values)."""
    try:
        return get_model_info()
    except FileNotFoundError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Model not available: {str(e)}"
        )


# =============================================
# Run with Uvicorn
# =============================================
if __name__ == "__main__":
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
