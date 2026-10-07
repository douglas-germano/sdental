'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/app/providers'
import { agentsApi, clinicsApi } from '@/lib/api'
import {
  AgentConfig,
  AgentDraft,
  AgentSettings,
  draftOf,
} from '@/lib/agent-config'
import { WhatsappConnectionWizard } from '@/components/settings/whatsapp-connection-wizard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { PageHeader } from '@/components/ui/page-header'
import { cn } from '@/lib/utils'

type Step = 'connect' | 'prepare' | 'test'
type Message = { role: 'user' | 'assistant'; content: string }
const steps: { id: Step; label: string; detail: string }[] = [
  { id: 'connect', label: 'Conectar', detail: 'Número da clínica' },
  { id: 'prepare', label: 'Preparar', detail: 'Como atender seus pacientes' },
  { id: 'test', label: 'Testar e ativar', detail: 'Confira antes de publicar' },
]
const tones = [
  {
    id: 'balanced',
    label: 'Equilibrado',
    example: 'Olá! Posso ajudar você a encontrar um horário.',
  },
  {
    id: 'direct',
    label: 'Direto',
    example: 'Qual dia você prefere para a consulta?',
  },
  {
    id: 'warm',
    label: 'Acolhedor',
    example: 'Entendo sua preocupação. Vamos encontrar um horário para você?',
  },
  {
    id: 'formal',
    label: 'Formal',
    example: 'Bom dia. Como podemos ajudar com seu atendimento?',
  },
] as const
const knowledge: {
  key: keyof Omit<AgentSettings, 'tone' | 'show_prices'>
  label: string
  placeholder: string
}[] = [
  {
    key: 'address',
    label: 'Endereço e como chegar',
    placeholder: 'Rua, número, bairro e ponto de referência',
  },
  {
    key: 'insurance',
    label: 'Convênios aceitos',
    placeholder: 'Liste os convênios ou informe que atende somente particular',
  },
  {
    key: 'payment_methods',
    label: 'Formas de pagamento',
    placeholder: 'Ex.: Pix, cartão e condições de parcelamento',
  },
  {
    key: 'cancellation_policy',
    label: 'Cancelamentos e remarcações',
    placeholder: 'Ex.: pedir aviso com 24 horas de antecedência',
  },
  {
    key: 'faq',
    label: 'Perguntas frequentes',
    placeholder: 'Escreva uma pergunta e sua resposta por linha',
  },
]
const errorMessage = (error: unknown, fallback: string): string => {
  const message = (error as { response?: { data?: { error?: string } } })
    ?.response?.data?.error
  return typeof message === 'string' ? message : fallback
}
function Field({
  label,
  help,
  children,
}: {
  label: string
  help?: string
  children: React.ReactNode
}) {
  return (
    <label className="block space-y-2">
      <span className="font-medium text-sm">{label}</span>
      {children}
      {help && (
        <span className="block text-sm text-muted-foreground">{help}</span>
      )}
    </label>
  )
}
function Section({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border bg-card p-4 sm:p-6 space-y-5">
      <div>
        <h2 className="font-semibold text-lg">{title}</h2>
        {description && (
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        )}
      </div>
      {children}
    </section>
  )
}

