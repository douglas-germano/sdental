import logging

from flask import Blueprint, jsonify, request
from marshmallow import ValidationError

from app.schemas.finance import (
    CommissionPayoutCreateSchema, CommissionRuleCreateSchema, CommissionRuleUpdateSchema,
    ExpenseCreateSchema, ExpenseUpdateSchema, FinancialGoalSchema,
    PaymentCreateSchema, PaymentRegisterSchema, PaymentUpdateSchema,
)
from app.services.commission_service import CommissionService
from app.services.expense_service import ExpenseService
from app.services.financial_service import FinancialService
from app.services.payment_service import PaymentService
from app.utils.auth import clinic_required

logger = logging.getLogger(__name__)

bp = Blueprint('financial', __name__, url_prefix='/api/financial')


# -- Revenue forecast (existing) ------------------------------------------

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


# -- Cash flow & goals -------------------------------------------------------

@bp.route('/cash-flow', methods=['GET'])
@clinic_required
def get_cash_flow(current_clinic):
    """Real money in/out (as opposed to the appointment-based forecast above)."""
    days = request.args.get('days', default=30, type=int)
    service = FinancialService(current_clinic)
    return jsonify(service.get_cash_flow(days=days))


@bp.route('/receivables', methods=['GET'])
@clinic_required
def get_receivables(current_clinic):
    days = request.args.get('days', default=30, type=int)
    return jsonify(PaymentService(current_clinic).get_receivables(days=days))


@bp.route('/payables', methods=['GET'])
@clinic_required
def get_payables(current_clinic):
    days = request.args.get('days', default=30, type=int)
    return jsonify(ExpenseService(current_clinic).get_payables(days=days))


@bp.route('/goals', methods=['GET'])
@clinic_required
def get_goals(current_clinic):
    period = request.args.get('period')
    service = FinancialService(current_clinic)
    if period:
        return jsonify(service.get_goal_progress(period=period))
    return jsonify({
        'current': service.get_goal_progress(),
        'history': service.list_goals(),
    })


@bp.route('/goals', methods=['POST'])
@clinic_required
def set_goal(current_clinic):
    data = request.get_json() or {}
    try:
        validated = FinancialGoalSchema().load(data)
    except ValidationError as err:
        return jsonify({'error': 'Invalid goal', 'details': err.messages}), 400

    goal = FinancialService(current_clinic).set_goal(**validated)
    return jsonify({'message': 'Meta salva com sucesso', 'goal': goal.to_dict()}), 201


# -- Payments (pagamentos recebidos) ----------------------------------------

@bp.route('/payments', methods=['GET'])
@clinic_required
def list_payments(current_clinic):
    page = request.args.get('page', default=1, type=int)
    per_page = request.args.get('per_page', default=20, type=int)
    status = request.args.get('status')
    patient_id = request.args.get('patient_id')
    appointment_id = request.args.get('appointment_id')

    pagination = PaymentService(current_clinic).list_payments(
        status=status, patient_id=patient_id, appointment_id=appointment_id,
        page=page, per_page=per_page,
    )
    return jsonify({
        'payments': [p.to_dict() for p in pagination.items],
        'total': pagination.total,
        'pages': pagination.pages,
        'current_page': page,
    })


@bp.route('/payments', methods=['POST'])
@clinic_required
def create_payment(current_clinic):
    data = request.get_json() or {}
    try:
        validated = PaymentCreateSchema().load(data)
    except ValidationError as err:
        return jsonify({'error': 'Invalid payment', 'details': err.messages}), 400

    payments, error = PaymentService(current_clinic).create_payment(**validated)
    if error:
        return jsonify({'error': error}), 400

    return jsonify({
        'message': 'Pagamento registrado com sucesso',
        'payments': [p.to_dict() for p in payments],
    }), 201


@bp.route('/payments/<payment_id>', methods=['PUT'])
@clinic_required
def update_payment(payment_id, current_clinic):
    data = request.get_json() or {}
    try:
        validated = PaymentUpdateSchema().load(data)
    except ValidationError as err:
        return jsonify({'error': 'Invalid payment', 'details': err.messages}), 400

    payment, error = PaymentService(current_clinic).update_payment(payment_id, **validated)
    if error:
        return jsonify({'error': error}), 404

    return jsonify({'message': 'Pagamento atualizado', 'payment': payment.to_dict()})


@bp.route('/payments/<payment_id>/register', methods=['POST'])
@clinic_required
def register_payment(payment_id, current_clinic):
    """Record money received against a charge (full or partial)."""
    data = request.get_json() or {}
    try:
        validated = PaymentRegisterSchema().load(data)
    except ValidationError as err:
        return jsonify({'error': 'Invalid payment', 'details': err.messages}), 400

    payment, error = PaymentService(current_clinic).register_payment(payment_id, **validated)
    if error:
        return jsonify({'error': error}), 400

    return jsonify({'message': 'Pagamento recebido registrado', 'payment': payment.to_dict()})


@bp.route('/payments/<payment_id>', methods=['DELETE'])
@clinic_required
def cancel_payment(payment_id, current_clinic):
    success, error = PaymentService(current_clinic).cancel_payment(payment_id)
    if not success:
        return jsonify({'error': error}), 404
    return jsonify({'message': 'Pagamento cancelado'})


# -- Expenses (despesas / contas a pagar) -----------------------------------

