'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { patientsApi } from '@/lib/api'
import { Patient } from '@/types'
import { formatPhone, formatDate } from '@/lib/utils'
import { Users, Search, Eye, Trash2, Plus, ChevronLeft, ChevronRight, Download } from 'lucide-react'
import { NewPatientModal } from '@/components/patients/new-patient-modal'
import { PatientDetailModal } from '@/components/patients/patient-detail-modal'
import { useToast } from '@/components/ui/toast'
import { useConfirm } from '@/hooks/useConfirm'
import { EmptyState } from '@/components/ui/empty-state'
import { useDebounce } from '@/hooks/useDebounce'
import { exportToCSV } from '@/lib/export'
import { getErrorMessage } from '@/lib/error-messages'

export default function PatientsPage() {
  const { toast } = useToast()
  const { confirm, ConfirmDialogComponent } = useConfirm()
  const [patients, setPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const search = useDebounce(searchInput, 500)
  const [showNewModal, setShowNewModal] = useState(false)
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)

  const fetchPatients = async () => {
    setLoading(true)
    try {
      const response = await patientsApi.list({
        page,
        per_page: 20,
        search: search || undefined
      })
      setPatients(response.data.patients || [])
      setTotalPages(response.data.pages || 1)
    } catch (error) {
      console.error('Error fetching patients:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPatients()
  }, [page, search])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    // Search is debounced automatically via useDebounce hook
    setPage(1)
  }

  const handleDelete = async (patientId: string) => {
    const confirmed = await confirm({
      title: 'Excluir Paciente',
      description: 'Tem certeza que deseja excluir este paciente? Esta ação não pode ser desfeita.',
      confirmText: 'Sim, excluir',
      cancelText: 'Cancelar',
      variant: 'destructive'
    })

    if (!confirmed) return

    try {
      await patientsApi.delete(patientId)
      toast({
        title: 'Sucesso',
        description: 'Paciente excluído com sucesso!',
        variant: 'success',
      })
      fetchPatients()
    } catch (error) {
      console.error('Error deleting patient:', error)
      toast({
        title: 'Erro',
        description: getErrorMessage(error),
        variant: 'error',
      })
    }
  }

  const handleExport = () => {
    if (patients.length === 0) {
      toast({
        title: 'Aviso',
        description: 'Não há pacientes para exportar',
        variant: 'warning',
      })
      return
    }

    const exportData = patients.map(patient => ({
      'Nome': patient.name,
      'Telefone': patient.phone ? formatPhone(patient.phone) : '-',
      'Email': patient.email || '-',
      'Cadastro': formatDate(patient.created_at),
    }))

    exportToCSV(exportData, 'pacientes')

    toast({
      title: 'Sucesso',
      description: 'Pacientes exportados com sucesso!',
      variant: 'success',
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 animate-fade-in">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pacientes</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie os pacientes da clínica
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={loading || patients.length === 0}
          >
            <Download className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">Exportar</span>
          </Button>
          <Button onClick={() => setShowNewModal(true)} variant="gradient">
            <Plus className="h-4 w-4 mr-2" />
            Novo Paciente
          </Button>
        </div>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-3 max-w-lg animate-fade-in-up">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, telefone ou email..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-11"
          />
        </div>
        <Button type="submit" variant="secondary">
          Buscar
        </Button>
      </form>

      {/* Patients Table */}
      <Card className="animate-fade-in-up" style={{ animationDelay: '100ms' }}>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <div className="w-10 h-10 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
              <p className="text-muted-foreground text-sm">Carregando pacientes...</p>
            </div>
          ) : patients.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Nenhum paciente encontrado"
              description="Adicione um novo paciente para começar"
              action={{
                label: "Novo Paciente",
                onClick: () => setShowNewModal(true),
                icon: Plus
              }}
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="font-semibold">Nome</TableHead>
                    <TableHead className="font-semibold">Telefone</TableHead>
                    <TableHead className="font-semibold">Email</TableHead>
                    <TableHead className="font-semibold">Cadastro</TableHead>
                    <TableHead className="text-right font-semibold">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {patients.map((patient, index) => (
                    <TableRow
                      key={patient.id}
                      className="animate-fade-in hover:bg-muted/30 transition-colors"
                      style={{ animationDelay: `${index * 30}ms` }}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-gradient-primary flex items-center justify-center text-white font-medium text-sm">
                            {patient.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-medium">{patient.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{formatPhone(patient.phone)}</TableCell>
                      <TableCell className="text-muted-foreground">{patient.email || '-'}</TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(patient.created_at)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            onClick={() => setSelectedPatient(patient)}
                            className="hover:bg-primary/10 hover:text-primary"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            onClick={() => handleDelete(patient.id)}
                            className="hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 animate-fade-in-up" style={{ animationDelay: '150ms' }}>
          <Button
            variant="outline"
            size="sm"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
            className="gap-1"
            aria-label="Página anterior"
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Anterior</span>
          </Button>

          {/* Desktop: Full pagination */}
          <div className="hidden md:flex items-center gap-1 px-4">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum: number
              if (totalPages <= 5) {
                pageNum = i + 1
              } else if (page <= 3) {
                pageNum = i + 1
              } else if (page >= totalPages - 2) {
                pageNum = totalPages - 4 + i
              } else {
                pageNum = page - 2 + i
              }
              return (
                <Button
                  key={pageNum}
                  variant={page === pageNum ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setPage(pageNum)}
                  className={page === pageNum ? 'pointer-events-none' : ''}
                  aria-label={`Página ${pageNum}`}
                  aria-current={page === pageNum ? 'page' : undefined}
                >
                  {pageNum}
                </Button>
              )
            })}
          </div>

          {/* Mobile: Simple page indicator */}
          <div className="flex md:hidden items-center px-4">
            <span className="text-sm text-muted-foreground">
              Página {page} de {totalPages}
            </span>
          </div>

          <Button
            variant="outline"
            size="sm"
            disabled={page === totalPages}
            onClick={() => setPage(page + 1)}
            className="gap-1"
            aria-label="Próxima página"
          >
            <span className="hidden sm:inline">Próxima</span>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Modals */}
      <NewPatientModal
        open={showNewModal}
        onOpenChange={setShowNewModal}
        onSuccess={fetchPatients}
      />

      <PatientDetailModal
        patient={selectedPatient}
        open={!!selectedPatient}
        onOpenChange={(open: boolean) => !open && setSelectedPatient(null)}
        onUpdate={fetchPatients}
      />

      {/* Confirm Dialog */}
      {ConfirmDialogComponent}
    </div>
  )
}
