'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import {
  formatPhone,
  formatPhoneInput,
  normalizePhoneForApi,
  validatePhoneForApi,
  formatDate,
  formatDateTime,
  getStatusColor,
  getStatusLabel,
} from '@/lib/utils'
import { User, Phone, Mail, Calendar, FileText, Edit2, Save, X } from 'lucide-react'

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

    const phoneValidation = validatePhoneForApi(formData.phone)
    if (!phoneValidation.valid) {
      toast({
        title: 'Erro',
        description: 'Telefone inválido. Digite um número com DDD.',
        variant: 'error',
      })
      return
    }

    setLoading(true)
    try {
      await patientsApi.update(patient.id, {
        name: formData.name.trim(),
        phone: normalizePhoneForApi(formData.phone),
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
      <DialogContent className="sm:max-w-[520px]">
        <DialogClose onClick={() => onOpenChange(false)} />

        <DialogHeader>
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-gradient-primary flex items-center justify-center shadow-lg text-white font-semibold text-lg">
              {patient.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1">
              <DialogTitle className="text-lg">{patient.name}</DialogTitle>
              <DialogDescription>
                Cadastrado em {formatDate(patient.created_at)}
              </DialogDescription>
            </div>
            {!isEditing && (
              <Button variant="outline" size="sm" onClick={() => setIsEditing(true)} className="gap-2">
                <Edit2 className="h-4 w-4" />
                Editar
              </Button>
            )}
          </div>
        </DialogHeader>

        {isEditing ? (
          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="edit-name" required>Nome completo</Label>
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
              <Label htmlFor="edit-phone" required>Telefone</Label>
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
                Observações
              </Label>
              <Textarea
                id="edit-notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Observações sobre o paciente..."
                rows={3}
              />
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsEditing(false)}
                disabled={loading}
              >
                <X className="h-4 w-4 mr-2" />
                Cancelar
              </Button>
              <Button variant="gradient" onClick={handleSave} loading={loading}>
                <Save className="h-4 w-4 mr-2" />
                Salvar Alterações
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Contact Info */}
            <div className="bg-muted/30 p-4 rounded-xl border border-border/50">
              <h4 className="text-sm font-medium text-muted-foreground mb-3">Informações de Contato</h4>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Phone className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Telefone</p>
                    <p className="font-medium">{formatPhone(patient.phone)}</p>
                  </div>
                </div>
                {patient.email && (
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Mail className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Email</p>
                      <p className="font-medium">{patient.email}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Notes */}
            {patient.notes && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-muted-foreground">
                  <FileText className="h-4 w-4" />
                  Observações
                </Label>
                <div className="bg-muted/30 p-4 rounded-xl border border-border/50">
                  <p className="text-sm">{patient.notes}</p>
                </div>
              </div>
            )}

            {/* Recent Appointments */}
            {patient.appointments && patient.appointments.length > 0 && (
              <div className="space-y-3">
                <Label className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  Últimos Agendamentos
                </Label>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {patient.appointments.slice(0, 5).map((apt) => (
                    <div
                      key={apt.id}
                      className="flex items-center justify-between bg-muted/30 p-3 rounded-xl border border-border/50 transition-all hover:bg-muted/50 hover:border-border"
                    >
                      <div>
                        <p className="font-medium text-sm">{apt.service_name}</p>
                        <p className="text-muted-foreground text-xs">
                          {formatDateTime(apt.scheduled_datetime)}
                        </p>
                      </div>
                      <Badge className={getStatusColor(apt.status)} size="sm">
                        {getStatusLabel(apt.status)}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Fechar
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
