"""
Database configuration and session management for SQLite.
"""
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE_URL = f"sqlite:///{os.path.join(BASE_DIR, 'attendance.db')}"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def initialize_database():
    """Create new tables and add permission state to existing SQLite events."""
    Base.metadata.create_all(bind=engine)
    with engine.begin() as connection:
        event_columns = {
            column['name'] for column in inspect(connection).get_columns('events')
        }
        if 'permission_status' not in event_columns:
            connection.execute(text(
                "ALTER TABLE events ADD COLUMN permission_status "
                "VARCHAR(20) NOT NULL DEFAULT 'PENDING'"
            ))
        if 'attendance_enabled' not in event_columns:
            connection.execute(text(
                "ALTER TABLE events ADD COLUMN attendance_enabled "
                "BOOLEAN NOT NULL DEFAULT 0"
            ))


def get_db():
    """Dependency that provides a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
