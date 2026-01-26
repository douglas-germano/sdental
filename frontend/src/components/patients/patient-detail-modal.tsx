'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import { patientsApi } from '@/lib/api'
import { Patient } from '@/types'
import { formatPhone, formatDate, formatDateTime, getStatusColor, getStatusLabel } from '@/lib/utils'
import { Loader2, User, Phone, Mail, Calendar, FileText, Edit2 } from 'lucide-react'

interface PatientDetailModalProps {
  patient: Patient | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdate: () => void
}

export function PatientDetailModal({
  patient,
  open,
  onOpenChange,
  onUpdate,
}: PatientDetailModalProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    notes: '',
  })

  useEffect(() => {
    if (patient && open) {
      setFormData({
        name: patient.name,
        phone: formatPhone(patient.phone),
        email: patient.email || '',
        notes: patient.notes || '',
      })
      setIsEditing(false)
    }
  }, [patient, open])

  if (!patient) return null

  const formatPhoneInput = (value: string) => {
    const digits = value.replace(/\D/g, '')
    if (digits.length <= 2) return digits
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
    if (digits.length <= 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`
  }

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhoneInput(e.target.value)
    setFormData({ ...formData, phone: formatted })
  }

  const handleSave = async () => {
    if (!formData.name.trim() || !formData.phone.trim()) {
      toast({
        title: 'Erro',
        description: 'Nome e telefone são obrigatórios.',
        variant: 'error',
      })
      return
    }

    const phoneDigits = formData.phone.replace(/\D/g, '')
    if (phoneDigits.length < 10) {
      toast({
        title: 'Erro',
        description: 'Telefone inválido.',
        variant: 'error',
      })
      return
    }

    setLoading(true)
    try {
      await patientsApi.update(patient.id, {
        name: formData.name.trim(),
        phone: `55${phoneDigits}`,
        email: formData.email.trim() || undefined,
        notes: formData.notes.trim() || undefined,
      })

      toast({
        title: 'Sucesso',
        description: 'Paciente atualizado com sucesso!',
        variant: 'success',
      })

      setIsEditing(false)
      onUpdate()
    } catch (error) {
      console.error('Error updating patient:', error)
      toast({
        title: 'Erro',
        description: 'Não foi possível atualizar o paciente.',
        variant: 'error',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogClose onClick={() => onOpenChange(false)} />
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Detalhes do Paciente</DialogTitle>
            {!isEditing && (
              <Button variant="ghost" size="sm" onClick={() => setIsEditing(true)}>
                <Edit2 className="h-4 w-4 mr-1" />
                Editar
              </Button>
            )}
          </div>
        </DialogHeader>

        {isEditing ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Nome *</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-phone">Telefone *</Label>
              <Input
                id="edit-phone"
                value={formData.phone}
                onChange={handlePhoneChange}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-notes">Observações</Label>
              <Textarea
                id="edit-notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
              />
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsEditing(false)}
                disabled={loading}
              >
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Patient Info */}
            <div className="bg-gray-50 p-4 rounded-lg space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-lg">{patient.name}</p>
                  <p className="text-sm text-muted-foreground">
                    Cadastrado em {formatDate(patient.created_at)}
                  </p>
                </div>
              </div>

              <div className="grid gap-2 pt-2">
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span>{formatPhone(patient.phone)}</span>
                </div>
                {patient.email && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span>{patient.email}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Notes */}
            {patient.notes && (
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  <FileText className="h-4 w-4" />
                  Observações
                </Label>
                <p className="text-sm text-muted-foreground bg-gray-50 p-3 rounded-lg">
                  {patient.notes}
                </p>
              </div>
            )}

            {/* Recent Appointments */}
            {patient.appointments && patient.appointments.length > 0 && (
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  Últimos Agendamentos
                </Label>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {patient.appointments.slice(0, 5).map((apt) => (
                    <div
                      key={apt.id}
                      className="flex items-center justify-between text-sm bg-gray-50 p-2 rounded"
                    >
                      <div>
                        <p className="font-medium">{apt.service_name}</p>
                        <p className="text-muted-foreground text-xs">
                          {formatDateTime(apt.scheduled_datetime)}
                        </p>
                      </div>
                      <Badge className={getStatusColor(apt.status)}>
                        {getStatusLabel(apt.status)}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Fechar
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
