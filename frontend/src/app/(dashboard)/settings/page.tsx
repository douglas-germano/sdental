'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/app/providers'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { clinicsApi } from '@/lib/api'
import { getDayName } from '@/lib/utils'
import { Save, Wifi, Clock, Stethoscope, Trash2, Plus } from 'lucide-react'

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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Configurações</h1>
          <p className="text-muted-foreground">
            Gerencie as configurações da sua clínica e integrações
          </p>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="bg-red-50 text-red-500 p-3 rounded-md">{error}</div>
      )}
      {success && (
        <div className="bg-green-50 text-green-500 p-3 rounded-md">{success}</div>
      )}

      {/* Evolution API Config */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wifi className="h-5 w-5" />
            Evolution API (WhatsApp)
          </CardTitle>
          <CardDescription>
            Configure a integracao com o WhatsApp via Evolution API
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col items-center justify-center space-y-4 py-4">
            {evolutionStatus === 'connected' ? (
              <div className="flex flex-col items-center text-green-600 gap-2">
                <div className="h-16 w-16 bg-green-100 rounded-full flex items-center justify-center">
                  <Wifi className="h-8 w-8" />
                </div>
                <h3 className="font-semibold text-lg">WhatsApp Conectado!</h3>
                <p className="text-sm text-gray-500 text-center">
                  Sua clínica está pronta para receber mensagens.
                </p>
                <div className="flex gap-2 mt-2">
                  <Button variant="outline" size="sm" onClick={checkStatus}>
                    Verificar Conexão
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4 w-full">
                {!qrCode ? (
                  <>
                    <div className="h-16 w-16 bg-gray-100 rounded-full flex items-center justify-center">
                      <Wifi className="h-8 w-8 text-gray-400" />
                    </div>
                    <div className="text-center">
                      <h3 className="font-semibold text-lg">WhatsApp Desconectado</h3>
                      <p className="text-sm text-gray-500 max-w-sm mx-auto">
                        Conecte seu WhatsApp para que a IA possa atender seus pacientes automaticamente.
                      </p>
                    </div>
                    <Button
                      onClick={handleConnect}
                      disabled={saving === 'evolution'}
                      size="lg"
                    >
                      {saving === 'evolution' ? 'Iniciando...' : 'Conectar WhatsApp'}
                    </Button>
                  </>
                ) : (
                  <div className="flex flex-col items-center animate-in fade-in zoom-in duration-300">
                    <h3 className="font-semibold mb-4">Escaneie o QR Code</h3>
                    <div className="bg-white p-4 rounded-xl border shadow-sm">
                      <img
                        src={qrCode.startsWith('data:image') ? qrCode : `data:image/png;base64,${qrCode}`}
                        alt="WhatsApp QR Code"
                        className="w-64 h-64"
                      />
                    </div>
                    <p className="text-sm text-gray-500 mt-4 text-center max-w-xs">
                      Abra o WhatsApp no seu celular, vá em Aparelhos Conectados {'>'} Conectar Aparelho
                    </p>
                    <Button variant="ghost" className="mt-2 text-sm" onClick={() => setQrCode(null)}>
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
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Horarios de Funcionamento
          </CardTitle>
          <CardDescription>
            Configure os dias e horarios em que a clinica atende
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            {[0, 1, 2, 3, 4, 5, 6].map((day) => (
              <div key={day} className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
                <label className="flex items-center gap-2 w-32">
                  <input
                    type="checkbox"
                    checked={businessHours[day]?.active || false}
                    onChange={(e) => updateBusinessHour(String(day), 'active', e.target.checked)}
                    className="rounded"
                  />
                  <span className="font-medium">{getDayName(day)}</span>
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    type="time"
                    value={businessHours[day]?.start || '08:00'}
                    onChange={(e) => updateBusinessHour(String(day), 'start', e.target.value)}
                    disabled={!businessHours[day]?.active}
                    className="w-32"
                  />
                  <span>ate</span>
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
          <Button onClick={handleSaveBusinessHours} disabled={saving === 'hours'}>
            <Save className="h-4 w-4 mr-2" />
            {saving === 'hours' ? 'Salvando...' : 'Salvar Horarios'}
          </Button>
        </CardContent>
      </Card>

      {/* Services */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Stethoscope className="h-5 w-5" />
            Servicos/Procedimentos
          </CardTitle>
          <CardDescription>
            Configure os servicos oferecidos pela clinica
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add new service */}
          <div className="flex gap-2">
            <Input
              placeholder="Nome do servico"
              value={newService.name}
              onChange={(e) => setNewService({ ...newService, name: e.target.value })}
              className="flex-1"
            />
            <Input
              type="number"
              placeholder="Duracao (min)"
              value={newService.duration}
              onChange={(e) => setNewService({ ...newService, duration: parseInt(e.target.value) || 30 })}
              className="w-32"
            />
            <Button variant="outline" onClick={addService}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {/* Services list */}
          <div className="space-y-2">
            {services.map((service, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <span className="font-medium">{service.name}</span>
                  <span className="text-muted-foreground ml-2">({service.duration} min)</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeService(index)}
                >
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </div>
            ))}
          </div>

          <Button onClick={handleSaveServices} disabled={saving === 'services'}>
            <Save className="h-4 w-4 mr-2" />
            {saving === 'services' ? 'Salvando...' : 'Salvar Servicos'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
