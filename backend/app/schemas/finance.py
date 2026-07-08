"""
Finance schemas: payments, expenses, commission rules and revenue goals.
"""
import re

from marshmallow import fields, validate, validates_schema, ValidationError

from app.models import ExpenseCategory, PaymentMethod
from .base import BaseSchema

_PERIOD_RE = re.compile(r'^\d{4}-(0[1-9]|1[0-2])$')


class PaymentCreateSchema(BaseSchema):
    patient_id = fields.Str(required=True)
    appointment_id = fields.Str(allow_none=True, load_default=None)
    amount = fields.Float(required=True, validate=validate.Range(min=0.01))
    method = fields.Str(load_default=PaymentMethod.CASH, validate=validate.OneOf(PaymentMethod.ALL))
    due_date = fields.Date(allow_none=True, load_default=None)
    installments = fields.Int(load_default=1, validate=validate.Range(min=1, max=24))
    notes = fields.Str(allow_none=True, load_default=None, validate=validate.Length(max=2000))


class PaymentRegisterSchema(BaseSchema):
    paid_amount = fields.Float(required=True, validate=validate.Range(min=0.01))
    method = fields.Str(allow_none=True, load_default=None, validate=validate.OneOf(PaymentMethod.ALL))
    paid_at = fields.DateTime(allow_none=True, load_default=None)


class PaymentUpdateSchema(BaseSchema):
    method = fields.Str(allow_none=True, validate=validate.OneOf(PaymentMethod.ALL))
    due_date = fields.Date(allow_none=True)
    notes = fields.Str(allow_none=True, validate=validate.Length(max=2000))


class ExpenseCreateSchema(BaseSchema):
    description = fields.Str(required=True, validate=validate.Length(min=1, max=255))
    amount = fields.Float(required=True, validate=validate.Range(min=0.01))
    category = fields.Str(load_default=ExpenseCategory.OTHER, validate=validate.OneOf(ExpenseCategory.ALL))
    due_date = fields.Date(allow_none=True, load_default=None)
    professional_id = fields.Str(allow_none=True, load_default=None)
    notes = fields.Str(allow_none=True, load_default=None, validate=validate.Length(max=2000))
    repeat_months = fields.Int(load_default=1, validate=validate.Range(min=1, max=24))


class ExpenseUpdateSchema(BaseSchema):
    description = fields.Str(validate=validate.Length(min=1, max=255))
    amount = fields.Float(validate=validate.Range(min=0.01))
    category = fields.Str(validate=validate.OneOf(ExpenseCategory.ALL))
    due_date = fields.Date(allow_none=True)
    professional_id = fields.Str(allow_none=True)
    notes = fields.Str(allow_none=True, validate=validate.Length(max=2000))


class CommissionRuleCreateSchema(BaseSchema):
    professional_id = fields.Str(allow_none=True, load_default=None)
    service_name = fields.Str(allow_none=True, load_default=None, validate=validate.Length(max=255))
    percentage = fields.Float(allow_none=True, load_default=None, validate=validate.Range(min=0, max=100))
    fixed_amount = fields.Float(allow_none=True, load_default=None, validate=validate.Range(min=0))

    @validates_schema
    def validate_kind(self, data, **kwargs):
        if (data.get('percentage') is None) == (data.get('fixed_amount') is None):
            raise ValidationError('Informe percentual OU valor fixo, não ambos')


class CommissionRuleUpdateSchema(BaseSchema):
    professional_id = fields.Str(allow_none=True)
    service_name = fields.Str(allow_none=True, validate=validate.Length(max=255))
    percentage = fields.Float(allow_none=True, validate=validate.Range(min=0, max=100))
    fixed_amount = fields.Float(allow_none=True, validate=validate.Range(min=0))
    active = fields.Bool()


class CommissionPayoutCreateSchema(BaseSchema):
    professional_id = fields.Str(required=True)
    period_start = fields.Date(required=True)
    period_end = fields.Date(required=True)
    amount = fields.Float(required=True, validate=validate.Range(min=0.01))
    notes = fields.Str(allow_none=True, load_default=None, validate=validate.Length(max=2000))


class FinancialGoalSchema(BaseSchema):
    period = fields.Str(required=True)
    target_amount = fields.Float(required=True, validate=validate.Range(min=0.01))
    notes = fields.Str(allow_none=True, load_default=None, validate=validate.Length(max=2000))

    @validates_schema
    def validate_period(self, data, **kwargs):
        if not _PERIOD_RE.match(data.get('period', '')):
            raise ValidationError('period deve estar no formato AAAA-MM', field_name='period')
