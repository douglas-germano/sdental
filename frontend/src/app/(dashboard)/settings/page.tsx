'use client'

import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/app/providers'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Stepper } from '@/components/ui/stepper'
import { Progress } from '@/components/ui/progress'
import { clinicsApi, billingApi, conversationsApi } from '@/lib/api'
import { getDayName, formatPhone } from '@/lib/utils'
import { FloppyDisk as Save, WifiHigh as Wifi, Clock, Stethoscope, Trash as Trash2, Plus, CheckCircle, XCircle, X, CircleNotch as Loader2, Buildings as Building2, EnvelopeSimple as Mail, Phone, Link, Copy, CurrencyDollar, NotePencil, Sparkle, Warning, CreditCard, ArrowSquareOut } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/ui/page-header'
import { WhatsappConnectionWizard } from '@/components/settings/whatsapp-connection-wizard'
import type { BillingStatus, SubscriptionStatus, Service } from '@/types'

type Section = 'profile' | 'whatsapp' | 'hours' | 'services' | 'automacao' | 'assinatura'

const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, { label: string; variant: 'success' | 'warning' | 'destructive' }> = {
  pending_payment: { label: 'Pagamento pendente', variant: 'warning' },
  active: { label: 'Ativa', variant: 'success' },
  late: { label: 'Pagamento atrasado', variant: 'warning' },
  canceled: { label: 'Cancelada', variant: 'destructive' },
  refunded: { label: 'Reembolsada', variant: 'destructive' },
  chargeback: { label: 'Contestada (chargeback)', variant: 'destructive' },
}

/* ------------------------------------------------------------------ */
/* HIG settings building blocks: one section header, one grouped list, */
/* one row shape - every section renders through these.                */
/* ------------------------------------------------------------------ */

