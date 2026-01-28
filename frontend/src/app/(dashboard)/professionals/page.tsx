'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { professionalsApi } from '@/lib/api'
import { Professional } from '@/types'
import { formatDate } from '@/lib/utils'
import { Users, Eye, Trash2, Plus, Stethoscope, Star } from 'lucide-react'
import { NewProfessionalModal } from '@/components/professionals/new-professional-modal'
import { ProfessionalDetailModal } from '@/components/professionals/professional-detail-modal'
import { useToast } from '@/components/ui/toast'

export default function ProfessionalsPage() {
  const { toast } = useToast()
  const [professionals, setProfessionals] = useState<Professional[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewModal, setShowNewModal] = useState(false)
  const [selectedProfessional, setSelectedProfessional] = useState<Professional | null>(null)

  const fetchProfessionals = async () => {
    setLoading(true)
    try {
      const response = await professionalsApi.list()
      setProfessionals(response.data.professionals || [])
    } catch (error) {
      console.error('Error fetching professionals:', error)
      toast({
        title: 'Erro',
        description: 'Nao foi possivel carregar os profissionais.',
        variant: 'error',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProfessionals()
  }, [])

  const handleDelete = async (professionalId: string) => {
    if (!confirm('Tem certeza que deseja desativar este profissional?')) return
    try {
      await professionalsApi.delete(professionalId)
      toast({
        title: 'Sucesso',
        description: 'Profissional desativado com sucesso!',
        variant: 'success',
      })
      fetchProfessionals()
    } catch (error) {
      console.error('Error deleting professional:', error)
      toast({
        title: 'Erro',
        description: 'Nao foi possivel desativar o profissional.',
        variant: 'error',
      })
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 animate-fade-in">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Profissionais</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie os profissionais da clinica
          </p>
        </div>
        <Button onClick={() => setShowNewModal(true)} variant="gradient">
          <Plus className="h-4 w-4 mr-2" />
          Novo Profissional
        </Button>
      </div>

      {/* Professionals Table */}
      <Card className="animate-fade-in-up" style={{ animationDelay: '100ms' }}>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <div className="w-10 h-10 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
              <p className="text-muted-foreground text-sm">Carregando profissionais...</p>
            </div>
          ) : professionals.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <Stethoscope className="h-8 w-8 opacity-50" />
              </div>
              <p className="font-medium">Nenhum profissional cadastrado</p>
              <p className="text-sm mt-1">Adicione um novo profissional para comecar</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="font-semibold">Nome</TableHead>
                    <TableHead className="font-semibold">Especialidade</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                    <TableHead className="font-semibold">Cadastro</TableHead>
                    <TableHead className="text-right font-semibold">Acoes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {professionals.map((professional, index) => (
                    <TableRow
                      key={professional.id}
                      className="animate-fade-in hover:bg-muted/30 transition-colors"
                      style={{ animationDelay: `${index * 30}ms` }}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div
                            className="w-9 h-9 rounded-full flex items-center justify-center text-white font-medium text-sm"
                            style={{ backgroundColor: professional.color || '#3B82F6' }}
                          >
                            {professional.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{professional.name}</span>
                            {professional.is_default && (
                              <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {professional.specialty || '-'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={professional.active ? 'success' : 'secondary'}>
                          {professional.active ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(professional.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            onClick={() => setSelectedProfessional(professional)}
                            className="hover:bg-primary/10 hover:text-primary"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            onClick={() => handleDelete(professional.id)}
                            className="hover:bg-destructive/10 hover:text-destructive"
                            disabled={!professional.active}
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

      {/* Modals */}
      <NewProfessionalModal
        open={showNewModal}
        onOpenChange={setShowNewModal}
        onSuccess={fetchProfessionals}
      />

      <ProfessionalDetailModal
        professional={selectedProfessional}
        open={!!selectedProfessional}
        onOpenChange={(open: boolean) => !open && setSelectedProfessional(null)}
        onUpdate={fetchProfessionals}
      />
    </div>
  )
}
