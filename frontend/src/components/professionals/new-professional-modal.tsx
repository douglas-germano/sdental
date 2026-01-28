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
import { useToast } from '@/components/ui/toast'
import { professionalsApi } from '@/lib/api'
import { User, Phone, Mail, Stethoscope, Palette, UserPlus } from 'lucide-react'

interface NewProfessionalModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

const PRESET_COLORS = [
  '#3B82F6', // blue
  '#10B981', // green
  '#F59E0B', // amber
  '#EF4444', // red
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#06B6D4', // cyan
  '#84CC16', // lime
]

export function NewProfessionalModal({
  open,
  onOpenChange,
  onSuccess,
}: NewProfessionalModalProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    specialty: '',
    color: PRESET_COLORS[0],
  })

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setFormData({
        name: '',
        email: '',
        phone: '',
        specialty: '',
        color: PRESET_COLORS[0],
      })
    }
    onOpenChange(newOpen)
  }

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.name.trim()) {
      toast({
        title: 'Erro',
        description: 'Nome e obrigatorio.',
        variant: 'error',
      })
      return
    }

    setLoading(true)
    try {
      const phoneDigits = formData.phone.replace(/\D/g, '')

      await professionalsApi.create({
        name: formData.name.trim(),
        email: formData.email.trim() || undefined,
        phone: phoneDigits ? `55${phoneDigits}` : undefined,
        specialty: formData.specialty.trim() || undefined,
        color: formData.color,
      })

      toast({
        title: 'Sucesso',
        description: 'Profissional cadastrado com sucesso!',
        variant: 'success',
      })

      onSuccess()
      handleOpenChange(false)
    } catch (error) {
      console.error('Error creating professional:', error)
      toast({
        title: 'Erro',
        description: 'Nao foi possivel cadastrar o profissional. Tente novamente.',
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
              <Stethoscope className="h-6 w-6 text-white" />
            </div>
            <div>
              <DialogTitle className="text-lg">Novo Profissional</DialogTitle>
              <DialogDescription>
                Preencha os dados para cadastrar um novo profissional
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
                placeholder="Digite o nome do profissional"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="pl-11"
                autoFocus
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="specialty">Especialidade</Label>
            <div className="relative">
              <Stethoscope className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="specialty"
                placeholder="Ex: Ortodontia, Implantes, Clinico Geral"
                value={formData.specialty}
                onChange={(e) => setFormData({ ...formData, specialty: e.target.value })}
                className="pl-11"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Telefone</Label>
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
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Palette className="h-4 w-4" />
              Cor de identificacao
            </Label>
            <div className="flex gap-2 flex-wrap">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setFormData({ ...formData, color })}
                  className={`w-8 h-8 rounded-full transition-all ${
                    formData.color === color
                      ? 'ring-2 ring-offset-2 ring-primary scale-110'
                      : 'hover:scale-105'
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
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
              Cadastrar Profissional
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