function SectionHeader({ title, description, actions }: {
  title: string
  description?: string
  actions?: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        {description && (
          <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  )
}

function SettingsGroup({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn(
      'rounded-card border border-border bg-card shadow-soft divide-y divide-border overflow-hidden',
      className
    )}>
      {children}
    </div>
  )
}

function SettingsRow({ icon: Icon, label, description, children, stacked = false, className }: {
  icon?: React.ComponentType<{ className?: string }>
  label: React.ReactNode
  description?: React.ReactNode
  children?: React.ReactNode
  /** Stack the control under the label on small screens (for wide inputs) */
  stacked?: boolean
  className?: string
}) {
  return (
    <div className={cn(
      'px-4 py-3 min-h-[44px] gap-1.5 sm:gap-4',
      stacked
        ? 'flex flex-col sm:flex-row sm:items-center sm:justify-between'
        : 'flex items-center justify-between',
      className
    )}>
      <div className="flex items-center gap-3 min-w-0">
        {Icon && <Icon className="h-4 w-4 text-muted-foreground shrink-0" />}
        <div className="min-w-0">
          <span className="text-sm font-medium text-foreground block">{label}</span>
          {description && (
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          )}
        </div>
      </div>
      {children && <div className="flex items-center gap-2 min-w-0 shrink-0 sm:justify-end">{children}</div>}
    </div>
  )
}

function EditActions({ editing, saving, onEdit, onCancel, onSave }: {
  editing: boolean
  saving: boolean
  onEdit: () => void
  onCancel: () => void
  onSave: () => void
}) {
  if (!editing) {
    return (
      <Button variant="outline" size="sm" onClick={onEdit}>Editar</Button>
    )
  }
  return (
    <>
      <Button variant="ghost" size="sm" onClick={onCancel} className="gap-1.5">
        <X className="h-4 w-4" />
        Cancelar
      </Button>
      <Button size="sm" onClick={onSave} disabled={saving} className="gap-1.5">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Salvar
      </Button>
    </>
  )
}

export default function SettingsPage() {
  const { clinic, refreshClinic } = useAuth()
  const [activeSection, setActiveSection] = useState<Section>('profile')
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [editingField, setEditingField] = useState<string | null>(null)
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null)
  const [billingLoading, setBillingLoading] = useState(true)

  // Business Hours State
  const [businessHours, setBusinessHours] = useState(clinic?.business_hours || {})

  // Recall inactivity period (stepper-controlled, saved on change)
  const [recallDays, setRecallDays] = useState(clinic?.recall_inactive_days ?? 180)

  // Services State
  const [services, setServices] = useState(clinic?.services || [])
  const [newService, setNewService] = useState({ name: '', duration: 30, price: '', instructions: '' })

  // Profile State
  const [profileForm, setProfileForm] = useState({
    name: clinic?.name || '',
    phone: clinic?.phone || '',
    slug: clinic?.slug || ''
  })

  const sections = [
    { id: 'profile' as Section, label: 'Perfil da Clínica', icon: Building2 },
    { id: 'whatsapp' as Section, label: 'WhatsApp / Evolution', icon: Wifi },
    { id: 'hours' as Section, label: 'Horários de Funcionamento', icon: Clock },
    { id: 'services' as Section, label: 'Serviços / Procedimentos', icon: Stethoscope },
    { id: 'automacao' as Section, label: 'Automação (IA proativa)', icon: Sparkle },
    { id: 'assinatura' as Section, label: 'Assinatura', icon: CreditCard },
  ]

  useEffect(() => {
    billingApi.getStatus()
      .then((res) => setBillingStatus(res.data))
      .catch(() => setBillingStatus(null))
      .finally(() => setBillingLoading(false))
  }, [])

  const handleToggleAutomation = async (
    field:
      | 'proactive_outreach_enabled'
      | 'noshow_recovery_enabled'
      | 'waitlist_enabled'
      | 'recall_enabled'
      | 'funnel_automation_enabled'
      | 'weekly_report_enabled',
    value: boolean
  ) => {
    setSaving(field)
    try {
      await clinicsApi.updateProfile({ [field]: value })
      await refreshClinic()
      showMessage('success', 'Configuração de automação salva!')
    } catch {
      showMessage('error', 'Erro ao salvar configuração.')
    } finally {
      setSaving(null)
    }
  }

  const handleSaveRecallDays = async (days: number) => {
    setSaving('recall_inactive_days')
    try {
      await clinicsApi.updateProfile({ recall_inactive_days: days })
      await refreshClinic()
      showMessage('success', 'Período de recall atualizado!')
    } catch {
      showMessage('error', 'Erro ao salvar período.')
    } finally {
      setSaving(null)
    }
  }

  const showMessage = (type: 'success' | 'error', message: string) => {
    if (type === 'success') {
      setSuccess(message)
      setError(null)
    } else {
      setError(message)
      setSuccess(null)
    }
    setTimeout(() => {
      setSuccess(null)
      setError(null)
    }, 3000)
  }

  // Sync profile form when clinic data changes
  useEffect(() => {
    if (clinic) {
      setProfileForm({
        name: clinic.name || '',
        phone: clinic.phone || '',
        slug: clinic.slug || ''
      })
      setAgentEnabled(clinic.agent_enabled ?? true)
      setBusinessHours(clinic.business_hours || {})
      setServices(clinic.services || [])
      setRecallDays(clinic.recall_inactive_days ?? 180)
    }
  }, [clinic])

  const [agentEnabled, setAgentEnabled] = useState(true)

  const handleToggleAgent = async (enabled: boolean) => {
    setAgentEnabled(enabled)
    try {
      await clinicsApi.updateProfile({ agent_enabled: enabled })
      showMessage('success', enabled ? 'IA ativada com sucesso!' : 'IA desativada com sucesso!')
      await refreshClinic()
    } catch {
      setAgentEnabled(!enabled) // revert
      showMessage('error', 'Erro ao atualizar configuração.')
    }
  }

  const [syncingHistory, setSyncingHistory] = useState(false)
  // Determinate progress for the batched history sync: the API works in
  // batches and reports how many conversations remain, so the bar can show
  // done/(done+remaining) while we auto-continue until nothing is left.
  const [syncProgress, setSyncProgress] = useState<{ done: number; total: number } | null>(null)
  const syncCancelled = useRef(false)

  const handleSyncAllHistory = async () => {
    setSyncingHistory(true)
    syncCancelled.current = false
    let done = 0
    let imported = 0
    try {
      for (;;) {
        const response = await conversationsApi.syncAllHistory()
        const { synced, total_added, remaining } = response.data
        done += synced
        imported += total_added
        setSyncProgress({ done, total: done + remaining })
        if (remaining <= 0 || syncCancelled.current) break
      }
      showMessage('success', `${imported} mensagem(ns) importada(s) em ${done} conversa(s). Histórico sincronizado.`)
    } catch {
      showMessage('error', 'Erro ao sincronizar histórico das conversas.')
    } finally {
      setSyncingHistory(false)
      setSyncProgress(null)
    }
  }

  const handleSaveProfile = async () => {
    setSaving('profile')
    try {
      await clinicsApi.updateProfile({
        name: profileForm.name,
        phone: profileForm.phone,
        slug: profileForm.slug
      })
      await refreshClinic()
      showMessage('success', 'Perfil salvo!')
      setEditingField(null)
    } catch {
      showMessage('error', 'Erro ao salvar perfil')
    } finally {
      setSaving(null)
    }
  }

  const handleSaveBusinessHours = async () => {
    setSaving('hours')
    try {
      await clinicsApi.updateBusinessHours(businessHours)
      await refreshClinic()
      showMessage('success', 'Horários salvos!')
      setEditingField(null)
    } catch {
      showMessage('error', 'Erro ao salvar horários')
    } finally {
      setSaving(null)
    }
  }

  const handleSaveServices = async () => {
    setSaving('services')
    try {
      await clinicsApi.updateServices(services)
      await refreshClinic()
      showMessage('success', 'Serviços salvos!')
      setEditingField(null)
    } catch {
      showMessage('error', 'Erro ao salvar serviços')
    } finally {
      setSaving(null)
    }
  }

  const addService = () => {
    if (!newService.name.trim()) return
    setServices([...services, {
      name: newService.name,
      duration: newService.duration,
      price: newService.price ? parseFloat(newService.price) : undefined,
      instructions: newService.instructions.trim() || undefined
    }])
    setNewService({ name: '', duration: 30, price: '', instructions: '' })
  }

  const updateService = (index: number, field: keyof Service, value: string | number | undefined) => {
    setServices(services.map((s, i) => (i === index ? { ...s, [field]: value } : s)))
  }

  const removeService = (index: number) => {
    setServices(services.filter((_, i) => i !== index))
  }

  const updateBusinessHour = (day: string, field: string, value: string | boolean) => {
    setBusinessHours({
      ...businessHours,
      [day]: {
        ...businessHours[day],
        [field]: value
      }
    })
  }

  const toggleBusinessHourBreak = (day: string, enabled: boolean) => {
    if (enabled) {
      setBusinessHours({
        ...businessHours,
        [day]: {
          ...businessHours[day],
          break_start: businessHours[day]?.break_start || '12:00',
          break_end: businessHours[day]?.break_end || '13:00'
        }
      })
    } else {
      const dayHours = { ...businessHours[day] }
      delete dayHours.break_start
      delete dayHours.break_end
      setBusinessHours({ ...businessHours, [day]: dayHours })
    }
  }

  const bookingUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/agendar/${clinic?.slug || clinic?.id?.slice(0, 8)}`
    : `/agendar/${clinic?.slug || clinic?.id?.slice(0, 8)}`

  return (
    <div className="space-y-6">
      <PageHeader title="Configurações" description="Gerencie as configurações da sua clínica e integrações" />

      {/* Messages */}
      {error && (
        <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-card border border-destructive/20 flex items-center gap-3 text-sm">
          <XCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="bg-success/10 text-success px-4 py-3 rounded-card border border-success/20 flex items-center gap-3 text-sm">
          <CheckCircle className="h-4 w-4 shrink-0" />
          {success}
        </div>
      )}

      {/* Rail + detail pane */}
      <div className="flex flex-col lg:flex-row gap-6 lg:gap-10">
        {/* Rail: vertical on desktop, horizontal scroll on mobile */}
        <nav className="lg:w-56 shrink-0 flex lg:flex-col gap-1 overflow-x-auto pb-1 lg:pb-0 -mx-1 px-1">
          {sections.map((section) => {
            const Icon = section.icon
            return (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={cn(
                  'flex items-center gap-2.5 h-9 px-3 rounded-lg text-sm font-medium whitespace-nowrap transition-colors shrink-0 lg:shrink lg:w-full text-left',
                  activeSection === section.id
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{section.label}</span>
              </button>
            )
          })}
        </nav>

        {/* Detail pane */}
        <div className="flex-1 min-w-0 space-y-5">
          {/* Profile */}
          {activeSection === 'profile' && (
            <>
              <SectionHeader
                title="Perfil da Clínica"
                description="Identificação usada no painel, nas mensagens e na página pública de agendamento."
                actions={
                  <EditActions
                    editing={editingField === 'profile'}
                    saving={saving === 'profile'}
                    onEdit={() => setEditingField('profile')}
                    onCancel={() => setEditingField(null)}
                    onSave={handleSaveProfile}
                  />
                }
              />
              <SettingsGroup>
                <SettingsRow icon={Building2} label="Nome da Clínica" stacked>
                  {editingField === 'profile' ? (
                    <Input
                      value={profileForm.name}
                      onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                      className="w-full sm:w-64"
                      placeholder="Nome da clínica"
                    />
                  ) : (
                    <span className="text-sm text-muted-foreground truncate">{clinic?.name || '—'}</span>
                  )}
                </SettingsRow>

                <SettingsRow icon={Mail} label="Email">
                  <span className="text-sm text-muted-foreground truncate">{clinic?.email || '—'}</span>
                </SettingsRow>

                <SettingsRow icon={Phone} label="Telefone" stacked>
                  {editingField === 'profile' ? (
                    <Input
                      value={profileForm.phone}
                      onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                      className="w-full sm:w-64"
                      placeholder="Telefone"
                    />
                  ) : (
                    <span className="text-sm text-muted-foreground">{clinic?.phone ? formatPhone(clinic.phone) : '—'}</span>
                  )}
                </SettingsRow>

                <SettingsRow icon={Link} label="Link de Agendamento" stacked>
                  {editingField === 'profile' ? (
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <span className="text-sm text-muted-foreground shrink-0">/agendar/</span>
                      <Input
                        value={profileForm.slug}
                        onChange={(e) => setProfileForm({ ...profileForm, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                        className="flex-1 sm:flex-none sm:w-48"
                        placeholder="minha-clinica"
                      />
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                      <span className="text-sm text-primary break-all">{bookingUrl}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText(bookingUrl)
                          showMessage('success', 'Link copiado!')
                        }}
                        className="gap-1.5"
                      >
                        <Copy className="h-4 w-4" />
                        Copiar
                      </Button>
                    </div>
                  )}
                </SettingsRow>
              </SettingsGroup>
            </>
          )}

          {/* WhatsApp */}
          {activeSection === 'whatsapp' && (
            <>
              <SectionHeader
                title="WhatsApp / Evolution API"
                description="Conexão do número da clínica e comportamento do assistente."
              />
              <SettingsGroup>
                <SettingsRow
                  label="Agente de IA"
                  description="Quando ativado, a IA responde automaticamente aos pacientes."
                >
                  <Switch checked={agentEnabled} onCheckedChange={handleToggleAgent} />
                </SettingsRow>
              </SettingsGroup>

              <WhatsappConnectionWizard />

              <SettingsGroup>
                <SettingsRow
                  label="Sincronizar histórico de mensagens"
                  description="Importa mensagens antigas de todas as conversas, incluindo as enviadas direto pelo aparelho, para dar mais contexto à IA."
                  stacked
                >
                  {syncingHistory ? (
                    <Button variant="outline" size="sm" onClick={() => { syncCancelled.current = true }}>
                      Parar
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" onClick={handleSyncAllHistory}>
                      Sincronizar tudo
                    </Button>
                  )}
                </SettingsRow>
                {syncingHistory && (
                  <div className="px-4 py-3 space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Sincronizando conversas…</span>
                      {syncProgress && <span className="tabular-nums">{syncProgress.done} de {syncProgress.total}</span>}
                    </div>
                    <Progress
                      aria-label="Progresso da sincronização de histórico"
                      value={syncProgress && syncProgress.total > 0 ? (syncProgress.done / syncProgress.total) * 100 : undefined}
                    />
                  </div>
                )}
              </SettingsGroup>
            </>
          )}

          {/* Business hours */}
          {activeSection === 'hours' && (
            <>
              <SectionHeader
                title="Horários de Funcionamento"
                description="A IA só oferece horários dentro do expediente de cada dia."
                actions={
                  <EditActions
                    editing={editingField === 'hours'}
                    saving={saving === 'hours'}
                    onEdit={() => setEditingField('hours')}
                    onCancel={() => setEditingField(null)}
                    onSave={handleSaveBusinessHours}
                  />
                }
              />
              <SettingsGroup>
                {[0, 1, 2, 3, 4, 5, 6].map((day) => {
                  const dayHours = businessHours[day]
                  const hasBreak = Boolean(dayHours?.break_start && dayHours?.break_end)

                  return (
                    <div key={day} className="px-4 py-3 space-y-2">
                      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                        <div className="flex items-center gap-3 sm:w-40 shrink-0">
                          {editingField === 'hours' && (
                            <input
                              type="checkbox"
                              checked={dayHours?.active || false}
                              onChange={(e) => updateBusinessHour(String(day), 'active', e.target.checked)}
                              className="rounded h-4 w-4 border-border text-primary focus:ring-primary"
                            />
                          )}
                          <span className={cn(
                            'text-sm font-medium',
                            dayHours?.active ? 'text-foreground' : 'text-muted-foreground'
                          )}>
                            {getDayName(day)}
                          </span>
                        </div>

                        {editingField === 'hours' ? (
                          <div className="flex items-center gap-2">
                            <Input
                              type="time"
                              value={dayHours?.start || '08:00'}
                              onChange={(e) => updateBusinessHour(String(day), 'start', e.target.value)}
                              disabled={!dayHours?.active}
                              className="w-28"
                            />
                            <span className="text-sm text-muted-foreground">até</span>
                            <Input
                              type="time"
                              value={dayHours?.end || '18:00'}
                              onChange={(e) => updateBusinessHour(String(day), 'end', e.target.value)}
                              disabled={!dayHours?.active}
                              className="w-28"
                            />
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            {dayHours?.active
                              ? `${dayHours?.start || '08:00'} – ${dayHours?.end || '18:00'}`
                                + (hasBreak ? ` (almoço ${dayHours?.break_start}–${dayHours?.break_end})` : '')
                              : 'Fechado'}
                          </span>
                        )}
                      </div>

                      {editingField === 'hours' && dayHours?.active && (
                        <div className="flex items-center gap-2 flex-wrap sm:pl-[10.75rem]">
                          <input
                            type="checkbox"
                            checked={hasBreak}
                            onChange={(e) => toggleBusinessHourBreak(String(day), e.target.checked)}
                            className="rounded h-4 w-4 border-border text-primary focus:ring-primary"
                          />
                          <span className="text-xs text-muted-foreground shrink-0">Pausa para almoço</span>
                          {hasBreak && (
                            <>
                              <Input
                                type="time"
                                value={dayHours?.break_start || '12:00'}
                                onChange={(e) => updateBusinessHour(String(day), 'break_start', e.target.value)}
                                className="w-28"
                              />
                              <span className="text-sm text-muted-foreground">até</span>
                              <Input
                                type="time"
                                value={dayHours?.break_end || '13:00'}
                                onChange={(e) => updateBusinessHour(String(day), 'break_end', e.target.value)}
                                className="w-28"
                              />
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </SettingsGroup>
            </>
          )}

          {/* Services */}
          {activeSection === 'services' && (
            <>
              <SectionHeader
                title="Serviços / Procedimentos"
                description="O que a IA pode oferecer e agendar, com duração e preço."
                actions={
                  <EditActions
                    editing={editingField === 'services'}
                    saving={saving === 'services'}
                    onEdit={() => setEditingField('services')}
                    onCancel={() => setEditingField(null)}
                    onSave={handleSaveServices}
                  />
                }
              />

              {editingField === 'services' && (
                <SettingsGroup className="bg-muted/40">
                  <div className="p-4 space-y-2">
                    <div className="flex flex-col sm:flex-row gap-2">
                      <div className="relative flex-1">
                        <Stethoscope className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Nome do serviço"
                          value={newService.name}
                          onChange={(e) => setNewService({ ...newService, name: e.target.value })}
                          className="pl-9"
                        />
                      </div>
                      <Stepper
                        aria-label="Duração do serviço em minutos"
                        value={newService.duration}
                        min={5}
                        max={480}
                        step={5}
                        unit="min"
                        onChange={(v) => setNewService({ ...newService, duration: v })}
                      />
                      <div className="relative w-full sm:w-32">
                        <CurrencyDollar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="Preço"
                          value={newService.price}
                          onChange={(e) => setNewService({ ...newService, price: e.target.value })}
                          className="pl-9"
                        />
                      </div>
                    </div>
                    <div className="relative">
                      <NotePencil className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                      <textarea
                        placeholder="Instruções de preparo/pós-procedimento (opcional, enviadas pela IA quando solicitado)"
                        value={newService.instructions}
                        onChange={(e) => setNewService({ ...newService, instructions: e.target.value })}
                        rows={2}
                        className="w-full pl-9 pr-3 py-2 text-sm rounded-button border border-input bg-card resize-none focus:outline-none focus:ring-2 focus:ring-ring/25 focus:border-primary placeholder:text-muted-foreground/50"
                      />
                    </div>
                    <div className="flex justify-end">
                      <Button variant="outline" size="sm" onClick={addService} className="gap-1.5">
                        <Plus className="h-4 w-4" />
                        Adicionar
                      </Button>
                    </div>
                  </div>
                </SettingsGroup>
              )}

              {services.length === 0 ? (
                <SettingsGroup>
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center mb-3">
                      <Stethoscope className="h-6 w-6 opacity-50" />
                    </div>
                    <p className="text-sm font-medium">Nenhum serviço cadastrado</p>
                    <p className="text-sm">Clique em Editar para adicionar serviços</p>
                  </div>
                </SettingsGroup>
              ) : (
                <SettingsGroup>
                  {services.map((service, index) => (
                    editingField === 'services' ? (
                      <div key={index} className="p-4 space-y-2">
                        <div className="flex flex-col sm:flex-row gap-2">
                          <div className="relative flex-1">
                            <Stethoscope className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              value={service.name}
                              onChange={(e) => updateService(index, 'name', e.target.value)}
                              className="pl-9"
                            />
                          </div>
                          <Stepper
                            aria-label="Duração do serviço em minutos"
                            value={service.duration}
                            min={5}
                            max={480}
                            step={5}
                            unit="min"
                            onChange={(v) => updateService(index, 'duration', v)}
                          />
                          <div className="relative w-full sm:w-32">
                            <CurrencyDollar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="Preço"
                              value={service.price ?? ''}
                              onChange={(e) => updateService(index, 'price', e.target.value ? parseFloat(e.target.value) : undefined)}
                              className="pl-9"
                            />
                          </div>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => removeService(index)}
                            className="text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0 self-center"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="relative">
                          <NotePencil className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                          <textarea
                            placeholder="Instruções de preparo/pós-procedimento (opcional, enviadas pela IA quando solicitado)"
                            value={service.instructions || ''}
                            onChange={(e) => updateService(index, 'instructions', e.target.value || undefined)}
                            rows={2}
                            className="w-full pl-9 pr-3 py-2 text-sm rounded-button border border-input bg-card resize-none focus:outline-none focus:ring-2 focus:ring-ring/25 focus:border-primary placeholder:text-muted-foreground/50"
                          />
                        </div>
                      </div>
                    ) : (
                      <SettingsRow
                        key={index}
                        label={service.name}
                        description={service.instructions}
                      >
                        {typeof service.price === 'number' && (
                          <Badge variant="success">R$ {service.price.toFixed(2)}</Badge>
                        )}
                        <Badge variant="secondary">{service.duration} min</Badge>
                      </SettingsRow>
                    )
                  ))}
                </SettingsGroup>
              )}
            </>
          )}

          {/* Automation */}
          {activeSection === 'automacao' && (
            <>
              <SectionHeader
                title="Automação (IA proativa)"
                description="Deixe a IA agir sozinha para recuperar faltas, reativar pacientes e qualificar leads — sempre com trilha de auditoria e opção de opt-out."
              />

              <div className="flex items-start gap-3 px-4 py-3 rounded-card bg-warning/10 border border-warning/20">
                <Warning className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                <p className="text-sm text-muted-foreground">
                  O envio proativo dispara mensagens de WhatsApp por iniciativa da clínica.
                  Use com responsabilidade: mensagens em excesso podem levar ao bloqueio do
                  número. A IA respeita horário comercial, limite diário por paciente e o
                  pedido de <strong>SAIR</strong> de cada paciente.
                </p>
              </div>

              <SettingsGroup>
                <SettingsRow
                  label="Envio proativo (interruptor geral)"
                  description="Quando ativado, a IA pode iniciar conversas com pacientes por conta própria. Os recursos abaixo só funcionam com esta chave ligada."
                >
                  <Switch
                    checked={clinic?.proactive_outreach_enabled ?? false}
                    onCheckedChange={(v) => handleToggleAutomation('proactive_outreach_enabled', v)}
                    disabled={saving === 'proactive_outreach_enabled'}
                  />
                </SettingsRow>
              </SettingsGroup>

              <SettingsGroup className={cn(
                'transition-opacity',
                !clinic?.proactive_outreach_enabled && 'opacity-50 pointer-events-none'
              )}>
                {[
                  {
                    field: 'noshow_recovery_enabled' as const,
                    title: 'Recuperação de faltas e cancelamentos',
                    desc: 'Reabre a conversa com quem faltou ou cancelou e oferece remarcar.',
                  },
                  {
                    field: 'waitlist_enabled' as const,
                    title: 'Lista de espera inteligente',
                    desc: 'Quando um horário abre, oferece a vaga a um paciente com consulta mais distante.',
                  },
                  {
                    field: 'recall_enabled' as const,
                    title: 'Reativação de pacientes inativos (recall)',
                    desc: 'Convida pacientes sem consulta há muito tempo para um retorno.',
                  },
                ].map((item) => (
                  <SettingsRow key={item.field} label={item.title} description={item.desc}>
                    <Switch
                      checked={(clinic?.[item.field] as boolean) ?? false}
                      onCheckedChange={(v) => handleToggleAutomation(item.field, v)}
                      disabled={saving === item.field || !clinic?.proactive_outreach_enabled}
                    />
                  </SettingsRow>
                ))}

                <SettingsRow
                  label="Considerar inativo após"
                  description="Dias sem consulta para acionar o recall."
                >
                  <Stepper
                    aria-label="Dias sem consulta para acionar o recall"
                    value={recallDays}
                    min={30}
                    max={730}
                    step={30}
                    unit="dias"
                    onChange={(v) => {
                      setRecallDays(v)
                      if (v !== (clinic?.recall_inactive_days ?? 180)) handleSaveRecallDays(v)
                    }}
                    disabled={!clinic?.proactive_outreach_enabled}
                  />
                </SettingsRow>
              </SettingsGroup>

              <SettingsGroup>
                <SettingsRow
                  label="Qualificação automática do funil (CRM)"
                  description="A IA classifica e move leads no funil com base nas conversas. Não envia mensagens."
                >
                  <Switch
                    checked={clinic?.funnel_automation_enabled ?? false}
                    onCheckedChange={(v) => handleToggleAutomation('funnel_automation_enabled', v)}
                    disabled={saving === 'funnel_automation_enabled'}
                  />
                </SettingsRow>
                <SettingsRow
                  label="Resumo semanal de desempenho"
                  description="Envia um resumo dos indicadores da clínica no seu WhatsApp, uma vez por semana."
                >
                  <Switch
                    checked={clinic?.weekly_report_enabled ?? false}
                    onCheckedChange={(v) => handleToggleAutomation('weekly_report_enabled', v)}
                    disabled={saving === 'weekly_report_enabled'}
                  />
                </SettingsRow>
              </SettingsGroup>
            </>
          )}

          {/* Billing / Subscription */}
          {activeSection === 'assinatura' && (
            <>
              <SectionHeader
                title="Assinatura"
                description="A assinatura do SDental é processada pela Kiwify."
              />

              {billingLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm py-6">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Carregando status da assinatura...
                </div>
              ) : !billingStatus ? (
                <p className="text-sm text-muted-foreground py-6">
                  Não foi possível carregar o status da assinatura.
                </p>
              ) : (
                <SettingsGroup>
                  <SettingsRow label="Status">
                    <Badge variant={SUBSCRIPTION_STATUS_LABELS[billingStatus.subscription_status].variant}>
                      {SUBSCRIPTION_STATUS_LABELS[billingStatus.subscription_status].label}
                    </Badge>
                  </SettingsRow>
                  {billingStatus.subscription_period_end && (
                    <SettingsRow label="Próxima cobrança">
                      <span className="text-sm text-muted-foreground">
                        {new Date(billingStatus.subscription_period_end).toLocaleDateString('pt-BR')}
                      </span>
                    </SettingsRow>
                  )}
                  {billingStatus.checkout_url && (
                    <SettingsRow
                      label={billingStatus.subscription_status === 'active' ? 'Gerenciar assinatura' : 'Regularizar pagamento'}
                      description="Você será redirecionado para o checkout seguro da Kiwify."
                      stacked
                    >
                      <Button asChild size="sm" className="gap-1.5">
                        <a href={billingStatus.checkout_url} target="_blank" rel="noopener noreferrer">
                          Ir para a Kiwify
                          <ArrowSquareOut className="h-4 w-4" />
                        </a>
                      </Button>
                    </SettingsRow>
                  )}
                </SettingsGroup>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
