"""
Seed script to populate the database with test data.
Run: python seed.py
"""
import os
import sys
from datetime import datetime, timedelta, time

# Add the backend directory to the path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import create_app, db
from app.models import (
    Clinic, Patient, Appointment, Conversation,
    AvailabilitySlot, AppointmentStatus
)


def seed_database():
    """Populate database with test data."""
    app = create_app('development')

    with app.app_context():
        print('Creating tables...')
        db.create_all()

        # Check if clinic already exists
        existing_clinic = Clinic.query.filter_by(email='clinica@teste.com').first()
        if existing_clinic:
            print('Test data already exists. Skipping...')
            return

        print('Creating test clinic...')
        clinic = Clinic(
            name='Clínica Teste SDental',
            email='clinica@teste.com',
            phone='5511999999999'
        )
        clinic.set_password('senha123')

        # Configure business hours (Monday to Friday 8:00-18:00, Saturday 8:00-12:00)
        clinic.business_hours = {
            '0': {'start': '08:00', 'end': '18:00', 'active': True},   # Monday
            '1': {'start': '08:00', 'end': '18:00', 'active': True},   # Tuesday
            '2': {'start': '08:00', 'end': '18:00', 'active': True},   # Wednesday
            '3': {'start': '08:00', 'end': '18:00', 'active': True},   # Thursday
            '4': {'start': '08:00', 'end': '18:00', 'active': True},   # Friday
            '5': {'start': '08:00', 'end': '12:00', 'active': True},   # Saturday
            '6': {'start': '08:00', 'end': '12:00', 'active': False}   # Sunday
        }

        # Configure services
        clinic.services = [
            {'name': 'Consulta Geral', 'duration': 30},
            {'name': 'Limpeza', 'duration': 45},
            {'name': 'Clareamento', 'duration': 60},
            {'name': 'Extração', 'duration': 45},
            {'name': 'Retorno', 'duration': 15},
            {'name': 'Avaliação', 'duration': 30}
        ]

        db.session.add(clinic)
        db.session.flush()

        print('Creating availability slots...')
        # Create availability slots for Monday to Friday
        for day in range(5):  # Monday to Friday
            slot = AvailabilitySlot(
                clinic_id=clinic.id,
                day_of_week=day,
                start_time=time(8, 0),
                end_time=time(18, 0),
                slot_duration_minutes=30,
                active=True
            )
            db.session.add(slot)

        # Saturday slot
        saturday_slot = AvailabilitySlot(
            clinic_id=clinic.id,
            day_of_week=5,
            start_time=time(8, 0),
            end_time=time(12, 0),
            slot_duration_minutes=30,
            active=True
        )
        db.session.add(saturday_slot)

        print('Creating test patients...')
        patients = [
            Patient(
                clinic_id=clinic.id,
                name='João Silva',
                phone='5511988881111',
                email='joao@email.com',
                notes='Paciente regular'
            ),
            Patient(
                clinic_id=clinic.id,
                name='Maria Santos',
                phone='5511988882222',
                email='maria@email.com',
                notes='Alergia a penicilina'
            ),
            Patient(
                clinic_id=clinic.id,
                name='Pedro Oliveira',
                phone='5511988883333',
                email='pedro@email.com'
            ),
            Patient(
                clinic_id=clinic.id,
                name='Ana Costa',
                phone='5511988884444',
                email='ana@email.com'
            ),
            Patient(
                clinic_id=clinic.id,
                name='Carlos Ferreira',
                phone='5511988885555'
            )
        ]

        for patient in patients:
            db.session.add(patient)

        db.session.flush()

        print('Creating test appointments...')
        now = datetime.now()

        # Create some future appointments
        appointments_data = [
            {
                'patient': patients[0],
                'service': 'Consulta Geral',
                'days_from_now': 1,
                'hour': 9,
                'status': AppointmentStatus.CONFIRMED
            },
            {
                'patient': patients[1],
                'service': 'Limpeza',
                'days_from_now': 1,
                'hour': 10,
                'status': AppointmentStatus.CONFIRMED
            },
            {
                'patient': patients[2],
                'service': 'Clareamento',
                'days_from_now': 2,
                'hour': 14,
                'status': AppointmentStatus.PENDING
            },
            {
                'patient': patients[3],
                'service': 'Avaliação',
                'days_from_now': 3,
                'hour': 11,
                'status': AppointmentStatus.CONFIRMED
            },
            {
                'patient': patients[0],
                'service': 'Retorno',
                'days_from_now': 7,
                'hour': 15,
                'status': AppointmentStatus.PENDING
            }
        ]

        # Create some past appointments
        past_appointments = [
            {
                'patient': patients[0],
                'service': 'Consulta Geral',
                'days_from_now': -7,
                'hour': 9,
                'status': AppointmentStatus.COMPLETED
            },
            {
                'patient': patients[1],
                'service': 'Avaliação',
                'days_from_now': -14,
                'hour': 10,
                'status': AppointmentStatus.COMPLETED
            },
            {
                'patient': patients[4],
                'service': 'Limpeza',
                'days_from_now': -3,
                'hour': 16,
                'status': AppointmentStatus.NO_SHOW
            },
            {
                'patient': patients[2],
                'service': 'Consulta Geral',
                'days_from_now': -5,
                'hour': 14,
                'status': AppointmentStatus.CANCELLED
            }
        ]

        all_appointments = appointments_data + past_appointments

        for apt_data in all_appointments:
            scheduled = now.replace(
                hour=apt_data['hour'],
                minute=0,
                second=0,
                microsecond=0
            ) + timedelta(days=apt_data['days_from_now'])

            # Get duration from services
            duration = 30
            for service in clinic.services:
                if service['name'] == apt_data['service']:
                    duration = service['duration']
                    break

            appointment = Appointment(
                clinic_id=clinic.id,
                patient_id=apt_data['patient'].id,
                service_name=apt_data['service'],
                scheduled_datetime=scheduled,
                duration_minutes=duration,
                status=apt_data['status']
            )

            if apt_data['status'] == AppointmentStatus.CANCELLED:
                appointment.cancelled_at = now - timedelta(days=1)

            db.session.add(appointment)

        print('Creating test conversations...')
        # Create a sample conversation
        conversation = Conversation(
            clinic_id=clinic.id,
            patient_id=patients[0].id,
            phone_number=patients[0].phone,
            messages=[
                {
                    'role': 'user',
                    'content': 'Olá, gostaria de agendar uma consulta',
                    'timestamp': (now - timedelta(hours=2)).isoformat()
                },
                {
                    'role': 'assistant',
                    'content': 'Olá! Claro, ficarei feliz em ajudá-lo a agendar uma consulta. Qual serviço você gostaria de agendar?',
                    'timestamp': (now - timedelta(hours=2, minutes=-1)).isoformat()
                },
                {
                    'role': 'user',
                    'content': 'Consulta geral',
                    'timestamp': (now - timedelta(hours=1, minutes=55)).isoformat()
                },
                {
                    'role': 'assistant',
                    'content': 'Ótimo! Para uma consulta geral. Qual data seria melhor para você?',
                    'timestamp': (now - timedelta(hours=1, minutes=54)).isoformat()
                }
            ],
            context={
                'last_service_discussed': 'Consulta Geral'
            },
            status='active',
            last_message_at=now - timedelta(hours=1, minutes=54)
        )
        db.session.add(conversation)

        db.session.commit()

        print('=' * 50)
        print('Database seeded successfully!')
        print('=' * 50)
        print(f'Test Clinic: {clinic.name}')
        print(f'Email: {clinic.email}')
        print(f'Password: senha123')
        print(f'Patients created: {len(patients)}')
        print(f'Appointments created: {len(all_appointments)}')
        print('=' * 50)


if __name__ == '__main__':
    seed_database()
