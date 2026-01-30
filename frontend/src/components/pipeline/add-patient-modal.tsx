'use client'

import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/toast'
import { patientsApi } from '@/lib/api'
import { formatPhoneInput, normalizePhoneForApi, validatePhoneForApi } from '@/lib/utils'
import { Loader2, UserPlus } from 'lucide-react'

interface Stage {
  id: string
  name: string
  color: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  stages: Stage[]
}

export function AddPatientModal({ open, onOpenChange, onSuccess, stages }: Props) {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    notes: '',
    stageId: '',
  })
  const { toast } = useToast()

  // Set default stage when modal opens
  useEffect(() => {
    if (open && stages.length > 0 && !formData.stageId) {
      setFormData(prev => ({ ...prev, stageId: stages[0].id }))
    }
  }, [open, stages, formData.stageId])

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhoneInput(e.target.value)
    setFormData({ ...formData, phone: formatted })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.name.trim() || !formData.phone.trim()) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Nome e telefone são obrigatórios.',
        variant: 'error',
      })
      return
    }

    const phoneValidation = validatePhoneForApi(formData.phone)
    if (!phoneValidation.valid) {
      toast({
        title: 'Telefone inválido',
        description: 'Digite um número de telefone válido com DDD.',
        variant: 'error',
      })
      return
    }

    if (!formData.stageId) {
      toast({
        title: 'Selecione um estágio',
        description: 'Por favor, selecione o estágio inicial.',
        variant: 'error',
      })
      return
    }

    setLoading(true)

    try {
      // Create patient with pipeline stage in a single call
      await patientsApi.create({
        name: formData.name.trim(),
        phone: normalizePhoneForApi(formData.phone),
        email: formData.email.trim() || undefined,
        notes: formData.notes.trim() || undefined,
        pipeline_stage_id: formData.stageId,
      })

      toast({
        title: 'Sucesso',
        description: 'Paciente adicionado ao pipeline.',
        variant: 'success',
      })

      // Reset form
      setFormData({
        name: '',
        phone: '',
        email: '',
        notes: '',
        stageId: stages[0]?.id || '',
      })

      onSuccess()
      onOpenChange(false)
    } catch (error: any) {
      console.error('Error adding patient:', error)
      const errorMessage = error?.response?.data?.error || 'Não foi possível adicionar o paciente.'
      toast({
        title: 'Erro',
        description: errorMessage,
        variant: 'error',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            Adicionar Novo Paciente
          </DialogTitle>
          <DialogDescription>
            Crie um novo paciente e adicione-o ao pipeline
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">
              Nome <span className="text-red-500">*</span>
            </Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Nome completo do paciente"
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">
              Telefone <span className="text-red-500">*</span>
            </Label>
            <Input
              id="phone"
              value={formData.phone}
              onChange={handlePhoneChange}
              placeholder="(11) 99999-9999"
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="email@exemplo.com"
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="stageId">
              Estágio Inicial <span className="text-red-500">*</span>
            </Label>
            <select
              id="stageId"
              value={formData.stageId}
              onChange={(e) => setFormData({ ...formData, stageId: e.target.value })}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={loading}
            >
              {stages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Observações</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Notas adicionais sobre o paciente"
              rows={3}
              disabled={loading}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Adicionando...
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4 mr-2" />
                  Adicionar
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
