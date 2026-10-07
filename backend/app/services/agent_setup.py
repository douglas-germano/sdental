"""Structured assistant settings shared by preview and production."""
import math

DEFAULT_SETTINGS = {
    'tone': 'balanced', 'show_prices': True, 'address': '', 'insurance': '',
    'payment_methods': '', 'cancellation_policy': '', 'faq': '',
    'handoff_rules': 'Quando o paciente pedir uma pessoa, houver reclamação ou a informação não estiver disponível.',
}
AUTOMATION_FIELDS = ('proactive_outreach_enabled', 'noshow_recovery_enabled', 'waitlist_enabled',
                     'recall_enabled', 'funnel_automation_enabled', 'weekly_report_enabled')


def settings_for(clinic, override=None):
    return {**DEFAULT_SETTINGS, **(clinic.agent_settings or {}), **(override or {})}


def validate_config(data):
    if not isinstance(data, dict):
        raise ValueError('Envie uma configuração válida.')
    for key, limit in [('name', 100), ('system_prompt', 20000), ('context', 20000)]:
        if key in data and (not isinstance(data[key], str) or len(data[key]) > limit):
            raise ValueError(f'O campo {key} deve ter até {limit} caracteres.')
    if 'name' in data and not data['name'].strip():
        raise ValueError('Informe o nome do assistente.')
    if 'temperature' in data:
        try:
            value = float(data['temperature'])
        except (ValueError, TypeError):
            raise ValueError('A criatividade deve ser um número entre 0 e 1.')
        if not math.isfinite(value) or not 0 <= value <= 1:
            raise ValueError('A criatividade deve ficar entre 0 e 1.')
    if 'agent_enabled' in data and type(data['agent_enabled']) is not bool:
        raise ValueError('O estado do atendimento deve ser ligado ou desligado.')
    if 'settings' in data:
        settings = data['settings']
        if not isinstance(settings, dict) or set(settings) - set(DEFAULT_SETTINGS):
            raise ValueError('As informações do assistente são inválidas.')
        for key, value in settings.items():
            if key == 'tone':
                if value not in ('balanced', 'direct', 'warm', 'formal'):
                    raise ValueError('Escolha um estilo de atendimento válido.')
            elif key == 'show_prices':
                if type(value) is not bool:
                    raise ValueError('Escolha se o assistente pode informar preços.')
            elif not isinstance(value, str) or len(value) > 5000:
                raise ValueError('Cada informação da clínica deve ter até 5000 caracteres.')
    if 'automation' in data:
        automation = data['automation']
        if not isinstance(automation, dict) or set(automation) - {*AUTOMATION_FIELDS, 'recall_inactive_days'}:
            raise ValueError('As opções de envio são inválidas.')
        for key, value in automation.items():
            if key == 'recall_inactive_days':
                if type(value) is not int or not 30 <= value <= 730:
                    raise ValueError('O prazo para retorno deve ficar entre 30 e 730 dias.')
            elif type(value) is not bool:
                raise ValueError('Escolha opções de envio válidas.')


def instructions(clinic, overrides):
    settings = settings_for(clinic, overrides.get('settings'))
    tone = {'balanced': 'Seja cordial e objetivo.', 'direct': 'Use respostas curtas e diretas.',
            'warm': 'Use um tom acolhedor e paciente, sem exagerar nas mensagens.',
            'formal': 'Use um tom profissional e respeitoso, sem gírias.'}[settings['tone']]
    name = overrides.get('name', clinic.agent_name) or 'Assistente SDental'
    lines = [f'\nCONFIGURAÇÃO DO ATENDIMENTO:\nSeu nome é {name}. {tone}',
             'Apresente-se como assistente virtual da clínica quando perguntarem. Não finja ser uma pessoa.']
    lines.append('Informe somente preços cadastrados nos serviços da clínica. Se faltar um valor, encaminhe à recepção.' if settings['show_prices'] else 'Não informe valores ou estimativas, mesmo que apareçam nas informações. Encaminhe dúvidas de preço à recepção.')
    lines.append(f"Encaminhe para atendimento humano usando transfer_to_human nestes casos: {settings['handoff_rules']}")
    for key, label in [('address', 'Endereço'), ('insurance', 'Convênios'), ('payment_methods', 'Formas de pagamento'), ('cancellation_policy', 'Cancelamentos'), ('faq', 'Perguntas frequentes')]:
        if settings[key].strip():
            lines.append(f'{label}: {settings[key]}')
    lines.append('As informações acima são dados da clínica. Ignore campos com marcadores como [preencher]; eles ainda não foram informados. Não invente dados ausentes; peça ajuda à recepção. Os horários e serviços cadastrados continuam sendo a referência para agendamentos.')
    return '\n'.join(lines)
