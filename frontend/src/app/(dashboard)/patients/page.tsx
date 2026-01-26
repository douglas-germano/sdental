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
import { Users, Search, Eye, Trash2, Plus, ChevronLeft, ChevronRight } from 'lucide-react'
import { NewPatientModal } from '@/components/patients/new-patient-modal'
import { PatientDetailModal } from '@/components/patients/patient-detail-modal'
import { useToast } from '@/components/ui/toast'

export default function PatientsPage() {
  const { toast } = useToast()
  const [patients, setPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
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
    setSearch(searchInput)
    setPage(1)
  }

  const handleDelete = async (patientId: string) => {
    if (!confirm('Tem certeza que deseja excluir este paciente? Esta acao nao pode ser desfeita.')) return
    try {
      await patientsApi.delete(patientId)
      toast({
        title: 'Sucesso',
        description: 'Paciente excluido com sucesso!',
        variant: 'success',
      })
      fetchPatients()
    } catch (error) {
      console.error('Error deleting patient:', error)
      toast({
        title: 'Erro',
        description: 'Nao foi possivel excluir o paciente.',
        variant: 'error',
      })
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 animate-fade-in">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Pacientes</h1>
          <p className="text-muted-foreground mt-1">
            Gerencie os pacientes da clinica
          </p>
        </div>
        <Button onClick={() => setShowNewModal(true)} variant="gradient" size="lg">
          <Plus className="h-4 w-4 mr-2" />
          Novo Paciente
        </Button>
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
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <Users className="h-8 w-8 opacity-50" />
              </div>
              <p className="font-medium">Nenhum paciente encontrado</p>
              <p className="text-sm mt-1">Adicione um novo paciente para comecar</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="font-semibold">Nome</TableHead>
                    <TableHead className="font-semibold">Telefone</TableHead>
                    <TableHead className="font-semibold">Email</TableHead>
                    <TableHead className="font-semibold">Cadastro</TableHead>
                    <TableHead className="text-right font-semibold">Acoes</TableHead>
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
          >
            <ChevronLeft className="h-4 w-4" />
            Anterior
          </Button>
          <div className="flex items-center gap-1 px-4">
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
                >
                  {pageNum}
                </Button>
              )
            })}
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={page === totalPages}
            onClick={() => setPage(page + 1)}
            className="gap-1"
          >
            Proxima
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
    </div>
  )
}
