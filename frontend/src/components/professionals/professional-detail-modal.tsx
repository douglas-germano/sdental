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
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/components/ui/toast'
import { professionalsApi } from '@/lib/api'
import { Professional } from '@/types'
import { formatPhone, formatDate } from '@/lib/utils'
import { User, Phone, Mail, Edit2, Save, X, Stethoscope, Palette, Star } from 'lucide-react'

interface ProfessionalDetailModalProps {
  professional: Professional | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdate: () => void
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

export function ProfessionalDetailModal({
  professional,
  open,
  onOpenChange,
  onUpdate,
}: ProfessionalDetailModalProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    specialty: '',
    color: PRESET_COLORS[0],
    active: true,
    is_default: false,
  })

  useEffect(() => {
    if (professional && open) {
      setFormData({
        name: professional.name,
        email: professional.email || '',
        phone: professional.phone ? formatPhone(professional.phone) : '',
        specialty: professional.specialty || '',
        color: professional.color || PRESET_COLORS[0],
        active: professional.active,
        is_default: professional.is_default,
      })
      setIsEditing(false)
    }
  }, [professional, open])

  if (!professional) return null

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

      await professionalsApi.update(professional.id, {
        name: formData.name.trim(),
        email: formData.email.trim() || undefined,
        phone: phoneDigits ? `55${phoneDigits}` : undefined,
        specialty: formData.specialty.trim() || undefined,
        color: formData.color,
        active: formData.active,
        is_default: formData.is_default,
      })

      toast({
        title: 'Sucesso',
        description: 'Profissional atualizado com sucesso!',
        variant: 'success',
      })

      setIsEditing(false)
      onUpdate()
    } catch (error) {
      console.error('Error updating professional:', error)
      toast({
        title: 'Erro',
        description: 'Nao foi possivel atualizar o profissional.',
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
            <div
              className="h-12 w-12 rounded-2xl flex items-center justify-center shadow-lg text-white font-semibold text-lg"
              style={{ backgroundColor: professional.color || '#3B82F6' }}
            >
              {professional.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <DialogTitle className="text-lg">{professional.name}</DialogTitle>
                {professional.is_default && (
                  <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                )}
              </div>
              <DialogDescription>
                {professional.specialty || 'Profissional'} - Cadastrado em {formatDate(professional.created_at)}
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
              <Label htmlFor="edit-specialty">Especialidade</Label>
              <div className="relative">
                <Stethoscope className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="edit-specialty"
                  value={formData.specialty}
                  onChange={(e) => setFormData({ ...formData, specialty: e.target.value })}
                  className="pl-11"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-phone">Telefone</Label>
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

            <div className="space-y-4 bg-muted/30 p-4 rounded-xl border border-border/50">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="font-medium">Status</Label>
                  <p className="text-sm text-muted-foreground">Ativar ou desativar profissional</p>
                </div>
                <Switch
                  checked={formData.active}
                  onCheckedChange={(checked) => setFormData({ ...formData, active: checked })}
                />
              </div>

              <div className="flex items-center justify-between border-t border-border/50 pt-4">
                <div>
                  <Label className="font-medium flex items-center gap-2">
                    <Star className="h-4 w-4" />
                    Profissional Padrao
                  </Label>
                  <p className="text-sm text-muted-foreground">Sera selecionado automaticamente</p>
                </div>
                <Switch
                  checked={formData.is_default}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_default: checked })}
                />
              </div>
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
                Salvar Alteracoes
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Status */}
            <div className="flex items-center gap-3">
              <Badge variant={professional.active ? 'success' : 'secondary'}>
                {professional.active ? 'Ativo' : 'Inativo'}
              </Badge>
              {professional.is_default && (
                <Badge variant="outline" className="gap-1">
                  <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                  Padrao
                </Badge>
              )}
            </div>

            {/* Contact Info */}
            <div className="bg-muted/30 p-4 rounded-xl border border-border/50">
              <h4 className="text-sm font-medium text-muted-foreground mb-3">Informacoes</h4>
              <div className="space-y-3">
                {professional.specialty && (
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Stethoscope className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Especialidade</p>
                      <p className="font-medium">{professional.specialty}</p>
                    </div>
                  </div>
                )}
                {professional.phone && (
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Phone className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Telefone</p>
                      <p className="font-medium">{formatPhone(professional.phone)}</p>
                    </div>
                  </div>
                )}
                {professional.email && (
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Mail className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Email</p>
                      <p className="font-medium">{professional.email}</p>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: `${professional.color}20` }}
                  >
                    <Palette className="h-4 w-4" style={{ color: professional.color }} />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Cor de identificacao</p>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: professional.color || '#3B82F6' }}
                      />
                      <p className="font-medium text-sm">{professional.color || '#3B82F6'}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

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
