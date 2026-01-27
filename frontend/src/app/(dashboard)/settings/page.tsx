'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/app/providers'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { clinicsApi } from '@/lib/api'
import { getDayName } from '@/lib/utils'
import { Save, Wifi, Clock, Stethoscope, Trash2, Plus, CheckCircle, XCircle } from 'lucide-react'

export default function SettingsPage() {
  const { clinic, refreshClinic } = useAuth()
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Evolution API State
  const [evolutionStatus, setEvolutionStatus] = useState<'connected' | 'disconnected' | 'checking'>('checking')
  const [qrCode, setQrCode] = useState<string | null>(null)

  // Business Hours State
  const [businessHours, setBusinessHours] = useState(
    clinic?.business_hours || {}
  )

  // Services State
  const [services, setServices] = useState(clinic?.services || [])
  const [newService, setNewService] = useState({ name: '', duration: 30 })

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

    // Poll status if QR code is shown
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
      // 1. Create/Ensure instance exists
      await clinicsApi.createEvolutionInstance()

      // 2. Get QR Code
      const { data } = await clinicsApi.getEvolutionQrCode()
      if (data.qrcode) {
        setQrCode(data.qrcode)
      } else {
        // Might already be connected
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
      showMessage('success', 'Horarios de funcionamento salvos!')
    } catch {
      showMessage('error', 'Erro ao salvar horarios')
    } finally {
      setSaving(null)
    }
  }

  const handleSaveServices = async () => {
    setSaving('services')
    try {
      await clinicsApi.updateServices(services)
      await refreshClinic()
      showMessage('success', 'Servicos salvos!')
    } catch {
      showMessage('error', 'Erro ao salvar servicos')
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

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground">
          Gerencie as configurações da sua clínica e integrações
        </p>
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive p-4 rounded-xl border border-destructive/20 flex items-center gap-3 animate-fade-in">
          <XCircle className="h-5 w-5" />
          {error}
        </div>
      )}
      {success && (
        <div className="bg-success/10 text-success p-4 rounded-xl border border-success/20 flex items-center gap-3 animate-fade-in">
          <CheckCircle className="h-5 w-5" />
          {success}
        </div>
      )}

      {/* Grid Layout for Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Evolution API Config */}
        <Card className="border-border/50">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                <Wifi className="h-5 w-5 text-white" />
              </div>
              <div>
                <CardTitle>Evolution API (WhatsApp)</CardTitle>
                <CardDescription>
                  Configure a integracao com o WhatsApp via Evolution API
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col items-center justify-center space-y-4 py-6">
              {evolutionStatus === 'connected' ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="h-20 w-20 bg-success/10 rounded-2xl flex items-center justify-center">
                    <Wifi className="h-10 w-10 text-success" />
                  </div>
                  <Badge variant="success" size="lg" className="gap-2">
                    <CheckCircle className="h-4 w-4" />
                    Conectado
                  </Badge>
                  <h3 className="font-semibold text-lg">WhatsApp Conectado!</h3>
                  <p className="text-sm text-muted-foreground text-center max-w-sm">
                    Sua clínica está pronta para receber mensagens.
                  </p>
                  <Button variant="outline" size="sm" onClick={checkStatus} className="mt-2">
                    Verificar Conexão
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4 w-full">
                  {!qrCode ? (
                    <>
                      <div className="h-20 w-20 bg-muted/50 rounded-2xl flex items-center justify-center">
                        <Wifi className="h-10 w-10 text-muted-foreground/50" />
                      </div>
                      <Badge variant="outline" size="lg" className="gap-2">
                        <XCircle className="h-4 w-4" />
                        Desconectado
                      </Badge>
                      <div className="text-center">
                        <h3 className="font-semibold text-lg">WhatsApp Desconectado</h3>
                        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                          Conecte seu WhatsApp para que a IA possa atender seus pacientes automaticamente.
                        </p>
                      </div>
                      <Button
                        variant="gradient"
                        onClick={handleConnect}
                        disabled={saving === 'evolution'}
                        size="lg"
                        className="gap-2"
                      >
                        <Wifi className="h-4 w-4" />
                        {saving === 'evolution' ? 'Iniciando...' : 'Conectar WhatsApp'}
                      </Button>
                    </>
                  ) : (
                    <div className="flex flex-col items-center animate-fade-in">
                      <h3 className="font-semibold text-lg mb-4">Escaneie o QR Code</h3>
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
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Business Hours */}
        <Card className="border-border/50">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-primary flex items-center justify-center">
                <Clock className="h-5 w-5 text-white" />
              </div>
              <div>
                <CardTitle>Horarios de Funcionamento</CardTitle>
                <CardDescription>
                  Configure os dias e horarios em que a clinica atende
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              {[0, 1, 2, 3, 4, 5, 6].map((day) => (
                <div key={day} className="flex items-center gap-4 p-4 bg-muted/30 rounded-xl border border-border/50 transition-colors hover:bg-muted/50">
                  <label className="flex items-center gap-3 w-36 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={businessHours[day]?.active || false}
                      onChange={(e) => updateBusinessHour(String(day), 'active', e.target.checked)}
                      className="rounded-md h-4 w-4 border-border text-primary focus:ring-primary"
                    />
                    <span className={`font-medium ${businessHours[day]?.active ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {getDayName(day)}
                    </span>
                  </label>
                  <div className="flex items-center gap-3">
                    <Input
                      type="time"
                      value={businessHours[day]?.start || '08:00'}
                      onChange={(e) => updateBusinessHour(String(day), 'start', e.target.value)}
                      disabled={!businessHours[day]?.active}
                      className="w-32"
                    />
                    <span className="text-muted-foreground">até</span>
                    <Input
                      type="time"
                      value={businessHours[day]?.end || '18:00'}
                      onChange={(e) => updateBusinessHour(String(day), 'end', e.target.value)}
                      disabled={!businessHours[day]?.active}
                      className="w-32"
                    />
                  </div>
                </div>
              ))}
            </div>
            <Button variant="gradient" onClick={handleSaveBusinessHours} disabled={saving === 'hours'} className="gap-2">
              <Save className="h-4 w-4" />
              {saving === 'hours' ? 'Salvando...' : 'Salvar Horarios'}
            </Button>
          </CardContent>
        </Card>

        {/* Services */}
        <Card className="border-border/50">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                <Stethoscope className="h-5 w-5 text-white" />
              </div>
              <div>
                <CardTitle>Servicos/Procedimentos</CardTitle>
                <CardDescription>
                  Configure os servicos oferecidos pela clinica
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Add new service */}
            <div className="flex gap-2 p-4 bg-muted/30 rounded-xl border border-border/50">
              <div className="relative flex-1">
                <Stethoscope className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Nome do servico"
                  value={newService.name}
                  onChange={(e) => setNewService({ ...newService, name: e.target.value })}
                  className="pl-11"
                />
              </div>
              <div className="relative w-36">
                <Clock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="number"
                  placeholder="Duracao"
                  value={newService.duration}
                  onChange={(e) => setNewService({ ...newService, duration: parseInt(e.target.value) || 30 })}
                  className="pl-11"
                />
              </div>
              <Button variant="outline" onClick={addService} className="gap-2">
                <Plus className="h-4 w-4" />
                Adicionar
              </Button>
            </div>

            {/* Services list */}
            <div className="space-y-2">
              {services.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <div className="h-12 w-12 rounded-xl bg-muted/50 flex items-center justify-center mb-3">
                    <Stethoscope className="h-6 w-6 opacity-50" />
                  </div>
                  <p className="font-medium">Nenhum serviço cadastrado</p>
                  <p className="text-sm">Adicione serviços para começar</p>
                </div>
              ) : (
                services.map((service, index) => (
                  <div key={index} className="flex items-center justify-between p-4 bg-muted/30 rounded-xl border border-border/50 transition-colors hover:bg-muted/50 group">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Stethoscope className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <span className="font-medium">{service.name}</span>
                        <Badge variant="outline" className="ml-3">{service.duration} min</Badge>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeService(index)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              )}
            </div>

            <Button variant="gradient" onClick={handleSaveServices} disabled={saving === 'services'} className="gap-2">
              <Save className="h-4 w-4" />
              {saving === 'services' ? 'Salvando...' : 'Salvar Servicos'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

