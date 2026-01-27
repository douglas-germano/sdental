'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/app/providers'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { clinicsApi } from '@/lib/api'
import { getDayName } from '@/lib/utils'
import {
  Save, Wifi, Clock, Stethoscope, Trash2, Plus, CheckCircle, XCircle,
  ChevronRight, X, Loader2
} from 'lucide-react'
import { cn } from '@/lib/utils'

type Section = 'whatsapp' | 'hours' | 'services'

export default function SettingsPage() {
  const { clinic, refreshClinic } = useAuth()
  const [activeSection, setActiveSection] = useState<Section>('whatsapp')
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [editingField, setEditingField] = useState<string | null>(null)

  // Evolution API State
  const [evolutionStatus, setEvolutionStatus] = useState<'connected' | 'disconnected' | 'checking'>('checking')
  const [qrCode, setQrCode] = useState<string | null>(null)

  // Business Hours State
  const [businessHours, setBusinessHours] = useState(clinic?.business_hours || {})

  // Services State
  const [services, setServices] = useState(clinic?.services || [])
  const [newService, setNewService] = useState({ name: '', duration: 30 })

  const sections = [
    { id: 'whatsapp' as Section, label: 'WhatsApp / Evolution', icon: Wifi },
    { id: 'hours' as Section, label: 'Horários de Funcionamento', icon: Clock },
    { id: 'services' as Section, label: 'Serviços / Procedimentos', icon: Stethoscope },
  ]

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

  const checkStatus = async () => {
    try {
      const { data } = await clinicsApi.getEvolutionStatus()
      if (data.connected) {
        setEvolutionStatus('connected')
        setQrCode(null)
      } else {
        setEvolutionStatus('disconnected')
      }
    } catch {
      setEvolutionStatus('disconnected')
    }
  }

  useEffect(() => {
    checkStatus()
    let interval: NodeJS.Timeout
    if (qrCode) {
      interval = setInterval(checkStatus, 3000)
    }
    return () => clearInterval(interval)
  }, [qrCode])

  const handleConnect = async () => {
    setSaving('evolution')
    setError(null)
    try {
      await clinicsApi.createEvolutionInstance()
      const { data } = await clinicsApi.getEvolutionQrCode()
      if (data.qrcode) {
        setQrCode(data.qrcode)
      } else {
        checkStatus()
      }
    } catch (err: any) {
      console.error(err)
      showMessage('error', 'Erro ao iniciar conexão. Tente novamente.')
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
    setServices([...services, { ...newService }])
    setNewService({ name: '', duration: 30 })
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

  // Setting Row Component
  const SettingRow = ({
    label,
    value,
    onEdit,
    badge,
    badgeVariant = 'outline'
  }: {
    label: string
    value: React.ReactNode
    onEdit?: () => void
    badge?: string
    badgeVariant?: 'outline' | 'success' | 'destructive'
  }) => (
    <div className="flex items-center justify-between py-4 border-b border-border/50 last:border-0">
      <div>
        <p className="font-medium text-foreground">{label}</p>
        <div className="text-sm text-muted-foreground mt-0.5">{value}</div>
      </div>
      <div className="flex items-center gap-2">
        {badge && (
          <Badge variant={badgeVariant}>{badge}</Badge>
        )}
        {onEdit && (
          <Button variant="outline" size="sm" onClick={onEdit}>
            Editar
          </Button>
        )}
      </div>
    </div>
  )

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground">
          Gerencie as configurações da sua clínica e integrações
        </p>
      </div>

      {/* Messages */}
      {error && (
        <div className="bg-destructive/10 text-destructive p-4 rounded-xl border border-destructive/20 flex items-center gap-3 animate-fade-in mb-6">
          <XCircle className="h-5 w-5" />
          {error}
        </div>
      )}
      {success && (
        <div className="bg-success/10 text-success p-4 rounded-xl border border-success/20 flex items-center gap-3 animate-fade-in mb-6">
          <CheckCircle className="h-5 w-5" />
          {success}
        </div>
      )}

      {/* Main Layout: Sidebar + Content */}
      <div className="flex gap-6">
        {/* Sidebar Navigation */}
        <div className="w-64 flex-shrink-0">
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
        <Card className="flex-1 border-border/50">
          <CardContent className="p-6">
            {/* WhatsApp Section */}
            {activeSection === 'whatsapp' && (
              <div className="space-y-2">
                <h2 className="text-lg font-semibold mb-4">WhatsApp / Evolution API</h2>

                <SettingRow
                  label="Status da Conexão"
                  value={evolutionStatus === 'connected'
                    ? "WhatsApp conectado e pronto para receber mensagens"
                    : "WhatsApp não está conectado"}
                  badge={evolutionStatus === 'connected' ? 'Conectado' : 'Desconectado'}
                  badgeVariant={evolutionStatus === 'connected' ? 'success' : 'outline'}
                />

                {evolutionStatus === 'disconnected' && !qrCode && (
                  <div className="pt-4">
                    <Button
                      variant="gradient"
                      onClick={handleConnect}
                      disabled={saving === 'evolution'}
                      className="gap-2"
                    >
                      <Wifi className="h-4 w-4" />
                      {saving === 'evolution' ? 'Iniciando...' : 'Conectar WhatsApp'}
                    </Button>
                  </div>
                )}

                {qrCode && (
                  <div className="pt-4 flex flex-col items-center animate-fade-in">
                    <h3 className="font-semibold mb-4">Escaneie o QR Code</h3>
                    <div className="bg-white p-4 rounded-2xl border border-border/50 shadow-soft">
                      <img
                        src={qrCode.startsWith('data:image') ? qrCode : `data:image/png;base64,${qrCode}`}
                        alt="WhatsApp QR Code"
                        className="w-64 h-64"
                      />
                    </div>
                    <p className="text-sm text-muted-foreground mt-4 text-center max-w-xs">
                      Abra o WhatsApp no seu celular, vá em Aparelhos Conectados {'>'} Conectar Aparelho
                    </p>
                    <Button variant="ghost" className="mt-2" onClick={() => setQrCode(null)}>
                      Cancelar
                    </Button>
                  </div>
                )}

                {evolutionStatus === 'connected' && (
                  <div className="pt-2">
                    <Button variant="outline" size="sm" onClick={checkStatus}>
                      Verificar Conexão
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Business Hours Section */}
            {activeSection === 'hours' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold">Horários de Funcionamento</h2>
                  {editingField !== 'hours' ? (
                    <Button variant="outline" size="sm" onClick={() => setEditingField('hours')}>
                      Editar
                    </Button>
                  ) : (
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setEditingField(null)}>
                        <X className="h-4 w-4 mr-1" />
                        Cancelar
                      </Button>
                      <Button size="sm" onClick={handleSaveBusinessHours} disabled={saving === 'hours'}>
                        {saving === 'hours' ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-1" />
                        ) : (
                          <Save className="h-4 w-4 mr-1" />
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
                        "flex items-center justify-between py-3 border-b border-border/50 last:border-0",
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
                  <h2 className="text-lg font-semibold">Serviços / Procedimentos</h2>
                  {editingField !== 'services' ? (
                    <Button variant="outline" size="sm" onClick={() => setEditingField('services')}>
                      Editar
                    </Button>
                  ) : (
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setEditingField(null)}>
                        <X className="h-4 w-4 mr-1" />
                        Cancelar
                      </Button>
                      <Button size="sm" onClick={handleSaveServices} disabled={saving === 'services'}>
                        {saving === 'services' ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-1" />
                        ) : (
                          <Save className="h-4 w-4 mr-1" />
                        )}
                        Salvar
                      </Button>
                    </div>
                  )}
                </div>

                {/* Add new service (only in edit mode) */}
                {editingField === 'services' && (
                  <div className="flex gap-2 p-4 bg-muted/30 rounded-xl border border-border/50 mb-4">
                    <div className="relative flex-1">
                      <Stethoscope className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Nome do serviço"
                        value={newService.name}
                        onChange={(e) => setNewService({ ...newService, name: e.target.value })}
                        className="pl-10"
                      />
                    </div>
                    <div className="relative w-32">
                      <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="number"
                        placeholder="Min"
                        value={newService.duration}
                        onChange={(e) => setNewService({ ...newService, duration: parseInt(e.target.value) || 30 })}
                        className="pl-10"
                      />
                    </div>
                    <Button variant="outline" onClick={addService} className="gap-1">
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
                          "flex items-center justify-between py-3 border-b border-border/50 last:border-0",
                          editingField === 'services' && "bg-muted/30 px-3 rounded-lg my-1"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Stethoscope className="h-4 w-4 text-primary" />
                          </div>
                          <span className="font-medium">{service.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
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
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
