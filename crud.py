"""
CRUD operations for database and historical data analysis.
"""
import pandas as pd
import os
from sqlalchemy.orm import Session
from .models import Student, Event, Attendance, PredictionHistory
from datetime import datetime

# Path to the original CSV dataset (read-only)
CSV_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    '..', 'data', 'raw', 'campus_attendance_management_1000.csv'
)


def load_csv():
    """Load the original CSV dataset (read-only)."""
    return pd.read_csv(CSV_PATH)


# =============================================
# Student Operations
# =============================================

def seed_students(db: Session):
    """Load unique students from CSV into the database. Avoids duplicates."""
    df = load_csv()
    students_df = df[['Student_Name', 'Roll_Number', 'Department', 'Year']]\
        .drop_duplicates(subset='Roll_Number')

    count = 0
    for _, row in students_df.iterrows():
        existing = db.query(Student).filter(
            Student.roll_number == row['Roll_Number']
        ).first()
        if not existing:
            student = Student(
                roll_number=row['Roll_Number'],
                student_name=row['Student_Name'],
                department=row['Department'],
                year=row['Year']
            )
            db.add(student)
            count += 1

    db.commit()
    print(f"Seeded {count} new students from CSV.")


def get_students(db: Session, search: str = None):
    """Get all students, optionally filtered by search query."""
    query = db.query(Student)
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            (Student.roll_number.ilike(search_term)) |
            (Student.student_name.ilike(search_term))
        )
    return query.order_by(Student.roll_number).all()


def get_student_by_roll(db: Session, roll_number: str):
    """Get a single student by roll number."""
    return db.query(Student).filter(Student.roll_number == roll_number).first()


# =============================================
# Event Operations
# =============================================

def create_event(db: Session, event_data: dict):
    """Create a new event."""
    event = Event(**event_data)
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


def get_events(db: Session):
    """Get all events."""
    return db.query(Event).order_by(Event.id.desc()).all()


def get_event_by_id(db: Session, event_id: int):
    """Get a single event by ID."""
    return db.query(Event).filter(Event.id == event_id).first()


# =============================================
# Attendance Operations
# =============================================

def mark_attendance(db: Session, event_id: int, roll_number: str):
    """
    Mark a student as present for an event.
    Returns (attendance_record, error_message).
    """
    # Check if event exists
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        return None, "Event not found."

    if event.permission_status != "VERIFIED" or not event.attendance_enabled:
        return None, "Attendance is locked until the HOD permission letter is verified."

    # Check if student exists
    student = db.query(Student).filter(Student.roll_number == roll_number).first()
    if not student:
        return None, "Student not found."

    # Check for duplicate attendance
    existing = db.query(Attendance).filter(
        Attendance.event_id == event_id,
        Attendance.roll_number == roll_number
    ).first()
    if existing:
        return None, "Attendance already marked for this event."

    # Mark attendance with current time
    check_in_time = datetime.now().strftime("%H:%M")
    attendance = Attendance(
        event_id=event_id,
        roll_number=roll_number,
        status="Present",
        check_in_time=check_in_time
    )
    db.add(attendance)
    db.commit()
    db.refresh(attendance)
    return attendance, None


def get_attendance(db: Session, event_id: int = None):
    """Get attendance records, optionally filtered by event."""
    query = db.query(Attendance)
    if event_id:
        query = query.filter(Attendance.event_id == event_id)
    return query.all()


def get_attendance_with_details(db: Session, event_id: int = None):
    """Get attendance records joined with student and event details."""
    query = db.query(
        Attendance.id,
        Attendance.event_id,
        Attendance.roll_number,
        Attendance.status,
        Attendance.check_in_time,
        Student.student_name,
        Student.department,
        Student.year,
        Event.event_name
    ).join(
        Student, Student.roll_number == Attendance.roll_number
    ).join(
        Event, Event.id == Attendance.event_id
    )

    if event_id:
        query = query.filter(Attendance.event_id == event_id)

    results = query.order_by(Attendance.id.desc()).all()
    return [
        {
            "id": r[0],
            "event_id": r[1],
            "roll_number": r[2],
            "status": r[3],
            "check_in_time": r[4],
            "student_name": r[5],
            "department": r[6],
            "year": r[7],
            "event_name": r[8]
        }
        for r in results
    ]


