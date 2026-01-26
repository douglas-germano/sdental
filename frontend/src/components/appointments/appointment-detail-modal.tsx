'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { Loader2, User, Calendar, Clock, FileText, Phone, Mail } from 'lucide-react'

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
        description: 'Observações atualizadas!',
        variant: 'success',
      })
      setIsEditing(false)
      onUpdate()
    } catch (error) {
      console.error('Error updating notes:', error)
      toast({
        title: 'Erro',
        description: 'Não foi possível salvar as observações.',
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
        description: 'Não foi possível atualizar o status.',
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
      <DialogContent className="sm:max-w-[500px]">
        <DialogClose onClick={() => onOpenChange(false)} />
        <DialogHeader>
          <DialogTitle>Detalhes do Agendamento</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Status */}
          <div className="flex items-center justify-between">
            <Label>Status</Label>
            <Badge className={getStatusColor(appointment.status)}>
              {getStatusLabel(appointment.status)}
            </Badge>
          </div>

          {/* Patient Info */}
          <div className="bg-gray-50 p-4 rounded-lg space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <User className="h-4 w-4" />
              Paciente
            </div>
            <div className="pl-6 space-y-1">
              <p className="font-medium">{appointment.patient?.name}</p>
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <Phone className="h-3 w-3" />
                {formatPhone(appointment.patient?.phone || '')}
              </p>
              {appointment.patient?.email && (
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  {appointment.patient.email}
                </p>
              )}
            </div>
          </div>

          {/* Appointment Info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="flex items-center gap-1">
                <FileText className="h-4 w-4" />
                Serviço
              </Label>
              <p className="text-sm">{appointment.service_name}</p>
            </div>
            <div className="space-y-1">
              <Label className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                Duração
              </Label>
              <p className="text-sm">{appointment.duration_minutes} minutos</p>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              Data e Hora
            </Label>
            <p className="text-sm">{formatDateTime(appointment.scheduled_datetime)}</p>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Observações</Label>
              {!isEditing && (
                <Button variant="ghost" size="sm" onClick={startEditing}>
                  Editar
                </Button>
              )}
            </div>
            {isEditing ? (
              <div className="space-y-2">
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Adicionar observações..."
                  rows={3}
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleSaveNotes}
                    disabled={loading}
                  >
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Salvar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setIsEditing(false)}
                    disabled={loading}
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {appointment.notes || 'Nenhuma observação'}
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {appointment.status === 'pending' && (
            <Button
              onClick={() => handleStatusChange('confirmed')}
              disabled={loading}
              className="w-full sm:w-auto"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar
            </Button>
          )}
          {(appointment.status === 'pending' || appointment.status === 'confirmed') && (
            <Button
              onClick={() => handleStatusChange('completed')}
              disabled={loading}
              variant="outline"
              className="w-full sm:w-auto"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Marcar como Concluído
            </Button>
          )}
          <Button
            variant="ghost"
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
