import logging

from flask import Blueprint, jsonify, request

from app.services.financial_service import FinancialService
from app.utils.auth import clinic_required

logger = logging.getLogger(__name__)

bp = Blueprint('financial', __name__, url_prefix='/api/financial')


@bp.route('/summary', methods=['GET'])
@clinic_required
def get_summary(current_clinic):
    """Realized / forecasted / lost revenue for the requested period."""
    days = request.args.get('days', default=30, type=int)
    service = FinancialService(current_clinic)
    return jsonify(service.get_summary(days=days))


@bp.route('/timeseries', methods=['GET'])
@clinic_required
def get_timeseries(current_clinic):
    """Realized vs. forecasted revenue bucketed by day/week/month, for charting."""
    past_days = request.args.get('past_days', default=90, type=int)
    future_days = request.args.get('future_days', default=60, type=int)
    group_by = request.args.get('group_by', default='week')

    service = FinancialService(current_clinic)
    return jsonify({
        'group_by': group_by,
        'series': service.get_revenue_timeseries(past_days=past_days, future_days=future_days, group_by=group_by)
    })


@bp.route('/breakdown', methods=['GET'])
@clinic_required
def get_breakdown(current_clinic):
    """Revenue breakdown by service or by professional."""
    days = request.args.get('days', default=30, type=int)
    by = request.args.get('by', default='service')

    service = FinancialService(current_clinic)
    if by == 'professional':
        data = service.get_breakdown_by_professional(days=days)
    else:
        data = service.get_breakdown_by_service(days=days)

    return jsonify({'by': by, 'breakdown': data})
