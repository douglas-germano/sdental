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
import { User, Calendar, Clock, FileText, Phone, Mail, CheckCircle, Edit2 } from 'lucide-react'

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
      <DialogContent className="sm:max-w-[500px]">
        <DialogClose onClick={() => onOpenChange(false)} />
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-primary flex items-center justify-center">
              <Calendar className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1">
              <DialogTitle>Detalhes do Agendamento</DialogTitle>
            </div>
            <Badge className={getStatusColor(appointment.status)} size="lg">
              {getStatusLabel(appointment.status)}
            </Badge>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Patient Info */}
          <div className="bg-muted/30 p-4 rounded-xl space-y-2 border border-border/50">
            <div className="flex items-center gap-2 text-sm font-medium">
              <User className="h-4 w-4 text-primary" />
              Paciente
            </div>
            <div className="pl-6 space-y-1">
              <p className="font-medium">{appointment.patient?.name}</p>
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Phone className="h-3 w-3" />
                {formatPhone(appointment.patient?.phone || '')}
              </p>
              {appointment.patient?.email && (
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <Mail className="h-3 w-3" />
                  {appointment.patient.email}
                </p>
              )}
            </div>
          </div>

          {/* Appointment Info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1 bg-muted/30 p-3 rounded-xl border border-border/50">
              <Label className="flex items-center gap-2 text-muted-foreground">
                <FileText className="h-4 w-4" />
                Servico
              </Label>
              <p className="font-medium">{appointment.service_name}</p>
            </div>
            <div className="space-y-1 bg-muted/30 p-3 rounded-xl border border-border/50">
              <Label className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-4 w-4" />
                Duracao
              </Label>
              <p className="font-medium">{appointment.duration_minutes} minutos</p>
            </div>
          </div>

          <div className="space-y-1 bg-muted/30 p-3 rounded-xl border border-border/50">
            <Label className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-4 w-4" />
              Data e Hora
            </Label>
            <p className="font-medium">{formatDateTime(appointment.scheduled_datetime)}</p>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Observacoes
              </Label>
              {!isEditing && (
                <Button variant="ghost" size="sm" onClick={startEditing} className="gap-1">
                  <Edit2 className="h-3 w-3" />
                  Editar
                </Button>
              )}
            </div>
            {isEditing ? (
              <div className="space-y-2">
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Adicionar observacoes..."
                  rows={3}
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleSaveNotes}
                    loading={loading}
                  >
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
              <p className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-xl border border-border/50">
                {appointment.notes || 'Nenhuma observacao'}
              </p>
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
              Confirmar
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
