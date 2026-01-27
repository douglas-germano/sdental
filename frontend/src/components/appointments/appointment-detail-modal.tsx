'use client'

import { useState } from 'react'
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
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/toast'
import { appointmentsApi } from '@/lib/api'
import { Appointment } from '@/types'
import { formatDateTime, formatPhone, getStatusColor, getStatusLabel } from '@/lib/utils'
import {
  User,
  Calendar,
  Clock,
  FileText,
  Phone,
  Mail,
  CheckCircle,
  Edit2,
  Save,
  X,
  Stethoscope
} from 'lucide-react'

interface AppointmentDetailModalProps {
  appointment: Appointment | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdate: () => void
}

export function AppointmentDetailModal({
  appointment,
  open,
  onOpenChange,
  onUpdate,
}: AppointmentDetailModalProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [notes, setNotes] = useState('')
  const [isEditing, setIsEditing] = useState(false)

  if (!appointment) return null

  const handleSaveNotes = async () => {
    setLoading(true)
    try {
      await appointmentsApi.update(appointment.id, { notes })
      toast({
        title: 'Sucesso',
        description: 'Observacoes atualizadas!',
        variant: 'success',
      })
      setIsEditing(false)
      onUpdate()
    } catch (error) {
      console.error('Error updating notes:', error)
      toast({
        title: 'Erro',
        description: 'Nao foi possivel salvar as observacoes.',
        variant: 'error',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleStatusChange = async (newStatus: string) => {
    setLoading(true)
    try {
      await appointmentsApi.update(appointment.id, { status: newStatus })
      toast({
        title: 'Sucesso',
        description: 'Status atualizado com sucesso!',
        variant: 'success',
      })
      onUpdate()
      onOpenChange(false)
    } catch (error) {
      console.error('Error updating status:', error)
      toast({
        title: 'Erro',
        description: 'Nao foi possivel atualizar o status.',
        variant: 'error',
      })
    } finally {
      setLoading(false)
    }
  }

  const startEditing = () => {
    setNotes(appointment.notes || '')
    setIsEditing(true)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogClose onClick={() => onOpenChange(false)} />

        <DialogHeader>
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-gradient-primary flex items-center justify-center shadow-lg">
              <Calendar className="h-6 w-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3">
                <DialogTitle className="text-lg">Agendamento</DialogTitle>
                <Badge className={getStatusColor(appointment.status)} size="sm">
                  {getStatusLabel(appointment.status)}
                </Badge>
              </div>
              <DialogDescription>
                {formatDateTime(appointment.scheduled_datetime)}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5">
          {/* Patient Info */}
          <div className="bg-muted/30 p-4 rounded-xl border border-border/50">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-3">
              <User className="h-4 w-4" />
              Paciente
            </div>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-primary flex items-center justify-center text-white font-semibold">
                {appointment.patient?.name?.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium">{appointment.patient?.name}</p>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {formatPhone(appointment.patient?.phone || '')}
                  </span>
                  {appointment.patient?.email && (
                    <span className="flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      {appointment.patient.email}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Appointment Info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-muted/30 p-4 rounded-xl border border-border/50">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Stethoscope className="h-4 w-4" />
                <span className="text-xs">Servico</span>
              </div>
              <p className="font-medium">{appointment.service_name}</p>
            </div>
            <div className="bg-muted/30 p-4 rounded-xl border border-border/50">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Clock className="h-4 w-4" />
                <span className="text-xs">Duracao</span>
              </div>
              <p className="font-medium">{appointment.duration_minutes} minutos</p>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2 text-muted-foreground">
                <FileText className="h-4 w-4" />
                Observacoes
              </Label>
              {!isEditing && (
                <Button variant="ghost" size="sm" onClick={startEditing} className="gap-1 h-7 text-xs">
                  <Edit2 className="h-3 w-3" />
                  Editar
                </Button>
              )}
            </div>
            {isEditing ? (
              <div className="space-y-3">
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Adicionar observacoes sobre o atendimento..."
                  rows={3}
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleSaveNotes}
                    loading={loading}
                    className="gap-1"
                  >
                    <Save className="h-3 w-3" />
                    Salvar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setIsEditing(false)}
                    disabled={loading}
                    className="gap-1"
                  >
                    <X className="h-3 w-3" />
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <div className="bg-muted/30 p-4 rounded-xl border border-border/50 min-h-[60px]">
                <p className="text-sm text-muted-foreground">
                  {appointment.notes || 'Nenhuma observacao adicionada'}
                </p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {appointment.status === 'pending' && (
            <Button
              onClick={() => handleStatusChange('confirmed')}
              loading={loading}
              variant="gradient"
              className="w-full sm:w-auto gap-2"
            >
              <CheckCircle className="h-4 w-4" />
              Confirmar Agendamento
            </Button>
          )}
          {(appointment.status === 'pending' || appointment.status === 'confirmed') && (
            <Button
              onClick={() => handleStatusChange('completed')}
              loading={loading}
              variant="success"
              className="w-full sm:w-auto gap-2"
            >
              <CheckCircle className="h-4 w-4" />
              Marcar como Concluido
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="w-full sm:w-auto"
          >
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
