'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/app/providers'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { clinicsApi } from '@/lib/api'
import { getDayName } from '@/lib/utils'
import { FloppyDisk as Save, WifiHigh as Wifi, Clock, Stethoscope, Trash as Trash2, Plus, CheckCircle, XCircle, CaretRight as ChevronRight, X, CircleNotch as Loader2, User, Buildings as Building2, EnvelopeSimple as Mail, Phone, Link, Copy, CurrencyDollar, NotePencil, Sparkle, Warning } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/ui/page-header'
import { WhatsappConnectionWizard } from '@/components/settings/whatsapp-connection-wizard'

type Section = 'profile' | 'whatsapp' | 'hours' | 'services' | 'automacao'

export default function SettingsPage() {
  const { clinic, refreshClinic } = useAuth()
  const [activeSection, setActiveSection] = useState<Section>('profile')
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [editingField, setEditingField] = useState<string | null>(null)

  // Business Hours State
  const [businessHours, setBusinessHours] = useState(clinic?.business_hours || {})

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
  ]

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
    }
  }, [clinic])

  const [agentEnabled, setAgentEnabled] = useState(true)

  const handleToggleAgent = async (enabled: boolean) => {
    setAgentEnabled(enabled)
    try {
      await clinicsApi.updateProfile({ agent_enabled: enabled })
      showMessage('success', enabled ? 'IA ativada com sucesso!' : 'IA desativada com sucesso!')
      await refreshClinic()
    } catch (err) {
      setAgentEnabled(!enabled) // revert
      showMessage('error', 'Erro ao atualizar configuração.')
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

  return (
    <div className="space-y-8">
      <PageHeader title="Configuracoes" description="Gerencie as configuracoes da sua clinica e integracoes" />

      {/* Messages */}
      {error && (
        <div className="bg-destructive/10 text-destructive p-4 rounded-xl border border-destructive/20 flex items-center gap-3 mb-6">
          <XCircle className="h-5 w-5" />
          {error}
        </div>
      )}
      {success && (
        <div className="bg-success/10 text-success p-4 rounded-xl border border-success/20 flex items-center gap-3 mb-6">
          <CheckCircle className="h-5 w-5" />
          {success}
        </div>
      )}

      {/* Main Layout: Sidebar + Content */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar Navigation */}
        <div className="w-full lg:w-64 flex-shrink-0">
          <nav className="space-y-1">
            {sections.map((section) => {
              const Icon = section.icon
              return (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors",
                    activeSection === section.id
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className="h-5 w-5" />
                  <span className="font-medium">{section.label}</span>
                </button>
              )
            })}
          </nav>
        </div>

        {/* Content Area */}
        <Card className="flex-1 min-w-0 border-border/60">
          <CardContent className="p-6">
            {/* Profile Section */}
            {activeSection === 'profile' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-bold">Perfil da Clínica</h2>
                  {editingField !== 'profile' ? (
                    <Button variant="outline" size="sm" onClick={() => setEditingField('profile')}>
                      Editar
                    </Button>
                  ) : (
                    <div className="flex gap-3">
                      <Button variant="outline" size="sm" onClick={() => setEditingField(null)} className="gap-2">
                        <X className="h-4 w-4" />
                        Cancelar
                      </Button>
                      <Button size="sm" onClick={handleSaveProfile} disabled={saving === 'profile'} className="gap-2">
                        {saving === 'profile' ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4" />
                        )}
                        Salvar
                      </Button>
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  {/* Clinic Name */}
                  <div className={cn(
                    "flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3 py-3 border-b border-border/60",
                    editingField === 'profile' && "bg-muted/30 px-3 rounded-lg my-1"
                  )}>
                    <div className="flex items-center gap-3">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">Nome da Clínica</span>
                    </div>
                    {editingField === 'profile' ? (
                      <Input
                        value={profileForm.name}
                        onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                        className="w-full sm:w-64"
                        placeholder="Nome da clínica"
                      />
                    ) : (
                      <span className="text-muted-foreground">{clinic?.name || '-'}</span>
                    )}
                  </div>

                  {/* Email (read-only) */}
                  <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3 py-3 border-b border-border/60">
                    <div className="flex items-center gap-3">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">Email</span>
                    </div>
                    <span className="text-muted-foreground">{clinic?.email || '-'}</span>
                  </div>

                  {/* Phone */}
                  <div className={cn(
                    "flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3 py-3 border-b border-border/60",
                    editingField === 'profile' && "bg-muted/30 px-3 rounded-lg my-1"
                  )}>
                    <div className="flex items-center gap-3">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">Telefone</span>
                    </div>
                    {editingField === 'profile' ? (
                      <Input
                        value={profileForm.phone}
                        onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                        className="w-full sm:w-64"
                        placeholder="Telefone"
                      />
                    ) : (
                      <span className="text-muted-foreground">{clinic?.phone || '-'}</span>
                    )}
                  </div>

                  {/* Booking URL / Slug */}
                  <div className={cn(
                    "flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3 py-3 border-b border-border/60",
                    editingField === 'profile' && "bg-muted/30 px-3 rounded-lg my-1"
                  )}>
                    <div className="flex items-center gap-3">
                      <Link className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">Link de Agendamento</span>
                    </div>
                    {editingField === 'profile' ? (
                      <div className="flex items-center gap-2 w-full sm:w-auto">
                        <span className="text-muted-foreground text-sm shrink-0">/agendar/</span>
                        <Input
                          value={profileForm.slug}
                          onChange={(e) => setProfileForm({ ...profileForm, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                          className="flex-1 sm:flex-none sm:w-48"
                          placeholder="minha-clinica"
                        />
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2 min-w-0">
                        <span className="text-primary text-sm break-all">
                          {typeof window !== 'undefined' ? window.location.origin : ''}/agendar/{clinic?.slug || clinic?.id?.slice(0, 8)}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const url = `${window.location.origin}/agendar/${clinic?.slug || clinic?.id?.slice(0, 8)}`
                            navigator.clipboard.writeText(url)
                            showMessage('success', 'Link copiado!')
                          }}
                          className="gap-1"
                        >
                          <Copy className="h-4 w-4" />
                          Copiar
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* WhatsApp Section */}
            {activeSection === 'whatsapp' && (
              <div className="space-y-4">
                <h2 className="text-base font-bold mb-2">WhatsApp / Evolution API</h2>

                <div className="flex items-center justify-between p-4 border rounded-lg bg-card">
                  <div className="space-y-0.5">
                    <Label className="text-base">Agente de IA (Claude)</Label>
                    <p className="text-sm text-muted-foreground">
                      Quando ativado, a IA responderá automaticamente aos pacientes.
                    </p>
                  </div>
                  <Switch
                    checked={agentEnabled}
                    onCheckedChange={handleToggleAgent}
                  />
                </div>

                <WhatsappConnectionWizard />
              </div>
            )}

            {/* Business Hours Section */}
            {activeSection === 'hours' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-bold">Horários de Funcionamento</h2>
                  {editingField !== 'hours' ? (
                    <Button variant="outline" size="sm" onClick={() => setEditingField('hours')}>
                      Editar
                    </Button>
                  ) : (
                    <div className="flex gap-3">
                      <Button variant="outline" size="sm" onClick={() => setEditingField(null)} className="gap-2">
                        <X className="h-4 w-4" />
                        Cancelar
                      </Button>
                      <Button size="sm" onClick={handleSaveBusinessHours} disabled={saving === 'hours'} className="gap-2">
                        {saving === 'hours' ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4" />
                        )}
                        Salvar
                      </Button>
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  {[0, 1, 2, 3, 4, 5, 6].map((day) => (
                    <div
                      key={day}
                      className={cn(
                        "flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3 py-3 border-b border-border/60 last:border-0",
                        editingField === 'hours' && "bg-muted/30 px-3 rounded-lg my-1"
                      )}
                    >
                      <div className="flex items-center gap-3 w-36">
                        {editingField === 'hours' && (
                          <input
                            type="checkbox"
                            checked={businessHours[day]?.active || false}
                            onChange={(e) => updateBusinessHour(String(day), 'active', e.target.checked)}
                            className="rounded-md h-4 w-4 border-border text-primary focus:ring-primary"
                          />
                        )}
                        <span className={cn(
                          "font-medium",
                          businessHours[day]?.active ? 'text-foreground' : 'text-muted-foreground'
                        )}>
                          {getDayName(day)}
                        </span>
                      </div>

                      {editingField === 'hours' ? (
                        <div className="flex items-center gap-2">
                          <Input
                            type="time"
                            value={businessHours[day]?.start || '08:00'}
                            onChange={(e) => updateBusinessHour(String(day), 'start', e.target.value)}
                            disabled={!businessHours[day]?.active}
                            className="w-28"
                          />
                          <span className="text-muted-foreground">até</span>
                          <Input
                            type="time"
                            value={businessHours[day]?.end || '18:00'}
                            onChange={(e) => updateBusinessHour(String(day), 'end', e.target.value)}
                            disabled={!businessHours[day]?.active}
                            className="w-28"
                          />
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          {businessHours[day]?.active
                            ? `${businessHours[day]?.start || '08:00'} - ${businessHours[day]?.end || '18:00'}`
                            : 'Fechado'}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Services Section */}
            {activeSection === 'services' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-bold">Serviços / Procedimentos</h2>
                  {editingField !== 'services' ? (
                    <Button variant="outline" size="sm" onClick={() => setEditingField('services')}>
                      Editar
                    </Button>
                  ) : (
                    <div className="flex gap-3">
                      <Button variant="outline" size="sm" onClick={() => setEditingField(null)} className="gap-2">
                        <X className="h-4 w-4" />
                        Cancelar
                      </Button>
                      <Button size="sm" onClick={handleSaveServices} disabled={saving === 'services'} className="gap-2">
                        {saving === 'services' ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4" />
                        )}
                        Salvar
                      </Button>
                    </div>
                  )}
                </div>

                {/* Add new service (only in edit mode) */}
                {editingField === 'services' && (
                  <div className="flex flex-col gap-2 p-4 bg-muted/30 rounded-xl border border-border/60 mb-4">
                    <div className="flex flex-col sm:flex-row gap-2">
                      <div className="relative flex-1">
                        <Stethoscope className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Nome do serviço"
                          value={newService.name}
                          onChange={(e) => setNewService({ ...newService, name: e.target.value })}
                          className="pl-10"
                        />
                      </div>
                      <div className="relative w-full sm:w-28">
                        <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          type="number"
                          placeholder="Min"
                          value={newService.duration}
                          onChange={(e) => setNewService({ ...newService, duration: parseInt(e.target.value) || 30 })}
                          className="pl-10"
                        />
                      </div>
                      <div className="relative w-full sm:w-32">
                        <CurrencyDollar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="Preço"
                          value={newService.price}
                          onChange={(e) => setNewService({ ...newService, price: e.target.value })}
                          className="pl-10"
                        />
                      </div>
                    </div>
                    <div className="relative">
                      <NotePencil className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <textarea
                        placeholder="Instruções de preparo/pós-procedimento (opcional, enviadas pela IA quando solicitado)"
                        value={newService.instructions}
                        onChange={(e) => setNewService({ ...newService, instructions: e.target.value })}
                        rows={2}
                        className="w-full pl-10 pr-3 py-2 text-sm rounded-lg border border-input bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                    <Button variant="outline" onClick={addService} className="gap-1 self-end">
                      <Plus className="h-4 w-4" />
                      Adicionar
                    </Button>
                  </div>
                )}

                {/* Services list */}
                {services.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <div className="h-12 w-12 rounded-xl bg-muted/50 flex items-center justify-center mb-3">
                      <Stethoscope className="h-6 w-6 opacity-50" />
                    </div>
                    <p className="font-medium">Nenhum serviço cadastrado</p>
                    <p className="text-sm">Clique em Editar para adicionar serviços</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {services.map((service, index) => (
                      <div
                        key={index}
                        className={cn(
                          "flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3 py-3 border-b border-border/60 last:border-0 gap-3",
                          editingField === 'services' && "bg-muted/30 px-3 rounded-lg my-1"
                        )}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                            <Stethoscope className="h-4 w-4 text-primary" />
                          </div>
                          <div className="min-w-0">
                            <span className="font-medium truncate block">{service.name}</span>
                            {service.instructions && (
                              <p className="text-xs text-muted-foreground truncate">{service.instructions}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {typeof service.price === 'number' && (
                            <Badge variant="success" className="gap-1">
                              <CurrencyDollar className="h-3 w-3" />
                              R$ {service.price.toFixed(2)}
                            </Badge>
                          )}
                          <Badge variant="outline">{service.duration} min</Badge>
                          {editingField === 'services' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeService(index)}
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Automation Section */}
            {activeSection === 'automacao' && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <Sparkle className="h-5 w-5 text-primary" />
                    Automação com IA proativa
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Deixe a IA agir sozinha para recuperar faltas, reativar pacientes e
                    qualificar leads — sempre com trilha de auditoria e opção de opt-out.
                  </p>
                </div>

                {/* Warning about proactive messaging */}
                <div className="flex items-start gap-3 p-4 rounded-xl bg-warning/10 border border-warning/20">
                  <Warning className="h-5 w-5 text-warning shrink-0 mt-0.5" />
                  <p className="text-sm text-muted-foreground">
                    O envio proativo dispara mensagens de WhatsApp por iniciativa da clínica.
                    Use com responsabilidade: mensagens em excesso podem levar ao bloqueio do
                    número. A IA respeita horário comercial, limite diário por paciente e o
                    pedido de <strong>SAIR</strong> de cada paciente.
                  </p>
                </div>

                {/* Master switch */}
                <div className="flex items-center justify-between p-4 border rounded-lg bg-card">
                  <div className="space-y-0.5 pr-4">
                    <Label className="text-base">Envio proativo (interruptor geral)</Label>
                    <p className="text-sm text-muted-foreground">
                      Quando ativado, a IA pode iniciar conversas com pacientes por conta própria.
                      Os recursos abaixo só funcionam com esta chave ligada.
                    </p>
                  </div>
                  <Switch
                    checked={clinic?.proactive_outreach_enabled ?? false}
                    onCheckedChange={(v) => handleToggleAutomation('proactive_outreach_enabled', v)}
                    disabled={saving === 'proactive_outreach_enabled'}
                  />
                </div>

                {/* Outreach sub-features */}
                <div className={cn(
                  'space-y-1 rounded-xl border border-border/60 divide-y divide-border/60 transition-opacity',
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
                    <div key={item.field} className="flex items-center justify-between p-4">
                      <div className="space-y-0.5 pr-4">
                        <Label className="text-sm font-medium">{item.title}</Label>
                        <p className="text-xs text-muted-foreground">{item.desc}</p>
                      </div>
                      <Switch
                        checked={(clinic?.[item.field] as boolean) ?? false}
                        onCheckedChange={(v) => handleToggleAutomation(item.field, v)}
                        disabled={saving === item.field || !clinic?.proactive_outreach_enabled}
                      />
                    </div>
                  ))}

                  {/* Recall inactivity period */}
                  <div className="flex items-center justify-between p-4 gap-3 flex-wrap">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">Considerar inativo após</Label>
                      <p className="text-xs text-muted-foreground">Dias sem consulta para acionar o recall.</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={30}
                        max={730}
                        defaultValue={clinic?.recall_inactive_days ?? 180}
                        className="w-24"
                        onBlur={(e) => {
                          const v = parseInt(e.target.value)
                          if (!isNaN(v) && v !== (clinic?.recall_inactive_days ?? 180)) {
                            handleSaveRecallDays(v)
                          }
                        }}
                        disabled={!clinic?.proactive_outreach_enabled}
                      />
                      <span className="text-sm text-muted-foreground">dias</span>
                    </div>
                  </div>
                </div>

                {/* Independent features (do not send patient messages / or message the owner) */}
                <div className="space-y-1 rounded-xl border border-border/60 divide-y divide-border/60">
                  <div className="flex items-center justify-between p-4">
                    <div className="space-y-0.5 pr-4">
                      <Label className="text-sm font-medium">Qualificação automática do funil (CRM)</Label>
                      <p className="text-xs text-muted-foreground">
                        A IA classifica e move leads no funil com base nas conversas. Não envia mensagens.
                      </p>
                    </div>
                    <Switch
                      checked={clinic?.funnel_automation_enabled ?? false}
                      onCheckedChange={(v) => handleToggleAutomation('funnel_automation_enabled', v)}
                      disabled={saving === 'funnel_automation_enabled'}
                    />
                  </div>
                  <div className="flex items-center justify-between p-4">
                    <div className="space-y-0.5 pr-4">
                      <Label className="text-sm font-medium">Resumo semanal de desempenho</Label>
                      <p className="text-xs text-muted-foreground">
                        Envia um resumo dos indicadores da clínica no seu WhatsApp, uma vez por semana.
                      </p>
                    </div>
                    <Switch
                      checked={clinic?.weekly_report_enabled ?? false}
                      onCheckedChange={(v) => handleToggleAutomation('weekly_report_enabled', v)}
                      disabled={saving === 'weekly_report_enabled'}
                    />
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
