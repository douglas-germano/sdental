'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { appointmentsApi, professionalsApi } from '@/lib/api'
import { Appointment, Professional } from '@/types'
import { formatDateTime, formatPhone, getStatusColor, getStatusLabel } from '@/lib/utils'
import { Calendar, Filter, X, Check, MoreVertical, Plus, FileText, Ban, Eye, ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react'
import { NewAppointmentModal } from '@/components/appointments/new-appointment-modal'
import { AppointmentDetailModal } from '@/components/appointments/appointment-detail-modal'
import { useToast } from '@/components/ui/toast'
import { useConfirm } from '@/hooks/useConfirm'
import { EmptyState } from '@/components/ui/empty-state'
import { useDebounce } from '@/hooks/useDebounce'
import { cn } from '@/lib/utils'
import { exportToCSV } from '@/lib/export'
import { getErrorMessage } from '@/lib/error-messages'
import { Download } from 'lucide-react'

export default function AppointmentsPage() {
  const { toast } = useToast()
  const { confirm, ConfirmDialogComponent } = useConfirm()
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  // Separate input states for debouncing
  const [statusFilterInput, setStatusFilterInput] = useState<string>('')
  const [professionalFilterInput, setProfessionalFilterInput] = useState<string>('')
  const [dateFromInput, setDateFromInput] = useState<string>('')
  const [dateToInput, setDateToInput] = useState<string>('')

  // Debounced values
  const statusFilter = useDebounce(statusFilterInput, 500)
  const professionalFilter = useDebounce(professionalFilterInput, 500)
  const dateFrom = useDebounce(dateFromInput, 500)
  const dateTo = useDebounce(dateToInput, 500)

  const [showNewModal, setShowNewModal] = useState(false)
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null)
  const [professionals, setProfessionals] = useState<Professional[]>([])
  const [filtersExpanded, setFiltersExpanded] = useState(false)

  const fetchAppointments = async () => {
    setLoading(true)
    try {
      const response = await appointmentsApi.list({
        page,
        per_page: 20,
        status: statusFilter || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        professional_id: professionalFilter || undefined
      })
      setAppointments(response.data.appointments || [])
      setTotalPages(response.data.pages || 1)
    } catch (error) {
      console.error('Error fetching appointments:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchProfessionals = async () => {
    try {
      const response = await professionalsApi.list()
      setProfessionals(response.data.professionals || [])
    } catch (error) {
      console.error('Error fetching professionals:', error)
    }
  }

  useEffect(() => {
    fetchProfessionals()
  }, [])

  useEffect(() => {
    fetchAppointments()
  }, [page, statusFilter, professionalFilter, dateFrom, dateTo])

  const handleStatusChange = async (appointmentId: string, newStatus: string) => {
    try {
      await appointmentsApi.update(appointmentId, { status: newStatus })
      toast({
        title: 'Sucesso',
        description: 'Status atualizado com sucesso!',
        variant: 'success',
      })
      fetchAppointments()
    } catch (error) {
      console.error('Error updating appointment:', error)
      toast({
        title: 'Erro',
        description: getErrorMessage(error),
        variant: 'error',
      })
    }
  }

  const handleCancel = async (appointmentId: string) => {
    const confirmed = await confirm({
      title: 'Cancelar Agendamento',
      description: 'Tem certeza que deseja cancelar este agendamento? Esta ação não pode ser desfeita.',
      confirmText: 'Sim, cancelar',
      cancelText: 'Não, manter',
      variant: 'destructive'
    })

    if (!confirmed) return

    try {
      await appointmentsApi.delete(appointmentId)
      toast({
        title: 'Sucesso',
        description: 'Agendamento cancelado!',
        variant: 'success',
      })
      fetchAppointments()
    } catch (error) {
      console.error('Error cancelling appointment:', error)
      toast({
        title: 'Erro',
        description: getErrorMessage(error),
        variant: 'error',
      })
    }
  }

  const clearFilters = () => {
    setStatusFilterInput('')
    setProfessionalFilterInput('')
    setDateFromInput('')
    setDateToInput('')
    setPage(1)
  }

  const handleExport = () => {
    if (appointments.length === 0) {
      toast({
        title: 'Aviso',
        description: 'Não há agendamentos para exportar',
        variant: 'warning',
      })
      return
    }

    const exportData = appointments.map(apt => ({
      'Paciente': apt.patient?.name || '-',
      'Telefone': apt.patient?.phone ? formatPhone(apt.patient.phone) : '-',
      'Serviço': apt.service_name || '-',
      'Profissional': apt.professional?.name || '-',
      'Data/Hora': formatDateTime(apt.scheduled_datetime),
      'Status': getStatusLabel(apt.status),
    }))

    exportToCSV(exportData, 'agendamentos')

    toast({
      title: 'Sucesso',
      description: 'Agendamentos exportados com sucesso!',
      variant: 'success',
    })
  }

  const statuses = [
    { value: '', label: 'Todos' },
    { value: 'pending', label: 'Pendente' },
    { value: 'confirmed', label: 'Confirmado' },
    { value: 'completed', label: 'Concluído' },
    { value: 'cancelled', label: 'Cancelado' },
    { value: 'no_show', label: 'Falta' }
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Agendamentos</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie os agendamentos da clínica
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleExport}
            className="gap-2"
            disabled={loading || appointments.length === 0}
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Exportar</span>
          </Button>
          <Button variant="gradient" onClick={() => setShowNewModal(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Novo Agendamento
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="border-border/50">
        <CardHeader
          className="pb-3 cursor-pointer md:cursor-default"
          onClick={() => setFiltersExpanded(!filtersExpanded)}
        >
          <CardTitle className="text-lg flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-primary flex items-center justify-center">
                <Filter className="h-4 w-4 text-white" />
              </div>
              Filtros
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              className="md:hidden"
              onClick={(e) => {
                e.stopPropagation()
                setFiltersExpanded(!filtersExpanded)
              }}
            >
              {filtersExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className={cn(
          'transition-all duration-300',
          !filtersExpanded && 'hidden md:block'
        )}>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={statusFilterInput}
                onChange={(e) => {
                  setStatusFilterInput(e.target.value)
                  setPage(1)
                }}
              >
                {statuses.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </Select>
            </div>
            {professionals.length > 0 && (
              <div className="space-y-2">
                <Label>Profissional</Label>
                <Select
                  value={professionalFilterInput}
                  onChange={(e) => {
                    setProfessionalFilterInput(e.target.value)
                    setPage(1)
                  }}
                >
                  <option value="">Todos</option>
                  {professionals.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Data Inicial</Label>
              <Input
                type="date"
                value={dateFromInput}
                onChange={(e) => {
                  setDateFromInput(e.target.value)
                  setPage(1)
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>Data Final</Label>
              <Input
                type="date"
                value={dateToInput}
                onChange={(e) => {
                  setDateToInput(e.target.value)
                  setPage(1)
                }}
              />
            </div>
            <div className="flex items-end">
              <Button variant="outline" onClick={clearFilters} className="w-full gap-2">
                <X className="h-4 w-4" />
                Limpar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Appointments Table */}
      <Card className="border-border/50">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : appointments.length === 0 ? (
            <EmptyState
              icon={Calendar}
              title="Nenhum agendamento encontrado"
              description="Crie um novo agendamento ou ajuste os filtros"
              action={{
                label: "Novo Agendamento",
                onClick: () => setShowNewModal(true),
                icon: Plus
              }}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Paciente</TableHead>
                  <TableHead>Serviço</TableHead>
                  {professionals.length > 0 && <TableHead>Profissional</TableHead>}
                  <TableHead>Data/Hora</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {appointments.map((apt) => (
                  <TableRow key={apt.id} className="group">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-gradient-primary flex items-center justify-center text-white text-sm font-medium">
                          {apt.patient?.name?.charAt(0).toUpperCase() || '?'}
                        </div>
                        <div>
                          <p className="font-medium">{apt.patient?.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatPhone(apt.patient?.phone || '')}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-normal">
                        {apt.service_name}
                      </Badge>
                    </TableCell>
                    {professionals.length > 0 && (
                      <TableCell>
                        {apt.professional ? (
                          <div className="flex items-center gap-2">
                            <div
                              className="h-6 w-6 rounded-full flex items-center justify-center text-white text-xs font-medium"
                              style={{ backgroundColor: apt.professional.color || '#3B82F6' }}
                            >
                              {apt.professional.name.charAt(0).toUpperCase()}
                            </div>
                            <span className="text-sm">{apt.professional.name}</span>
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    )}
                    <TableCell>
                      <span className="text-sm">{formatDateTime(apt.scheduled_datetime)}</span>
                    </TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(apt.status)}>
                        {getStatusLabel(apt.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                            <span className="sr-only">Menu</span>
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Ações</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => setSelectedAppointment(apt)}>
                            <Eye className="mr-2 h-4 w-4" />
                            Ver Detalhes
                          </DropdownMenuItem>
                          {apt.status === 'pending' && (
                            <DropdownMenuItem onClick={() => handleStatusChange(apt.id, 'confirmed')}>
                              <Check className="mr-2 h-4 w-4" />
                              Confirmar
                            </DropdownMenuItem>
                          )}
                          {(apt.status === 'pending' || apt.status === 'confirmed') && (
                            <DropdownMenuItem onClick={() => handleStatusChange(apt.id, 'completed')}>
                              <FileText className="mr-2 h-4 w-4" />
                              Concluir
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => handleCancel(apt.id)}
                            className="text-red-600 focus:text-red-600"
                          >
                            <Ban className="mr-2 h-4 w-4" />
                            Cancelar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button
            variant="outline"
            size="icon"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
            className="h-9 w-9"
            aria-label="Página anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          {/* Desktop: Full pagination */}
          <div className="hidden md:flex items-center gap-1">
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              const pageNum = i + 1
              return (
                <Button
                  key={pageNum}
                  variant={page === pageNum ? 'default' : 'ghost'}
                  size="icon"
                  onClick={() => setPage(pageNum)}
                  className="h-9 w-9"
                  aria-label={`Página ${pageNum}`}
                  aria-current={page === pageNum ? 'page' : undefined}
                >
                  {pageNum}
                </Button>
              )
            })}
          </div>

          {/* Mobile: Simple page indicator */}
          <div className="flex md:hidden items-center">
            <span className="text-sm text-muted-foreground">
              Página {page} de {totalPages}
            </span>
          </div>

          <Button
            variant="outline"
            size="icon"
            disabled={page === totalPages}
            onClick={() => setPage(page + 1)}
            className="h-9 w-9"
            aria-label="Próxima página"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Modals */}
      <NewAppointmentModal
        open={showNewModal}
        onOpenChange={setShowNewModal}
        onSuccess={fetchAppointments}
      />

      <AppointmentDetailModal
        appointment={selectedAppointment}
        open={!!selectedAppointment}
        onOpenChange={(open: boolean) => !open && setSelectedAppointment(null)}
        onUpdate={fetchAppointments}
      />

      {/* Confirm Dialog */}
      {ConfirmDialogComponent}
    </div>
  )
}
