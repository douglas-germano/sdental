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
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'

const appointmentSchema = z.object({
  patient_id: z.string().min(1, 'Selecione um paciente'),
  service_name: z.string().min(1, 'Selecione um serviÃ§o'),
  date: z.string().min(1, 'Selecione uma data'),
  time_slot: z.string().min(1, 'Selecione um horÃ¡rio'),
  notes: z.string().optional(),
})

type AppointmentFormData = z.infer<typeof appointmentSchema>

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

  const services = clinic?.services || []

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<AppointmentFormData>({
    resolver: zodResolver(appointmentSchema),
    defaultValues: {
      patient_id: '',
      service_name: '',
      date: '',
      time_slot: '',
      notes: '',
    },
  })

  const formValues = watch()
  const selectedDate = watch('date')
  const selectedService = watch('service_name')

  useEffect(() => {
    if (open) {
      fetchPatients()
      reset({
        patient_id: '',
        service_name: '',
        date: '',
        time_slot: '',
        notes: '',
      })
      setSlots([])
    }
  }, [open, reset])

  useEffect(() => {
    if (selectedDate && selectedService) {
      fetchAvailability(selectedDate, selectedService)
      setValue('time_slot', '') // Reset time slot when date/service changes
    }
  }, [selectedDate, selectedService, setValue])

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

  const fetchAvailability = async (date: string, serviceName: string) => {
    setLoadingSlots(true)
    try {
      const response = await appointmentsApi.availability(date, serviceName)
      setSlots(response.data.slots || [])
    } catch (error) {
      console.error('Error fetching availability:', error)
      setSlots([])
    } finally {
      setLoadingSlots(false)
    }
  }

  const onSubmit = async (data: AppointmentFormData) => {
    setLoading(true)
    try {
      const service = services.find(s => s.name === data.service_name)
      await appointmentsApi.create({
        patient_id: data.patient_id,
        service_name: data.service_name,
        scheduled_datetime: data.time_slot,
        duration_minutes: service?.duration || 30,
        notes: data.notes || undefined,
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
        description: 'NÃ£o foi possÃvel criar o agendamento. Tente novamente.',
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

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
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
              <div className="relative">
                <Select
                  id="patient"
                  {...register('patient_id')}
                >
                  <option value="">Selecione um paciente</option>
                  {patients.map((patient) => (
                    <option key={patient.id} value={patient.id}>
                      {patient.name} - {patient.phone}
                    </option>
                  ))}
                </Select>
                {errors.patient_id && (
                  <p className="text-xs text-destructive mt-1 absolute -bottom-5 left-0">
                    {errors.patient_id.message}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Servico */}
          <div className="space-y-2">
            <Label htmlFor="service" className="flex items-center gap-2" required>
              <Stethoscope className="h-4 w-4" />
              ServiÃ§o
            </Label>
            <div className="relative">
              <Select
                id="service"
                {...register('service_name')}
              >
                <option value="">Selecione um serviÃ§o</option>
                {services.map((service) => (
                  <option key={service.name} value={service.name}>
                    {service.name} ({service.duration} min)
                  </option>
                ))}
              </Select>
              {errors.service_name && (
                <p className="text-xs text-destructive mt-1 absolute -bottom-5 left-0">
                  {errors.service_name.message}
                </p>
              )}
            </div>
          </div>

          {/* Data e Horario em grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date" className="flex items-center gap-2" required>
                <Calendar className="h-4 w-4" />
                Data
              </Label>
              <div className="relative">
                <Input
                  id="date"
                  type="date"
                  min={today}
                  {...register('date')}
                />
                {errors.date && (
                  <p className="text-xs text-destructive mt-1 absolute -bottom-5 left-0">
                    {errors.date.message}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="time" className="flex items-center gap-2" required>
                <Clock className="h-4 w-4" />
                HorÃ¡rio
              </Label>
              {loadingSlots ? (
                <div className="flex items-center gap-3 text-sm text-muted-foreground h-11 px-4 bg-muted/30 rounded-xl border border-input">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Verificando...
                </div>
              ) : !selectedDate || !selectedService ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground h-11 px-4 bg-muted/30 rounded-xl border border-input">
                  <AlertCircle className="h-4 w-4" />
                  Selecione data e serviÃ§o
                </div>
              ) : slots.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-amber-600 h-11 px-4 bg-amber-50 rounded-xl border border-amber-200">
                  <AlertCircle className="h-4 w-4" />
                  Sem horÃ¡rios
                </div>
              ) : (
                <div className="relative">
                  <Select
                    id="time"
                    {...register('time_slot')}
                  >
                    <option value="">Selecione</option>
                    {slots.map((slot) => (
                      <option key={slot.datetime} value={slot.datetime}>
                        {slot.start_time} - {slot.end_time}
                      </option>
                    ))}
                  </Select>
                  {errors.time_slot && (
                    <p className="text-xs text-destructive mt-1 absolute -bottom-5 left-0">
                      {errors.time_slot.message}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Observacoes */}
          <div className="space-y-2">
            <Label htmlFor="notes" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              ObservaÃ§Ãµes
            </Label>
            <Textarea
              id="notes"
              placeholder="ObservaÃ§Ãµes adicionais sobre o agendamento..."
              rows={3}
              {...register('notes')}
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

