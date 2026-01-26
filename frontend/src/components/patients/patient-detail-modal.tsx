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
import { User, Phone, Mail, Calendar, FileText, Edit2 } from 'lucide-react'

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
        description: 'Nome e telefone sao obrigatorios.',
        variant: 'error',
      })
      return
    }

    const phoneDigits = formData.phone.replace(/\D/g, '')
    if (phoneDigits.length < 10) {
      toast({
        title: 'Erro',
        description: 'Telefone invalido.',
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
        description: 'Nao foi possivel atualizar o paciente.',
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
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-primary flex items-center justify-center">
                <User className="h-5 w-5 text-white" />
              </div>
              <DialogTitle>Detalhes do Paciente</DialogTitle>
            </div>
            {!isEditing && (
              <Button variant="ghost" size="sm" onClick={() => setIsEditing(true)} className="gap-1">
                <Edit2 className="h-4 w-4" />
                Editar
              </Button>
            )}
          </div>
        </DialogHeader>

        {isEditing ? (
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Nome *</Label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="edit-name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="pl-11"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-phone">Telefone *</Label>
              <div className="relative">
                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="edit-phone"
                  value={formData.phone}
                  onChange={handlePhoneChange}
                  className="pl-11"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="edit-email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="pl-11"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-notes" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Observacoes
              </Label>
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
              <Button variant="gradient" onClick={handleSave} loading={loading}>
                Salvar
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4 pt-2">
            {/* Patient Info */}
            <div className="bg-muted/30 p-4 rounded-xl space-y-3 border border-border/50">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-gradient-primary flex items-center justify-center text-white font-semibold text-lg">
                  {patient.name.charAt(0).toUpperCase()}
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
                  <Phone className="h-4 w-4 text-primary" />
                  <span>{formatPhone(patient.phone)}</span>
                </div>
                {patient.email && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="h-4 w-4 text-primary" />
                    <span>{patient.email}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Notes */}
            {patient.notes && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Observacoes
                </Label>
                <p className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-xl border border-border/50">
                  {patient.notes}
                </p>
              </div>
            )}

            {/* Recent Appointments */}
            {patient.appointments && patient.appointments.length > 0 && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Ultimos Agendamentos
                </Label>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {patient.appointments.slice(0, 5).map((apt) => (
                    <div
                      key={apt.id}
                      className="flex items-center justify-between text-sm bg-muted/30 p-3 rounded-xl border border-border/50 transition-colors hover:bg-muted/50"
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