# =============================================
# Dashboard / Historical Analysis (from CSV)
# =============================================

def get_dashboard_stats():
    """Get overall dashboard stats from the historical CSV."""
    df = load_csv()
    total_students = int(df['Roll_Number'].nunique())
    total_events = int(df.groupby(['Event_Name', 'Event_Date']).ngroups)
    present = int((df['Attendance_Status'] == 'Present').sum())
    absent = int((df['Attendance_Status'] == 'Absent').sum())
    attendance_pct = round(present / len(df) * 100, 2) if len(df) > 0 else 0.0
    return {
        "total_students": total_students,
        "total_events": total_events,
        "present": present,
        "absent": absent,
        "attendance_percentage": attendance_pct
    }


def get_department_wise():
    """Department-wise attendance analysis from CSV."""
    df = load_csv()
    dept = df.groupby('Department').agg(
        total=('Attendance_Status', 'count'),
        present=('Attendance_Status', lambda x: int((x == 'Present').sum()))
    ).reset_index()
    dept['absent'] = dept['total'] - dept['present']
    dept['percentage'] = round(dept['present'] / dept['total'] * 100, 2)
    dept.columns = ['Department', 'total', 'present', 'absent', 'percentage']
    return dept.to_dict('records')


def get_year_wise():
    """Year-wise attendance analysis from CSV."""
    df = load_csv()
    year = df.groupby('Year').agg(
        total=('Attendance_Status', 'count'),
        present=('Attendance_Status', lambda x: int((x == 'Present').sum()))
    ).reset_index()
    year['absent'] = year['total'] - year['present']
    year['percentage'] = round(year['present'] / year['total'] * 100, 2)
    year.columns = ['Year', 'total', 'present', 'absent', 'percentage']
    return year.to_dict('records')


def get_event_wise():
    """Event-wise attendance analysis from CSV."""
    df = load_csv()
    event = df.groupby('Event_Name').agg(
        total=('Attendance_Status', 'count'),
        present=('Attendance_Status', lambda x: int((x == 'Present').sum()))
    ).reset_index()
    event['absent'] = event['total'] - event['present']
    event['percentage'] = round(event['present'] / event['total'] * 100, 2)
    event.columns = ['Event_Name', 'total', 'present', 'absent', 'percentage']
    return event.to_dict('records')


def get_date_wise():
    """Date-wise attendance analysis from CSV."""
    df = load_csv()
    date = df.groupby('Event_Date').agg(
        total=('Attendance_Status', 'count'),
        present=('Attendance_Status', lambda x: int((x == 'Present').sum()))
    ).reset_index()
    date['absent'] = date['total'] - date['present']
    date['percentage'] = round(date['present'] / date['total'] * 100, 2)
    date = date.sort_values('Event_Date')
    date.columns = ['Event_Date', 'total', 'present', 'absent', 'percentage']
    return date.to_dict('records')


def get_attendance_report(
    department: str = None,
    year: str = None,
    event_name: str = None,
    event_date: str = None
):
    """Return historical event attendance after applying supplied filters."""
    df = load_csv()
    filters = {
        'Department': department,
        'Year': year,
        'Event_Name': event_name,
        'Event_Date': event_date
    }
    for column, value in filters.items():
        if value:
            df = df[df[column].astype(str) == str(value)]

    report = df.groupby(['Event_Name', 'Event_Date']).agg(
        total=('Attendance_Status', 'count'),
        present=('Attendance_Status', lambda x: int((x == 'Present').sum()))
    ).reset_index()
    report['absent'] = report['total'] - report['present']
    report['attendance_percentage'] = (
        report['present'].astype(float) / report['total'].astype(float) * 100
    ).round(2)
    return report.to_dict('records')


# =============================================
# Prediction History
# =============================================

def save_prediction(db: Session, predicted_pct: float, predicted_count: int, event_id: int = None):
    """Save a prediction record to history."""
    pred = PredictionHistory(
        event_id=event_id,
        predicted_attendance=float(predicted_count),
        predicted_percentage=float(predicted_pct),
        created_at=datetime.now().isoformat()
    )
    db.add(pred)
    db.commit()
    return pred
