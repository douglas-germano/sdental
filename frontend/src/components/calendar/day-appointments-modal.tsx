'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Appointment } from '@/types'
import { formatTime, getStatusColor, getStatusLabel } from '@/lib/utils'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface DayAppointmentsModalProps {
  date: Date | null
  appointments: Appointment[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelectAppointment: (appointment: Appointment) => void
}

export function DayAppointmentsModal({
  date,
  appointments,
  open,
  onOpenChange,
  onSelectAppointment,
}: DayAppointmentsModalProps) {
  if (!date) return null

  const sorted = [...appointments].sort(
    (a, b) => new Date(a.scheduled_datetime).getTime() - new Date(b.scheduled_datetime).getTime()
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="capitalize">
            {format(date, "EEEE, d 'de' MMMM", { locale: ptBR })}
          </DialogTitle>
          <DialogDescription>
            {sorted.length} {sorted.length === 1 ? 'agendamento' : 'agendamentos'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
          {sorted.map((apt) => (
            <button
              key={apt.id}
              onClick={() => onSelectAppointment(apt)}
              className="w-full flex items-center justify-between gap-3 p-3 rounded-xl border border-border/60 hover:bg-muted/50 transition-colors text-left"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-white font-medium text-sm shrink-0">
                  {apt.patient?.name?.charAt(0).toUpperCase() || '?'}
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm text-foreground truncate">{apt.patient?.name || 'Paciente'}</p>
                  <p className="text-xs text-muted-foreground truncate">{apt.service_name}</p>
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-medium text-foreground mb-1">{formatTime(apt.scheduled_datetime)}</p>
                <Badge className={getStatusColor(apt.status)} variant="secondary" size="sm">
                  {getStatusLabel(apt.status)}
                </Badge>
              </div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
