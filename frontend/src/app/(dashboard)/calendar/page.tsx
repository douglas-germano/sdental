'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { appointmentsApi } from '@/lib/api'
import { Appointment } from '@/types'
import { formatTime, getStatusColor, cn } from '@/lib/utils'
import { PageHeader } from '@/components/ui/page-header'
import { PageLoader } from '@/components/ui/page-loader'
import { NewAppointmentModal } from '@/components/appointments/new-appointment-modal'
import { AppointmentDetailModal } from '@/components/appointments/appointment-detail-modal'
import { DayAppointmentsModal } from '@/components/calendar/day-appointments-modal'
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addMonths,
  subMonths,
  isSameMonth,
  isToday as isDateToday,
  format,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { CaretLeft as ChevronLeft, CaretRight as ChevronRight, Plus } from '@phosphor-icons/react'

const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab']
const MAX_VISIBLE_PER_DAY = 3

function dayKey(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

export default function CalendarPage() {
  const [currentMonth, setCurrentMonth] = useState(() => new Date())
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewModal, setShowNewModal] = useState(false)
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null)
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)

  const gridStart = useMemo(
    () => startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 0 }),
    [currentMonth]
  )
  const gridEnd = useMemo(
    () => endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 0 }),
    [currentMonth]
  )
  const days = useMemo(
    () => eachDayOfInterval({ start: gridStart, end: gridEnd }),
    [gridStart, gridEnd]
  )

  const fetchAppointments = useCallback(async () => {
    setLoading(true)
    try {
      const response = await appointmentsApi.list({
        date_from: format(gridStart, "yyyy-MM-dd'T'00:00:00"),
        date_to: format(gridEnd, "yyyy-MM-dd'T'23:59:59"),
        per_page: 100,
      })
      setAppointments(response.data.appointments || [])
    } catch (error) {
      console.error('Error fetching appointments for calendar:', error)
    } finally {
      setLoading(false)
    }
  }, [gridStart, gridEnd])

  useEffect(() => {
    fetchAppointments()
  }, [fetchAppointments])

  const appointmentsByDay = useMemo(() => {
    const map = new Map<string, Appointment[]>()
    for (const apt of appointments) {
      const key = dayKey(new Date(apt.scheduled_datetime))
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(apt)
    }
    for (const list of map.values()) {
      list.sort(
        (a, b) => new Date(a.scheduled_datetime).getTime() - new Date(b.scheduled_datetime).getTime()
      )
    }
    return map
  }, [appointments])

  const selectedDayAppointments = selectedDay ? appointmentsByDay.get(dayKey(selectedDay)) || [] : []

  return (
    <div className="space-y-4">
      <PageHeader title="Calendario" description="Visualize os agendamentos por mes">
        <Button variant="outline" size="sm" onClick={() => setCurrentMonth(new Date())}>
          Hoje
        </Button>
        <div className="flex items-center border border-border rounded-lg overflow-hidden">
          <Button
            variant="ghost"
            size="icon"
            className="rounded-none"
            onClick={() => setCurrentMonth((m) => subMonths(m, 1))}
            aria-label="Mes anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-none border-l border-border"
            onClick={() => setCurrentMonth((m) => addMonths(m, 1))}
            aria-label="Proximo mes"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Button size="sm" onClick={() => setShowNewModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Agendamento
        </Button>
      </PageHeader>

      <Badge variant="secondary" size="sm" className="text-xs font-medium capitalize">
        {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
      </Badge>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-10">
              <PageLoader size="default" message="Carregando agendamentos..." />
            </div>
          ) : (
            <div className="border-t border-l border-border/60">
              <div className="grid grid-cols-7">
                {WEEKDAY_LABELS.map((label) => (
                  <div
                    key={label}
                    className="p-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground border-r border-b border-border/60 bg-muted/30"
                  >
                    {label}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {days.map((day) => {
                  const key = dayKey(day)
                  const dayAppointments = appointmentsByDay.get(key) || []
                  const inMonth = isSameMonth(day, currentMonth)
                  const today = isDateToday(day)
                  const visible = dayAppointments.slice(0, MAX_VISIBLE_PER_DAY)
                  const overflow = dayAppointments.length - visible.length

                  return (
                    <div
                      key={key}
                      className={cn(
                        'min-h-[100px] border-r border-b border-border/60 p-1.5 flex flex-col gap-1',
                        !inMonth && 'bg-muted/20'
                      )}
                    >
                      <span
                        className={cn(
                          'text-xs font-medium h-5 w-5 flex items-center justify-center rounded-full shrink-0',
                          !inMonth && 'text-muted-foreground/40',
                          inMonth && !today && 'text-foreground',
                          today && 'bg-primary text-primary-foreground font-semibold'
                        )}
                      >
                        {format(day, 'd')}
                      </span>
                      <div className="space-y-1 min-w-0">
                        {visible.map((apt) => (
                          <button
                            key={apt.id}
                            onClick={() => setSelectedAppointment(apt)}
                            className={cn(
                              'w-full text-left text-[11px] leading-tight px-1.5 py-1 rounded-md truncate border transition-opacity hover:opacity-80',
                              getStatusColor(apt.status)
                            )}
                            title={`${formatTime(apt.scheduled_datetime)} - ${apt.patient?.name || 'Paciente'}`}
                          >
                            {formatTime(apt.scheduled_datetime)} {apt.patient?.name || 'Paciente'}
                          </button>
                        ))}
                        {overflow > 0 && (
                          <button
                            onClick={() => setSelectedDay(day)}
                            className="w-full text-left text-[11px] font-medium text-primary hover:underline px-1.5"
                          >
                            +{overflow} mais
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <NewAppointmentModal
        open={showNewModal}
        onOpenChange={setShowNewModal}
        onSuccess={() => {
          setShowNewModal(false)
          fetchAppointments()
        }}
      />

      <AppointmentDetailModal
        appointment={selectedAppointment}
        open={!!selectedAppointment}
        onOpenChange={(open) => !open && setSelectedAppointment(null)}
        onUpdate={fetchAppointments}
      />

      <DayAppointmentsModal
        date={selectedDay}
        appointments={selectedDayAppointments}
        open={!!selectedDay}
        onOpenChange={(open) => !open && setSelectedDay(null)}
        onSelectAppointment={(apt) => {
          setSelectedDay(null)
          setSelectedAppointment(apt)
        }}
      />
    </div>
  )
}
