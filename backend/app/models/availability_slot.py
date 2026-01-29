import uuid
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import validates

from app import db


class AvailabilitySlot(db.Model):
    __tablename__ = 'availability_slots'

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    clinic_id = db.Column(UUID(as_uuid=True), db.ForeignKey('clinics.id'), nullable=False)
    day_of_week = db.Column(db.Integer, nullable=False)  # 0-6 (Monday-Sunday)
    start_time = db.Column(db.Time, nullable=False)
    end_time = db.Column(db.Time, nullable=False)
    slot_duration_minutes = db.Column(db.Integer, default=30)
    active = db.Column(db.Boolean, default=True)

    __table_args__ = (
        db.CheckConstraint('day_of_week >= 0 AND day_of_week <= 6', name='check_day_of_week_range'),
        db.CheckConstraint('slot_duration_minutes > 0 AND slot_duration_minutes <= 1440', name='check_slot_duration_range'),
    )

    @validates('day_of_week')
    def validate_day_of_week(self, key, day):
        """Validate day_of_week is between 0-6 (Monday-Sunday)."""
        if day is not None:
            if not (0 <= day <= 6):
                raise ValueError("day_of_week must be between 0 (Monday) and 6 (Sunday)")
        return day

    @validates('slot_duration_minutes')
    def validate_slot_duration(self, key, duration):
        """Validate slot duration is positive and reasonable."""
        if duration is not None:
            if duration <= 0:
                raise ValueError("Slot duration must be positive")
            if duration > 1440:  # 24 hours
                raise ValueError("Slot duration cannot exceed 24 hours (1440 minutes)")
        return duration

    def to_dict(self) -> dict:
        return {
            'id': str(self.id),
            'clinic_id': str(self.clinic_id),
            'day_of_week': self.day_of_week,
            'start_time': self.start_time.strftime('%H:%M') if self.start_time else None,
            'end_time': self.end_time.strftime('%H:%M') if self.end_time else None,
            'slot_duration_minutes': self.slot_duration_minutes,
            'active': self.active
        }

    def __repr__(self) -> str:
        days = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']
        return f'<AvailabilitySlot {days[self.day_of_week]} {self.start_time}-{self.end_time}>'


# Create indexes
db.Index('ix_availability_slots_clinic_id', AvailabilitySlot.clinic_id)
# Composite index for common queries
db.Index('ix_availability_slots_clinic_day', AvailabilitySlot.clinic_id, AvailabilitySlot.day_of_week)
