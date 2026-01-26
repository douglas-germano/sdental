'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/app/providers'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { Loader2 } from 'lucide-react'

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
        description: 'Por favor, preencha todos os campos obrigatórios.',
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
        description: 'Não foi possível criar o agendamento. Tente novamente.',
        variant: 'error',
      })
    } finally {
      setLoading(false)
    }
  }

  const today = new Date().toISOString().split('T')[0]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogClose onClick={() => onOpenChange(false)} />
        <DialogHeader>
          <DialogTitle>Novo Agendamento</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="patient">Paciente *</Label>
            {loadingPatients ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
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
                required
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

          <div className="space-y-2">
            <Label htmlFor="service">Serviço *</Label>
            <Select
              id="service"
              value={formData.service_name}
              onChange={(e) =>
                setFormData({ ...formData, service_name: e.target.value, time_slot: '' })
              }
              required
            >
              <option value="">Selecione um serviço</option>
              {services.map((service) => (
                <option key={service.name} value={service.name}>
                  {service.name} ({service.duration} min)
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="date">Data *</Label>
            <Input
              id="date"
              type="date"
              min={today}
              value={formData.date}
              onChange={(e) =>
                setFormData({ ...formData, date: e.target.value, time_slot: '' })
              }
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="time">Horário *</Label>
            {loadingSlots ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Verificando disponibilidade...
              </div>
            ) : !formData.date || !formData.service_name ? (
              <p className="text-sm text-muted-foreground">
                Selecione uma data e serviço para ver os horários disponíveis
              </p>
            ) : slots.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum horário disponível para esta data
              </p>
            ) : (
              <Select
                id="time"
                value={formData.time_slot}
                onChange={(e) =>
                  setFormData({ ...formData, time_slot: e.target.value })
                }
                required
              >
                <option value="">Selecione um horário</option>
                {slots.map((slot) => (
                  <option key={slot.datetime} value={slot.datetime}>
                    {slot.start_time} - {slot.end_time}
                  </option>
                ))}
              </Select>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Observações</Label>
            <Textarea
              id="notes"
              placeholder="Observações adicionais..."
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
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Criar Agendamento
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
