'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/app/providers'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { appointmentsApi, patientsApi } from '@/lib/api'
import { Patient, AvailabilitySlot } from '@/types'
import {
  Loader2,
  CalendarPlus,
  User,
  Stethoscope,
  Calendar,
  Clock,
  FileText,
  AlertCircle
} from 'lucide-react'

interface NewAppointmentModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function NewAppointmentModal({
  open,
  onOpenChange,
  onSuccess,
}: NewAppointmentModalProps) {
  const { clinic } = useAuth()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [loadingPatients, setLoadingPatients] = useState(false)
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [patients, setPatients] = useState<Patient[]>([])
  const [slots, setSlots] = useState<AvailabilitySlot[]>([])

  const [formData, setFormData] = useState({
    patient_id: '',
    service_name: '',
    date: '',
    time_slot: '',
    notes: '',
  })

  const services = clinic?.services || []

  useEffect(() => {
    if (open) {
      fetchPatients()
      setFormData({
        patient_id: '',
        service_name: '',
        date: '',
        time_slot: '',
        notes: '',
      })
      setSlots([])
    }
  }, [open])

  useEffect(() => {
    if (formData.date && formData.service_name) {
      fetchAvailability()
    }
  }, [formData.date, formData.service_name])

  const fetchPatients = async () => {
    setLoadingPatients(true)
    try {
      const response = await patientsApi.list({ per_page: 100 })
      setPatients(response.data.patients || [])
    } catch (error) {
      console.error('Error fetching patients:', error)
    } finally {
      setLoadingPatients(false)
    }
  }

  const fetchAvailability = async () => {
    setLoadingSlots(true)
    try {
      const response = await appointmentsApi.availability(
        formData.date,
        formData.service_name
      )
      setSlots(response.data.slots || [])
    } catch (error) {
      console.error('Error fetching availability:', error)
      setSlots([])
    } finally {
      setLoadingSlots(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.patient_id || !formData.service_name || !formData.time_slot) {
      toast({
        title: 'Erro',
        description: 'Por favor, preencha todos os campos obrigatorios.',
        variant: 'error',
      })
      return
    }

    setLoading(true)
    try {
      const selectedService = services.find(s => s.name === formData.service_name)
      await appointmentsApi.create({
        patient_id: formData.patient_id,
        service_name: formData.service_name,
        scheduled_datetime: formData.time_slot,
        duration_minutes: selectedService?.duration || 30,
        notes: formData.notes || undefined,
      })

      toast({
        title: 'Sucesso',
        description: 'Agendamento criado com sucesso!',
        variant: 'success',
      })

      onSuccess()
      onOpenChange(false)
    } catch (error) {
      console.error('Error creating appointment:', error)
      toast({
        title: 'Erro',
        description: 'Nao foi possivel criar o agendamento. Tente novamente.',
        variant: 'error',
      })
    } finally {
      setLoading(false)
    }
  }

  const today = new Date().toISOString().split('T')[0]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogClose onClick={() => onOpenChange(false)} />

        <DialogHeader>
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-gradient-primary flex items-center justify-center shadow-lg">
              <CalendarPlus className="h-6 w-6 text-white" />
            </div>
            <div>
              <DialogTitle className="text-lg">Novo Agendamento</DialogTitle>
              <DialogDescription>
                Agende uma consulta para um paciente
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Paciente */}
          <div className="space-y-2">
            <Label htmlFor="patient" className="flex items-center gap-2" required>
              <User className="h-4 w-4" />
              Paciente
            </Label>
            {loadingPatients ? (
              <div className="flex items-center gap-3 text-sm text-muted-foreground h-11 px-4 bg-muted/30 rounded-xl border border-input">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando pacientes...
              </div>
            ) : (
              <Select
                id="patient"
                value={formData.patient_id}
                onChange={(e) =>
                  setFormData({ ...formData, patient_id: e.target.value })
                }
              >
                <option value="">Selecione um paciente</option>
                {patients.map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.name} - {patient.phone}
                  </option>
                ))}
              </Select>
            )}
          </div>

          {/* Servico */}
          <div className="space-y-2">
            <Label htmlFor="service" className="flex items-center gap-2" required>
              <Stethoscope className="h-4 w-4" />
              Servico
            </Label>
            <Select
              id="service"
              value={formData.service_name}
              onChange={(e) =>
                setFormData({ ...formData, service_name: e.target.value, time_slot: '' })
              }
            >
              <option value="">Selecione um servico</option>
              {services.map((service) => (
                <option key={service.name} value={service.name}>
                  {service.name} ({service.duration} min)
                </option>
              ))}
            </Select>
          </div>

          {/* Data e Horario em grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date" className="flex items-center gap-2" required>
                <Calendar className="h-4 w-4" />
                Data
              </Label>
              <Input
                id="date"
                type="date"
                min={today}
                value={formData.date}
                onChange={(e) =>
                  setFormData({ ...formData, date: e.target.value, time_slot: '' })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="time" className="flex items-center gap-2" required>
                <Clock className="h-4 w-4" />
                Horario
              </Label>
              {loadingSlots ? (
                <div className="flex items-center gap-3 text-sm text-muted-foreground h-11 px-4 bg-muted/30 rounded-xl border border-input">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Verificando...
                </div>
              ) : !formData.date || !formData.service_name ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground h-11 px-4 bg-muted/30 rounded-xl border border-input">
                  <AlertCircle className="h-4 w-4" />
                  Selecione data e servico
                </div>
              ) : slots.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-amber-600 h-11 px-4 bg-amber-50 rounded-xl border border-amber-200">
                  <AlertCircle className="h-4 w-4" />
                  Sem horarios
                </div>
              ) : (
                <Select
                  id="time"
                  value={formData.time_slot}
                  onChange={(e) =>
                    setFormData({ ...formData, time_slot: e.target.value })
                  }
                >
                  <option value="">Selecione</option>
                  {slots.map((slot) => (
                    <option key={slot.datetime} value={slot.datetime}>
                      {slot.start_time} - {slot.end_time}
                    </option>
                  ))}
                </Select>
              )}
            </div>
          </div>

          {/* Observacoes */}
          <div className="space-y-2">
            <Label htmlFor="notes" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Observacoes
            </Label>
            <Textarea
              id="notes"
              placeholder="Observacoes adicionais sobre o agendamento..."
              value={formData.notes}
              onChange={(e) =>
                setFormData({ ...formData, notes: e.target.value })
              }
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button type="submit" variant="gradient" loading={loading}>
              <CalendarPlus className="h-4 w-4 mr-2" />
              Criar Agendamento
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
