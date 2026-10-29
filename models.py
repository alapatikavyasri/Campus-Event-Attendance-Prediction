"""
SQLAlchemy ORM models for the attendance database.
"""
from sqlalchemy import (
    Boolean, Column, Float, ForeignKey, Integer, String, Text,
    UniqueConstraint,
)
from .database import Base
import datetime


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    full_name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    role = Column(String, nullable=False, default="staff")  # admin | hod | staff
    hashed_password = Column(String, nullable=False)
    created_at = Column(
        String,
        default=lambda: datetime.datetime.now().isoformat()
    )

    def __repr__(self):
        return f"<User {self.email} ({self.role})>"


class AuthSession(Base):
    __tablename__ = "auth_sessions"

    token_hash = Column(String(64), primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(String, nullable=False)
    expires_at = Column(String, nullable=False, index=True)


class Student(Base):
    __tablename__ = "students"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    roll_number = Column(String, unique=True, index=True, nullable=False)
    student_name = Column(String, nullable=False)
    department = Column(String, nullable=False)
    year = Column(String, nullable=False)

    def __repr__(self):
        return f"<Student {self.roll_number} - {self.student_name}>"


class Event(Base):
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    event_name = Column(String, nullable=False)
    event_type = Column(String, nullable=False)
    event_date = Column(String, nullable=False)
    time = Column(String, nullable=False)
    venue = Column(String, nullable=False)
    department = Column(String, nullable=True)
    year = Column(String, nullable=True)
    venue_capacity = Column(Integer, nullable=False)
    permission_status = Column(String, nullable=False, default="PENDING")
    attendance_enabled = Column(Boolean, nullable=False, default=False)

    def __repr__(self):
        return f"<Event {self.event_name} on {self.event_date}>"


class Attendance(Base):
    __tablename__ = "attendance"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    event_id = Column(Integer, nullable=False)
    roll_number = Column(String, nullable=False)
    status = Column(String, nullable=False, default="Present")
    check_in_time = Column(String, nullable=True)

    # Prevent duplicate attendance for the same event and student
    __table_args__ = (
        UniqueConstraint('event_id', 'roll_number', name='uq_event_roll'),
    )

    def __repr__(self):
        return f"<Attendance {self.roll_number} @ Event {self.event_id}>"


class PredictionHistory(Base):
    __tablename__ = "prediction_history"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    event_id = Column(Integer, nullable=True)
    predicted_attendance = Column(Float, nullable=True)
    predicted_percentage = Column(Float, nullable=True)
    created_at = Column(
        String,
        default=lambda: datetime.datetime.now().isoformat()
    )

    def __repr__(self):
        return f"<Prediction {self.predicted_percentage}% at {self.created_at}>"


class PermissionLetter(Base):
    __tablename__ = "permission_letters"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    event_id = Column(Integer, ForeignKey("events.id"), unique=True, nullable=False)
    file_name = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    file_type = Column(String, nullable=False)
    uploaded_at = Column(String, nullable=False)
    verification_status = Column(String, nullable=False, default="PENDING")
    verification_score = Column(Float, nullable=True)
    verification_reason = Column(Text, nullable=True)
    ocr_text = Column(Text, nullable=True)
    extracted_fields = Column(Text, nullable=True)
    signature_detected = Column(Boolean, nullable=False, default=False)
    signature_status = Column(String, nullable=False, default="Signature Not Detected")
    event_match = Column(Boolean, nullable=False, default=False)
    hod_details_detected = Column(Boolean, nullable=False, default=False)
    authenticity_status = Column(String, nullable=False, default="Unable to Verify")
    authenticity_reason = Column(Text, nullable=True)
    original_filename = Column(String, nullable=True)
    stored_file_path = Column(String, nullable=True)
    extracted_text = Column(Text, nullable=True)
    created_at = Column(String, nullable=True)
    verification_message = Column(Text, nullable=True)
    date_match = Column(Boolean, nullable=False, default=False)
    venue_match = Column(Boolean, nullable=False, default=False)
    department_match = Column(Boolean, nullable=False, default=False)
    year_match = Column(Boolean, nullable=False, default=False)
    hod_approval_detected = Column(Boolean, nullable=False, default=False)
    authenticity_risk = Column(Text, nullable=True)
