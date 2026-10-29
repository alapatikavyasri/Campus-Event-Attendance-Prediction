"""
Pydantic schemas for request/response validation.
"""
from pydantic import BaseModel
from typing import Optional, List


# =============================================
# Authentication Schemas
# =============================================

class AuthRegisterRequest(BaseModel):
    full_name: str
    email: str
    password: str
    role: str = "staff"


class AuthLoginRequest(BaseModel):
    email: str
    password: str


# =============================================
# Student Schemas
# =============================================

class StudentResponse(BaseModel):
    id: int
    roll_number: str
    student_name: str
    department: str
    year: str

    class Config:
        from_attributes = True


# =============================================
# Event Schemas
# =============================================

class EventCreate(BaseModel):
    event_name: str
    event_type: str
    event_date: str
    time: str
    venue: str
    department: Optional[str] = None
    year: Optional[str] = None
    venue_capacity: int


class EventResponse(BaseModel):
    id: int
    event_name: str
    event_type: str
    event_date: str
    time: str
    venue: str
    department: Optional[str] = None
    year: Optional[str] = None
    venue_capacity: int
    permission_status: str = "PENDING"
    attendance_enabled: bool = False

    class Config:
        from_attributes = True


# =============================================
# Attendance Schemas
# =============================================

class AttendanceMark(BaseModel):
    event_id: int
    roll_number: str


class AttendanceResponse(BaseModel):
    id: int
    event_id: int
    roll_number: str
    status: str
    check_in_time: Optional[str] = None
    student_name: Optional[str] = None
    department: Optional[str] = None
    year: Optional[str] = None
    event_name: Optional[str] = None

    class Config:
        from_attributes = True


# =============================================
# Prediction Schemas
# =============================================

class PredictionInput(BaseModel):
    department: str
    year: str
    event_type: str
    day: str
    time_slot: str
    venue: str
    venue_capacity: int
    promotion_channel: str
    exam_near: str
    past_average_attendance: float


class PredictionResponse(BaseModel):
    eligible_students: int
    predicted_attendance_percentage: float
    predicted_attendance_count: int
    predicted_percentage: float
    predicted_students: int


# =============================================
# Dashboard Schemas
# =============================================

class DashboardStats(BaseModel):
    total_students: int
    total_events: int
    present: int
    absent: int
    attendance_percentage: float
