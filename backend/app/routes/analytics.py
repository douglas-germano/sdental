from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify
from sqlalchemy import func

from app import db
from app.models import Appointment, Patient, Conversation, AppointmentStatus, ConversationStatus
from app.utils.auth import clinic_required

bp = Blueprint('analytics', __name__, url_prefix='/api/analytics')


@bp.route('/overview', methods=['GET'])
@clinic_required
def overview(current_clinic):
    """Get general metrics overview."""
    now = datetime.utcnow()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    week_start = now - timedelta(days=now.weekday())
    week_start = week_start.replace(hour=0, minute=0, second=0, microsecond=0)

    # Total appointments this month
    appointments_this_month = Appointment.query.filter(
        Appointment.clinic_id == current_clinic.id,
        Appointment.created_at >= month_start
    ).count()

    # Completed appointments this month
    completed_this_month = Appointment.query.filter(
        Appointment.clinic_id == current_clinic.id,
        Appointment.status == AppointmentStatus.COMPLETED,
        Appointment.scheduled_datetime >= month_start
    ).count()

    # Cancelled appointments this month
    cancelled_this_month = Appointment.query.filter(
        Appointment.clinic_id == current_clinic.id,
        Appointment.status == AppointmentStatus.CANCELLED,
        Appointment.scheduled_datetime >= month_start
    ).count()

    # Total patients
    total_patients = Patient.query.filter_by(
        clinic_id=current_clinic.id
    ).count()

    # New patients this month
    new_patients_month = Patient.query.filter(
        Patient.clinic_id == current_clinic.id,
        Patient.created_at >= month_start
    ).count()

    # Active conversations
    active_conversations = Conversation.query.filter_by(
        clinic_id=current_clinic.id,
        status=ConversationStatus.ACTIVE
    ).count()

    # Conversations needing attention
    needs_attention = Conversation.query.filter_by(
        clinic_id=current_clinic.id,
        status=ConversationStatus.TRANSFERRED_TO_HUMAN
    ).count()

    # Upcoming appointments (next 7 days)
    next_week = now + timedelta(days=7)
    upcoming = Appointment.query.filter(
        Appointment.clinic_id == current_clinic.id,
        Appointment.scheduled_datetime >= now,
        Appointment.scheduled_datetime <= next_week,
        Appointment.status.in_([AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED])
    ).count()

    # No-shows this month
    no_shows = Appointment.query.filter(
        Appointment.clinic_id == current_clinic.id,
        Appointment.status == AppointmentStatus.NO_SHOW,
        Appointment.scheduled_datetime >= month_start
    ).count()

    return jsonify({
        'appointments': {
            'this_month': appointments_this_month,
            'completed': completed_this_month,
            'cancelled': cancelled_this_month,
            'no_shows': no_shows,
            'upcoming': upcoming
        },
        'patients': {
            'total': total_patients,
            'new_this_month': new_patients_month
        },
        'conversations': {
            'active': active_conversations,
            'needs_attention': needs_attention
        }
    })


@bp.route('/appointments-by-period', methods=['GET'])
@clinic_required
def appointments_by_period(current_clinic):
    """Get appointments count grouped by day/week/month."""
    period = request.args.get('period', 'day')  # day, week, month
    days = request.args.get('days', 30, type=int)

    now = datetime.utcnow()
    start_date = now - timedelta(days=days)

    # Get appointments in the period
    appointments = Appointment.query.filter(
        Appointment.clinic_id == current_clinic.id,
        Appointment.scheduled_datetime >= start_date
    ).all()

    # Group by date
    data = {}
    for apt in appointments:
        if period == 'day':
            key = apt.scheduled_datetime.strftime('%Y-%m-%d')
        elif period == 'week':
            week_start = apt.scheduled_datetime - timedelta(days=apt.scheduled_datetime.weekday())
            key = week_start.strftime('%Y-%m-%d')
        else:  # month
            key = apt.scheduled_datetime.strftime('%Y-%m')

        if key not in data:
            data[key] = {'total': 0, 'completed': 0, 'cancelled': 0, 'no_show': 0}

        data[key]['total'] += 1
        if apt.status == AppointmentStatus.COMPLETED:
            data[key]['completed'] += 1
        elif apt.status == AppointmentStatus.CANCELLED:
            data[key]['cancelled'] += 1
        elif apt.status == AppointmentStatus.NO_SHOW:
            data[key]['no_show'] += 1

    # Sort by date
    sorted_data = [{'date': k, **v} for k, v in sorted(data.items())]

    return jsonify({
        'period': period,
        'data': sorted_data
    })


@bp.route('/conversion-rate', methods=['GET'])
@clinic_required
def conversion_rate(current_clinic):
    """
    Calculate conversation to appointment conversion rate.
    Measures how many conversations resulted in appointments.
    """
    days = request.args.get('days', 30, type=int)
    start_date = datetime.utcnow() - timedelta(days=days)

    # Total conversations in period
    total_conversations = Conversation.query.filter(
        Conversation.clinic_id == current_clinic.id,
        Conversation.created_at >= start_date
    ).count()

    # Conversations that resulted in appointments (patients who have appointments)
    conversations_with_appointments = db.session.query(
        func.count(func.distinct(Conversation.id))
    ).join(
        Patient, Conversation.patient_id == Patient.id
    ).join(
        Appointment, Patient.id == Appointment.patient_id
    ).filter(
        Conversation.clinic_id == current_clinic.id,
        Conversation.created_at >= start_date,
        Appointment.created_at >= start_date
    ).scalar()

    conversion_rate = 0
    if total_conversations > 0:
        conversion_rate = (conversations_with_appointments / total_conversations) * 100

    return jsonify({
        'total_conversations': total_conversations,
        'conversations_with_appointments': conversations_with_appointments or 0,
        'conversion_rate': round(conversion_rate, 2),
        'period_days': days
    })


@bp.route('/services-summary', methods=['GET'])
@clinic_required
def services_summary(current_clinic):
    """Get appointment count by service type."""
    days = request.args.get('days', 30, type=int)
    start_date = datetime.utcnow() - timedelta(days=days)

    results = db.session.query(
        Appointment.service_name,
        func.count(Appointment.id).label('count')
    ).filter(
        Appointment.clinic_id == current_clinic.id,
        Appointment.scheduled_datetime >= start_date
    ).group_by(
        Appointment.service_name
    ).order_by(
        func.count(Appointment.id).desc()
    ).all()

    return jsonify({
        'services': [{'name': r[0], 'count': r[1]} for r in results],
        'period_days': days
    })
