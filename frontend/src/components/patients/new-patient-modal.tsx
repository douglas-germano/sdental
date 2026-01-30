'use client'

import { useState } from 'react'
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
import { useToast } from '@/components/ui/toast'
import { patientsApi } from '@/lib/api'
import { formatPhoneInput, normalizePhoneForApi, validatePhoneForApi } from '@/lib/utils'
import { User, Phone, Mail, FileText, UserPlus } from 'lucide-react'

interface NewPatientModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function NewPatientModal({
  open,
  onOpenChange,
  onSuccess,
}: NewPatientModalProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    notes: '',
  })

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setFormData({ name: '', phone: '', email: '', notes: '' })
    }
    onOpenChange(newOpen)
  }

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhoneInput(e.target.value)
    setFormData({ ...formData, phone: formatted })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

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
      await patientsApi.create({
        name: formData.name.trim(),
        phone: normalizePhoneForApi(formData.phone),
        email: formData.email.trim() || undefined,
        notes: formData.notes.trim() || undefined,
      })

      toast({
        title: 'Sucesso',
        description: 'Paciente cadastrado com sucesso!',
        variant: 'success',
      })

      onSuccess()
      handleOpenChange(false)
    } catch (error) {
      console.error('Error creating patient:', error)
      toast({
        title: 'Erro',
        description: 'Não foi possível cadastrar o paciente. Tente novamente.',
        variant: 'error',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogClose onClick={() => handleOpenChange(false)} />

        <DialogHeader>
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-gradient-primary flex items-center justify-center shadow-lg">
              <UserPlus className="h-6 w-6 text-white" />
            </div>
            <div>
              <DialogTitle className="text-lg">Novo Paciente</DialogTitle>
              <DialogDescription>
                Preencha os dados para cadastrar um novo paciente
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="name" required>Nome completo</Label>
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="name"
                placeholder="Digite o nome do paciente"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="pl-11"
                autoFocus
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone" required>Telefone</Label>
            <div className="relative">
              <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="phone"
                placeholder="(11) 99999-9999"
                value={formData.phone}
                onChange={handlePhoneChange}
                className="pl-11"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                placeholder="email@exemplo.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="pl-11"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Observações
            </Label>
            <Textarea
              id="notes"
              placeholder="Observações sobre o paciente (alergias, restrições, etc.)"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button type="submit" variant="gradient" loading={loading}>
              <UserPlus className="h-4 w-4 mr-2" />
              Cadastrar Paciente
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