export default function AgentsPage() {
  const { clinic, refreshClinic } = useAuth()
  const [config, setConfig] = useState<AgentConfig | null>(null)
  const [draft, setDraft] = useState<AgentDraft | null>(null)
  const [step, setStep] = useState<Step>('connect')
  const [connected, setConnected] = useState<boolean | null>(null)
  const [connectionError, setConnectionError] = useState(false)
  const [phone, setPhone] = useState('')
  const [loadError, setLoadError] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [message, setMessage] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [testedDraft, setTestedDraft] = useState('')
  const [approved, setApproved] = useState(false)
  const [previousContext, setPreviousContext] = useState<string | null>(null)
  const chatEnd = useRef<HTMLDivElement>(null)
  const fingerprint = JSON.stringify(draft)
  const dirty =
    !!config && !!draft && fingerprint !== JSON.stringify(draftOf(config))
  const tested = testedDraft === fingerprint

  const loadConfig = useCallback(async () => {
    setLoadError('')
    try {
      const { data } = await agentsApi.getConfig()
      setConfig(data)
      setDraft(draftOf(data))
    } catch {
      setLoadError('Não conseguimos carregar o atendimento. Tente novamente.')
    }
  }, [])
  const checkConnection = useCallback(async () => {
    try {
      const { data } = await clinicsApi.getEvolutionStatus()
      setConnected(!!data.connected)
      setPhone(data.phone_number || '')
      setConnectionError(false)
    } catch {
      setConnected(null)
      setConnectionError(true)
    }
  }, [])
  useEffect(() => {
    loadConfig()
    checkConnection()
    setSessionId(crypto.randomUUID())
    if (new URLSearchParams(window.location.search).get('step') === 'prepare')
      setStep('prepare')
    const timer = setInterval(checkConnection, 15000)
    return () => clearInterval(timer)
  }, [loadConfig, checkConnection])
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    const warnNavigation = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement).closest('a')
      if (!anchor || anchor.target === '_blank') return
      const url = new URL(anchor.href, window.location.href)
      if (
        url.pathname === window.location.pathname &&
        url.search === window.location.search
      )
        return
      if (
        !window.confirm(
          'Há alterações em rascunho. Sair desta página vai descartá-las. Deseja continuar?',
        )
      ) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    window.addEventListener('beforeunload', warn)
    document.addEventListener('click', warnNavigation, true)
    return () => {
      window.removeEventListener('beforeunload', warn)
      document.removeEventListener('click', warnNavigation, true)
    }
  }, [dirty])
  useEffect(() => {
    setApproved(false)
    setTestedDraft('')
    setMessages([])
    setSessionId(crypto.randomUUID())
  }, [fingerprint])
  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: 'nearest' })
  }, [messages, sending])

  const edit = (patch: Partial<AgentDraft>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current))
    setNotice('')
    setError('')
  }
  const editSetting = <K extends keyof AgentSettings>(
    key: K,
    value: AgentSettings[K],
  ) => {
    if (draft) edit({ settings: { ...draft.settings, [key]: value } })
  }
  const newConversation = () => {
    setMessages([])
    setSessionId(crypto.randomUUID())
    setTestedDraft('')
    setApproved(false)
    setError('')
  }
  const send = async (text: string) => {
    if (!text.trim() || !draft || sending || saving) return
    setSending(true)
    setError('')
    setMessage('')
    const currentFingerprint = JSON.stringify(draft)
    setMessages((current) => [...current, { role: 'user', content: text }])
    try {
      const { data } = await agentsApi.testMessage(text, draft, sessionId)
      setMessages((current) => [
        ...current,
        { role: 'assistant', content: data.response },
      ])
      setTestedDraft(currentFingerprint)
    } catch (failure) {
      setError(
        errorMessage(
          failure,
          'O teste não respondeu. Tente enviar a mensagem novamente.',
        ),
      )
    } finally {
      setSending(false)
    }
  }
  const publish = async (activate: boolean) => {
    if (!draft || !tested || !approved || saving || sending) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const { data } = await agentsApi.updateConfig({
        ...draft,
        ...(activate ? { agent_enabled: true } : {}),
      })
      setConfig(data.config)
      setDraft(draftOf(data.config))
      setNotice(
        activate
          ? 'Atendimento ativado com as configurações testadas.'
          : 'Configuração publicada. O estado do atendimento foi mantido.',
      )
      await refreshClinic()
    } catch (failure) {
      setError(
        errorMessage(
          failure,
          'Não foi possível publicar. Seu rascunho continua aqui.',
        ),
      )
    } finally {
      setSaving(false)
      checkConnection()
    }
  }
  const pause = async () => {
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const { data } = await agentsApi.updateConfig({ agent_enabled: false })
      setConfig(data.config) // Do not publish or discard the current draft.
      setNotice(
        'Respostas automáticas pausadas. As opções de envio iniciado pela clínica continuam separadas.',
      )
      await refreshClinic()
    } catch (failure) {
      setError(
        errorMessage(failure, 'Não foi possível pausar. Tente novamente.'),
      )
    } finally {
      setSaving(false)
    }
  }
  if (!config || !draft)
    return (
      <div className="space-y-4">
        <PageHeader
          title="Atendimento no WhatsApp"
          description="Conecte, prepare e teste o assistente da sua clínica."
        />
        {loadError ? (
          <div role="alert">
            <p>{loadError}</p>
            <Button className="mt-3 min-h-11" onClick={loadConfig}>
              Tentar novamente
            </Button>
          </div>
        ) : (
          <p role="status">Carregando atendimento…</p>
        )}
      </div>
    )
  const status =
    connected === null
      ? 'Conexão não verificada'
      : !connected
        ? 'WhatsApp desconectado'
        : !config.ai_configured
          ? 'Assistente indisponível'
          : config.agent_enabled
            ? 'Respondendo pacientes'
            : 'Respostas pausadas'
  const live = connected && config.ai_configured && config.agent_enabled
  const canActivate = connected && config.ai_configured && tested && approved
  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-8">
      <PageHeader
        title="Atendimento no WhatsApp"
        description="Conecte seu número, prepare as respostas e confira o resultado antes de ativar."
      />
      <section
        className="rounded-xl border bg-card p-4 flex flex-wrap justify-between items-center gap-4"
        aria-label="Estado atual do atendimento"
      >
        <div>
          <p
            className={cn(
              'font-semibold',
              live ? 'text-success' : 'text-foreground',
            )}
            role="status"
          >
            {status}
          </p>
          <p className="text-sm text-muted-foreground">
            {phone
              ? `Número: +${phone.replace(/^\+/, '')}`
              : 'O estado abaixo corresponde ao atendimento publicado.'}
            {config.agent_enabled &&
              connected === false &&
              ' As respostas estão habilitadas, mas dependem da reconexão.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="min-h-11"
            onClick={checkConnection}
          >
            Verificar conexão
          </Button>
          {config.agent_enabled && (
            <Button
              variant="destructive"
              className="min-h-11"
              onClick={pause}
              disabled={saving || sending}
            >
              Pausar respostas
            </Button>
          )}
        </div>
      </section>
      {connectionError && (
        <p className="text-sm" role="alert">
          Não conseguimos verificar o WhatsApp. Use “Verificar conexão” para
          tentar novamente.
        </p>
      )}
      <nav
        aria-label="Etapas de configuração"
        className="grid grid-cols-3 gap-2"
      >
        {steps.map((item, index) => (
          <button
            key={item.id}
            aria-current={step === item.id ? 'step' : undefined}
            onClick={() => {
              setStep(item.id)
              setError('')
            }}
            className={cn(
              'text-left rounded-xl border p-3 sm:p-4 min-h-16 focus-visible:ring-2 focus-visible:ring-primary',
              step === item.id ? 'border-primary bg-primary/10' : 'bg-card',
            )}
          >
            <span className="block text-sm font-semibold">
              {index + 1}. {item.label}
            </span>
            <span className="hidden sm:block text-sm text-muted-foreground mt-1">
              {item.detail}
            </span>
          </button>
        ))}
      </nav>
      <div className="rounded-lg bg-muted p-3 flex flex-wrap justify-between gap-3 text-sm">
        <p>
          {dirty
            ? 'Você tem alterações em rascunho. Os pacientes ainda recebem a versão publicada.'
            : 'Configuração publicada carregada. Alterações só entram em uso depois de testar e publicar.'}
        </p>
        {dirty && (
          <button
            className="underline min-h-11"
            disabled={saving || sending}
            onClick={() => {
              setDraft(draftOf(config))
              setPreviousContext(null)
              newConversation()
              setNotice(
                'Rascunho descartado. A versão publicada foi restaurada.',
              )
            }}
          >
            Descartar rascunho
          </button>
        )}
      </div>
      {notice && (
        <p role="status" className="rounded-lg bg-success/10 p-3 text-sm">
          {notice}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-destructive/10 text-destructive p-3 text-sm"
        >
          {error}
        </p>
      )}

      {step === 'connect' && (
        <div className="space-y-5">
          <WhatsappConnectionWizard onStatusChange={checkConnection} />
          <p className="text-sm text-muted-foreground">
            Conectar o número não altera a configuração atual das respostas. Se
            você estiver configurando pela primeira vez, mantenha as respostas
            pausadas até concluir o teste.
          </p>
          <Button className="min-h-11" onClick={() => setStep('prepare')}>
            Continuar: preparar atendimento
          </Button>
        </div>
      )}
      {step === 'prepare' && (
        <div className="space-y-5">
          <Section
            title="Como seu assistente conversa"
            description="Escolha um estilo pronto. Você poderá conferir as respostas no próximo passo."
          >
            <Field
              label="Nome do assistente"
              help="Esse nome orienta como o assistente se apresenta quando perguntarem."
            >
              <Input
                maxLength={100}
                value={draft.name}
                onChange={(event) => edit({ name: event.target.value })}
                className="min-h-11"
              />
            </Field>
            <fieldset>
              <legend className="text-sm font-medium mb-3">
                Estilo de atendimento
              </legend>
              <div className="grid sm:grid-cols-2 gap-3">
                {tones.map((tone) => (
                  <label
                    key={tone.id}
                    className={cn(
                      'flex gap-3 p-4 rounded-xl border cursor-pointer min-h-11',
                      draft.settings.tone === tone.id &&
                        'border-primary bg-primary/5',
                    )}
                  >
                    <input
                      type="radio"
                      name="tone"
                      value={tone.id}
                      checked={draft.settings.tone === tone.id}
                      onChange={() => editSetting('tone', tone.id)}
                      className="mt-1 accent-primary"
                    />
                    <span>
                      <span className="block font-medium text-sm">
                        {tone.label}
                      </span>
                      <span className="block text-sm text-muted-foreground mt-1">
                        {tone.example}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="flex gap-3 items-start min-h-11 cursor-pointer">
              <input
                type="checkbox"
                className="mt-1 accent-primary"
                checked={draft.settings.show_prices}
                onChange={(event) =>
                  editSetting('show_prices', event.target.checked)
                }
              />
              <span className="text-sm">
                <strong>Informar preços cadastrados</strong>
                <span className="block text-muted-foreground">
                  Se desligado, dúvidas de preço serão encaminhadas à recepção.
                  Valores ausentes nunca devem ser inventados.
                </span>
              </span>
            </label>
            <Field
              label="Quando chamar a recepção"
              help="O assistente encaminha a conversa para uma pessoa nesses casos."
            >
              <Textarea
                maxLength={5000}
                rows={3}
                value={draft.settings.handoff_rules}
                onChange={(event) =>
                  editSetting('handoff_rules', event.target.value)
                }
              />
            </Field>
          </Section>
          <Section
            title="O que o assistente sabe sobre a clínica"
            description="Preencha com informações reais. Se algo ficar em branco, o assistente deverá pedir ajuda à recepção."
          >
            <div className="rounded-lg bg-muted p-4 text-sm space-y-2">
              <p>
                <strong>Horários e serviços são usados automaticamente.</strong>
              </p>
              <p>
                {clinic?.services?.length || 0} serviços cadastrados. Os
                horários disponíveis consideram o expediente e a agenda.
              </p>
              <div className="flex flex-wrap gap-4">
                <Link
                  className="underline inline-flex items-center min-h-11"
                  href="/settings?section=hours"
                >
                  Editar horários
                </Link>
                <Link
                  className="underline inline-flex items-center min-h-11"
                  href="/settings?section=services"
                >
                  Editar serviços e preços
                </Link>
              </div>
            </div>
            {knowledge.slice(0, 3).map((field) => (
              <Field key={field.key} label={field.label}>
                <Textarea
                  rows={field.key === 'faq' ? 4 : 2}
                  maxLength={5000}
                  placeholder={field.placeholder}
                  value={draft.settings[field.key]}
                  onChange={(event) =>
                    editSetting(field.key, event.target.value)
                  }
                />
              </Field>
            ))}
            <details className="rounded-lg border p-4">
              <summary className="cursor-pointer min-h-11 py-3 text-sm font-medium">
                Regras e perguntas frequentes (opcional)
              </summary>
              <div className="space-y-4 pt-3">
                {knowledge.slice(3).map((field) => (
                  <Field key={field.key} label={field.label}>
                    <Textarea
                      rows={3}
                      maxLength={5000}
                      placeholder={field.placeholder}
                      value={draft.settings[field.key]}
                      onChange={(event) =>
                        editSetting(field.key, event.target.value)
                      }
                    />
                  </Field>
                ))}
              </div>
            </details>
            <Field
              label="Outras informações"
              help="Informações já cadastradas foram preservadas aqui. Este campo complementa os campos acima."
            >
              <Textarea
                rows={4}
                maxLength={20000}
                value={draft.context}
                onChange={(event) => edit({ context: event.target.value })}
              />
            </Field>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                className="min-h-11"
                onClick={() => {
                  setPreviousContext(draft.context)
                  edit({
                    context: `${draft.context}${draft.context ? '\n\n' : ''}Orientações adicionais:\n- Acesso e estacionamento: [preencher]\n- Documentos para a primeira consulta: [preencher]`,
                  })
                }}
                disabled={draft.context.length > 19700}
              >
                Adicionar roteiro de informações
              </Button>
              {previousContext !== null && (
                <Button
                  variant="ghost"
                  className="min-h-11"
                  onClick={() => {
                    edit({ context: previousContext })
                    setPreviousContext(null)
                  }}
                >
                  Desfazer inclusão
                </Button>
              )}
            </div>
          </Section>
          <details className="rounded-xl border bg-card p-4">
            <summary className="cursor-pointer min-h-11 py-3 text-sm font-medium">
              Mensagens automáticas (opcional) ·{' '}
              {draft.automation.proactive_outreach_enabled
                ? 'Envio iniciado pela clínica ligado'
                : 'Envio iniciado pela clínica desligado'}
            </summary>
            <div className="pt-4">
              <Section
                title="Mensagens iniciadas pela clínica"
                description="Responder a um paciente e iniciar uma conversa são opções separadas. Essas alterações também precisam ser publicadas."
              >
                <label className="flex items-start gap-3 min-h-11">
                  <input
                    type="checkbox"
                    className="mt-1 accent-primary"
                    checked={draft.automation.proactive_outreach_enabled}
                    onChange={(event) =>
                      edit({
                        automation: {
                          ...draft.automation,
                          proactive_outreach_enabled: event.target.checked,
                        },
                      })
                    }
                  />
                  <span className="text-sm">
                    <strong>Permitir iniciar conversas com pacientes</strong>
                    <span className="block text-muted-foreground">
                      Usa horário comercial e limites de envio. Pacientes podem
                      pedir para parar de receber mensagens.
                    </span>
                  </span>
                </label>
                <fieldset
                  disabled={!draft.automation.proactive_outreach_enabled}
                  className="space-y-3 disabled:opacity-50"
                >
                  <legend className="text-sm font-medium mb-3">
                    Em quais situações?
                  </legend>
                  {(
                    [
                      [
                        'noshow_recovery_enabled',
                        'Convidar quem faltou ou cancelou a remarcar',
                      ],
                      [
                        'waitlist_enabled',
                        'Oferecer horários livres a pacientes da lista de espera',
                      ],
                      [
                        'recall_enabled',
                        'Convidar pacientes sem consulta há algum tempo',
                      ],
                    ] as const
                  ).map(([key, label]) => (
                    <label
                      key={key}
                      className="flex gap-3 items-center min-h-11 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={draft.automation[key]}
                        onChange={(event) =>
                          edit({
                            automation: {
                              ...draft.automation,
                              [key]: event.target.checked,
                            },
                          })
                        }
                      />
                      {label}
                    </label>
                  ))}
                  <Field label="Convidar para retorno após quantos dias sem consulta?">
                    <Input
                      type="number"
                      min={30}
                      max={730}
                      className="min-h-11 max-w-48"
                      value={draft.automation.recall_inactive_days}
                      onChange={(event) =>
                        edit({
                          automation: {
                            ...draft.automation,
                            recall_inactive_days: Number(event.target.value),
                          },
                        })
                      }
                    />
                  </Field>
                </fieldset>
                <p className="text-sm text-muted-foreground">
                  Revise essas opções antes de publicar: habilitar envios pode
                  iniciar mensagens automaticamente conforme as regras acima.
                </p>
                {(
                  [
                    [
                      'funnel_automation_enabled',
                      'Organizar automaticamente os pacientes no funil de atendimento',
                    ],
                    [
                      'weekly_report_enabled',
                      'Enviar resumo semanal da clínica no meu WhatsApp',
                    ],
                  ] as const
                ).map(([key, label]) => (
                  <label
                    key={key}
                    className="flex gap-3 items-center min-h-11 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={draft.automation[key]}
                      onChange={(event) =>
                        edit({
                          automation: {
                            ...draft.automation,
                            [key]: event.target.checked,
                          },
                        })
                      }
                    />
                    {label}
                  </label>
                ))}
              </Section>
            </div>
          </details>
          <details className="rounded-xl border bg-card p-4">
            <summary className="cursor-pointer min-h-11 py-3 font-medium text-sm">
              Configurações avançadas
            </summary>
            <div className="space-y-4 pt-4">
              <p className="text-sm text-muted-foreground">
                As opções prontas já orientam o assistente. Use estes campos
                apenas se precisar personalizar instruções adicionais.
              </p>
              {draft.system_prompt && (
                <p className="text-sm">
                  Há instruções personalizadas anteriores. Elas foram
                  preservadas e serão combinadas às novas opções.
                </p>
              )}
              <Field label="Instruções personalizadas">
                <Textarea
                  rows={8}
                  maxLength={20000}
                  value={draft.system_prompt}
                  onChange={(event) =>
                    edit({ system_prompt: event.target.value })
                  }
                  className="font-mono"
                />
              </Field>
              <p className="text-sm text-muted-foreground break-words">
                Variáveis disponíveis:{' '}
                {
                  '{clinic_name}, {services}, {business_hours}, {current_datetime}, {context_info}'
                }
              </p>
              <Field
                label={`Criatividade: ${draft.temperature.toFixed(1)}`}
                help="Valores menores favorecem respostas consistentes. O padrão é 0,7."
              >
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.1}
                  value={draft.temperature}
                  onChange={(event) =>
                    edit({ temperature: Number(event.target.value) })
                  }
                  className="w-full min-h-11"
                />
              </Field>
            </div>
          </details>
          <Button
            className="min-h-11"
            onClick={() => {
              newConversation()
              setStep('test')
            }}
          >
            Continuar: testar respostas
          </Button>
        </div>
      )}

      {step === 'test' && (
        <div className="space-y-5">
          <Section
            title="Converse como se fosse um paciente"
            description="O teste usa o rascunho desta tela. Nenhuma mensagem é enviada pelo WhatsApp e ações de agendamento são simuladas."
          >
            {!config.ai_configured && (
              <p role="alert" className="text-sm text-destructive">
                O assistente está indisponível para testes. Peça ao suporte para
                concluir a configuração.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {[
                'Quais horários estão disponíveis?',
                'Quanto custa uma limpeza?',
                'Vocês aceitam convênio?',
                'Quero falar com a recepção',
              ].map((text) => (
                <Button
                  key={text}
                  variant="outline"
                  className="min-h-11 h-auto text-sm whitespace-normal text-left"
                  disabled={sending || saving || !config.ai_configured}
                  onClick={() => send(text)}
                >
                  {text}
                </Button>
              ))}
            </div>
            <div
              className="border rounded-xl bg-muted/30 h-80 sm:h-96 overflow-y-auto p-4 space-y-4"
              role="log"
              aria-live="polite"
              aria-label="Conversa de teste"
            >
              {!messages.length && (
                <p className="text-sm text-muted-foreground">
                  Escolha uma pergunta acima ou escreva sua mensagem abaixo.
                </p>
              )}
              {messages.map((item, index) => (
                <div
                  key={index}
                  className={cn(
                    'rounded-xl p-3 max-w-[92%] text-sm whitespace-pre-wrap break-words',
                    item.role === 'user'
                      ? 'ml-auto bg-primary text-primary-foreground'
                      : 'bg-card border',
                  )}
                >
                  <strong className="block text-xs mb-1">
                    {item.role === 'user' ? 'Você, como paciente' : draft.name}
                  </strong>
                  {item.content}
                </div>
              ))}
              {sending && (
                <p role="status" className="text-sm">
                  O assistente está respondendo…
                </p>
              )}
              <div ref={chatEnd} />
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault()
                send(message)
              }}
              className="flex flex-wrap sm:flex-nowrap gap-2"
            >
              <Input
                aria-label="Mensagem de teste"
                placeholder="Escreva como um paciente…"
                maxLength={5000}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                disabled={sending || saving}
                className="min-h-11 flex-1 min-w-0"
              />
              <Button
                type="submit"
                className="min-h-11"
                disabled={
                  !message.trim() || sending || saving || !config.ai_configured
                }
              >
                Enviar
              </Button>
            </form>
            <Button
              variant="outline"
              className="min-h-11"
              disabled={sending || saving}
              onClick={newConversation}
            >
              Começar nova conversa
            </Button>
            <p className="text-sm text-muted-foreground">
              Uma nova conversa começa sem as mensagens e a memória do teste
              anterior. Este simulador avalia respostas; os envios automáticos
              são revisados abaixo.
            </p>
          </Section>
          <Section
            title="Revise e publique"
            description="Os pacientes só recebem as alterações quando você publicar."
          >
            <dl className="grid sm:grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-muted-foreground">Assistente</dt>
                <dd>
                  {draft.name} ·{' '}
                  {tones.find((item) => item.id === draft.settings.tone)?.label}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Preços</dt>
                <dd>
                  {draft.settings.show_prices
                    ? 'Somente valores cadastrados'
                    : 'Encaminhar à recepção'}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">
                  Mensagens iniciadas pela clínica
                </dt>
                <dd>
                  {draft.automation.proactive_outreach_enabled
                    ? 'Permitidas nas situações selecionadas'
                    : 'Desligadas'}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">WhatsApp</dt>
                <dd>
                  {connected
                    ? 'Conectado'
                    : connected === null
                      ? 'Não verificado'
                      : 'Desconectado'}
                </dd>
              </div>
            </dl>
            <div className="rounded-lg bg-muted p-3 text-sm space-y-2">
              <p>
                <strong>Revisão dos envios:</strong>{' '}
                {draft.automation.proactive_outreach_enabled
                  ? [
                      draft.automation.noshow_recovery_enabled &&
                        'remarcar faltas',
                      draft.automation.waitlist_enabled &&
                        'oferecer vagas da lista de espera',
                      draft.automation.recall_enabled &&
                        `convidar após ${draft.automation.recall_inactive_days} dias sem consulta`,
                    ]
                      .filter(Boolean)
                      .join('; ') || 'nenhuma situação de envio selecionada'
                  : 'a clínica não inicia conversas com pacientes por estas automações'}
                .
              </p>
              <p>
                Resumo semanal no seu WhatsApp:{' '}
                {draft.automation.weekly_report_enabled
                  ? 'ligado'
                  : 'desligado'}
                . Organização automática do funil:{' '}
                {draft.automation.funnel_automation_enabled
                  ? 'ligada'
                  : 'desligada'}
                .
              </p>
            </div>
            <label className="flex gap-3 items-start min-h-11 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={approved}
                disabled={!tested || sending}
                onChange={(event) => setApproved(event.target.checked)}
              />
              <span>
                Conferi as respostas e as opções de envio. Quero usar esta
                configuração.
                {!tested && (
                  <span className="block text-muted-foreground">
                    Envie uma mensagem de teste com este rascunho para
                    continuar.
                  </span>
                )}
              </span>
            </label>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                className="min-h-11"
                disabled={!tested || !approved || saving || sending}
                onClick={() => publish(false)}
              >
                {saving ? 'Salvando…' : 'Publicar configuração'}
              </Button>
              <Button
                className="min-h-11"
                disabled={!canActivate || saving || sending}
                onClick={() => publish(true)}
              >
                {config.agent_enabled
                  ? 'Publicar e manter respostas ativas'
                  : 'Publicar e ativar respostas'}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              “Publicar configuração” mantém as respostas{' '}
              {config.agent_enabled ? 'habilitadas' : 'pausadas'}. A ativação
              exige o WhatsApp conectado e o assistente disponível.
            </p>
          </Section>
          <Button
            variant="ghost"
            className="min-h-11"
            onClick={() => setStep('prepare')}
          >
            Voltar e ajustar
          </Button>
        </div>
      )}
    </div>
  )
}