@bp.route('/expenses', methods=['GET'])
@clinic_required
def list_expenses(current_clinic):
    page = request.args.get('page', default=1, type=int)
    per_page = request.args.get('per_page', default=20, type=int)
    status = request.args.get('status')
    category = request.args.get('category')

    pagination = ExpenseService(current_clinic).list_expenses(
        status=status, category=category, page=page, per_page=per_page,
    )
    return jsonify({
        'expenses': [e.to_dict() for e in pagination.items],
        'total': pagination.total,
        'pages': pagination.pages,
        'current_page': page,
    })


@bp.route('/expenses', methods=['POST'])
@clinic_required
def create_expense(current_clinic):
    data = request.get_json() or {}
    try:
        validated = ExpenseCreateSchema().load(data)
    except ValidationError as err:
        return jsonify({'error': 'Invalid expense', 'details': err.messages}), 400

    expenses, error = ExpenseService(current_clinic).create_expense(**validated)
    if error:
        return jsonify({'error': error}), 400

    return jsonify({
        'message': 'Despesa registrada com sucesso',
        'expenses': [e.to_dict() for e in expenses],
    }), 201


@bp.route('/expenses/<expense_id>', methods=['PUT'])
@clinic_required
def update_expense(expense_id, current_clinic):
    data = request.get_json() or {}
    try:
        validated = ExpenseUpdateSchema().load(data)
    except ValidationError as err:
        return jsonify({'error': 'Invalid expense', 'details': err.messages}), 400

    expense, error = ExpenseService(current_clinic).update_expense(expense_id, **validated)
    if error:
        return jsonify({'error': error}), 404

    return jsonify({'message': 'Despesa atualizada', 'expense': expense.to_dict()})


@bp.route('/expenses/<expense_id>/pay', methods=['POST'])
@clinic_required
def pay_expense(expense_id, current_clinic):
    expense, error = ExpenseService(current_clinic).mark_paid(expense_id)
    if error:
        return jsonify({'error': error}), 404
    return jsonify({'message': 'Despesa marcada como paga', 'expense': expense.to_dict()})


@bp.route('/expenses/<expense_id>', methods=['DELETE'])
@clinic_required
def delete_expense(expense_id, current_clinic):
    success, error = ExpenseService(current_clinic).delete_expense(expense_id)
    if not success:
        return jsonify({'error': error}), 404
    return jsonify({'message': 'Despesa removida'})


# -- Commissions --------------------------------------------------------

@bp.route('/commission-rules', methods=['GET'])
@clinic_required
def list_commission_rules(current_clinic):
    rules = CommissionService(current_clinic).list_rules()
    return jsonify({'rules': [r.to_dict() for r in rules]})


@bp.route('/commission-rules', methods=['POST'])
@clinic_required
def create_commission_rule(current_clinic):
    data = request.get_json() or {}
    try:
        validated = CommissionRuleCreateSchema().load(data)
    except ValidationError as err:
        return jsonify({'error': 'Invalid commission rule', 'details': err.messages}), 400

    rule, error = CommissionService(current_clinic).create_rule(**validated)
    if error:
        return jsonify({'error': error}), 400

    return jsonify({'message': 'Regra de comissão criada', 'rule': rule.to_dict()}), 201


@bp.route('/commission-rules/<rule_id>', methods=['PUT'])
@clinic_required
def update_commission_rule(rule_id, current_clinic):
    data = request.get_json() or {}
    try:
        validated = CommissionRuleUpdateSchema().load(data)
    except ValidationError as err:
        return jsonify({'error': 'Invalid commission rule', 'details': err.messages}), 400

    rule, error = CommissionService(current_clinic).update_rule(rule_id, **validated)
    if error:
        return jsonify({'error': error}), 400

    return jsonify({'message': 'Regra de comissão atualizada', 'rule': rule.to_dict()})


@bp.route('/commission-rules/<rule_id>', methods=['DELETE'])
@clinic_required
def delete_commission_rule(rule_id, current_clinic):
    success, error = CommissionService(current_clinic).delete_rule(rule_id)
    if not success:
        return jsonify({'error': error}), 404
    return jsonify({'message': 'Regra de comissão removida'})


@bp.route('/commissions', methods=['GET'])
@clinic_required
def get_commissions(current_clinic):
    """Per-professional earned/paid/balance summary."""
    days = request.args.get('days', default=30, type=int)
    summary = CommissionService(current_clinic).get_commission_summary(days=days)
    return jsonify({'commissions': summary})


@bp.route('/commission-payouts', methods=['GET'])
@clinic_required
def list_commission_payouts(current_clinic):
    professional_id = request.args.get('professional_id')
    payouts = CommissionService(current_clinic).list_payouts(professional_id=professional_id)
    return jsonify({'payouts': [p.to_dict() for p in payouts]})


@bp.route('/commission-payouts', methods=['POST'])
@clinic_required
def create_commission_payout(current_clinic):
    data = request.get_json() or {}
    try:
        validated = CommissionPayoutCreateSchema().load(data)
    except ValidationError as err:
        return jsonify({'error': 'Invalid payout', 'details': err.messages}), 400

    payout, error = CommissionService(current_clinic).create_payout(**validated)
    if error:
        return jsonify({'error': error}), 400

    return jsonify({'message': 'Repasse de comissão registrado', 'payout': payout.to_dict()}), 201
