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
import { lookupCep, formatCepInput } from '@/lib/cep'
import { User, Phone, Mail, FileText, UserPlus, MapPin, Loader2 } from 'lucide-react'

const EMPTY_ADDRESS = {
  address_zip_code: '',
  address_street: '',
  address_number: '',
  address_complement: '',
  address_neighborhood: '',
  address_city: '',
  address_state: '',
}

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
  const [lookingUpCep, setLookingUpCep] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    notes: '',
    ...EMPTY_ADDRESS,
  })

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setFormData({ name: '', phone: '', email: '', notes: '', ...EMPTY_ADDRESS })
    }
    onOpenChange(newOpen)
  }

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhoneInput(e.target.value)
    setFormData({ ...formData, phone: formatted })
  }

  const handleCepChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, address_zip_code: formatCepInput(e.target.value) })
  }

  const handleCepBlur = async () => {
    if (formData.address_zip_code.replace(/\D/g, '').length !== 8) return
    setLookingUpCep(true)
    const address = await lookupCep(formData.address_zip_code)
    setLookingUpCep(false)
    if (address) {
      setFormData((prev) => ({
        ...prev,
        address_street: address.street || prev.address_street,
        address_neighborhood: address.neighborhood || prev.address_neighborhood,
        address_city: address.city || prev.address_city,
        address_state: address.state || prev.address_state,
      }))
    }
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
        address_zip_code: formData.address_zip_code.trim() || undefined,
        address_street: formData.address_street.trim() || undefined,
        address_number: formData.address_number.trim() || undefined,
        address_complement: formData.address_complement.trim() || undefined,
        address_neighborhood: formData.address_neighborhood.trim() || undefined,
        address_city: formData.address_city.trim() || undefined,
        address_state: formData.address_state.trim() || undefined,
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
      <DialogContent className="sm:max-w-lg">
        <DialogClose onClick={() => handleOpenChange(false)} />

        <DialogHeader>
          <div className="flex items-center gap-3">
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

          <div className="space-y-3 pt-1">
            <Label className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="h-4 w-4" />
              Endereço (opcional)
            </Label>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="cep" className="text-xs text-muted-foreground">CEP</Label>
                <div className="relative">
                  <Input
                    id="cep"
                    placeholder="00000-000"
                    value={formData.address_zip_code}
                    onChange={handleCepChange}
                    onBlur={handleCepBlur}
                  />
                  {lookingUpCep && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="address-number" className="text-xs text-muted-foreground">Número</Label>
                <Input
                  id="address-number"
                  placeholder="123"
                  value={formData.address_number}
                  onChange={(e) => setFormData({ ...formData, address_number: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address-street" className="text-xs text-muted-foreground">Rua / Logradouro</Label>
              <Input
                id="address-street"
                placeholder="Rua Exemplo"
                value={formData.address_street}
                onChange={(e) => setFormData({ ...formData, address_street: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="address-complement" className="text-xs text-muted-foreground">Complemento</Label>
              <Input
                id="address-complement"
                placeholder="Apto, bloco, referência..."
                value={formData.address_complement}
                onChange={(e) => setFormData({ ...formData, address_complement: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-[1fr_1fr_80px] gap-3">
              <div className="space-y-2">
                <Label htmlFor="address-neighborhood" className="text-xs text-muted-foreground">Bairro</Label>
                <Input
                  id="address-neighborhood"
                  placeholder="Bairro"
                  value={formData.address_neighborhood}
                  onChange={(e) => setFormData({ ...formData, address_neighborhood: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address-city" className="text-xs text-muted-foreground">Cidade</Label>
                <Input
                  id="address-city"
                  placeholder="Cidade"
                  value={formData.address_city}
                  onChange={(e) => setFormData({ ...formData, address_city: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address-state" className="text-xs text-muted-foreground">UF</Label>
                <Input
                  id="address-state"
                  placeholder="SP"
                  maxLength={2}
                  value={formData.address_state}
                  onChange={(e) => setFormData({ ...formData, address_state: e.target.value.toUpperCase() })}
                />
              </div>
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
              <UserPlus className="h-4 w-4" />
              Cadastrar Paciente
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
