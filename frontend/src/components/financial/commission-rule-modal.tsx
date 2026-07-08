'use client'

import { useEffect, useState } from 'react'
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
import { Select } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { useAuth } from '@/app/providers'
import { financialApi, professionalsApi } from '@/lib/api'
import { Professional } from '@/types'
import { Percent, Users } from '@phosphor-icons/react'

interface CommissionRuleModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

type Kind = 'percentage' | 'fixed_amount'

export function CommissionRuleModal({ open, onOpenChange, onSuccess }: CommissionRuleModalProps) {
  const { toast } = useToast()
  const { clinic } = useAuth()
  const [loading, setLoading] = useState(false)
  const [professionals, setProfessionals] = useState<Professional[]>([])

  const [professionalId, setProfessionalId] = useState('')
  const [serviceName, setServiceName] = useState('')
  const [kind, setKind] = useState<Kind>('percentage')
  const [value, setValue] = useState('')

  const services = clinic?.services || []

  useEffect(() => {
    if (!open) return
    setProfessionalId('')
    setServiceName('')
    setKind('percentage')
    setValue('')

    professionalsApi.list({ active: true })
      .then((res) => setProfessionals(res.data.professionals || []))
      .catch(() => setProfessionals([]))
  }, [open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!value || Number(value) <= 0) {
      toast({ title: 'Erro', description: 'Informe um valor válido.', variant: 'error' })
      return
    }

    setLoading(true)
    try {
      await financialApi.createCommissionRule({
        professional_id: professionalId || null,
        service_name: serviceName || null,
        percentage: kind === 'percentage' ? Number(value) : null,
        fixed_amount: kind === 'fixed_amount' ? Number(value) : null,
      })

      toast({ title: 'Sucesso', description: 'Regra de comissão criada!', variant: 'success' })
      onSuccess()
      onOpenChange(false)
    } catch (error) {
      console.error('Error creating commission rule:', error)
      toast({ title: 'Erro', description: 'Não foi possível criar a regra.', variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogClose onClick={() => onOpenChange(false)} />
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-card bg-primary flex items-center justify-center">
              <Percent className="h-6 w-6 text-white" />
            </div>
            <div>
              <DialogTitle className="text-lg">Nova Regra de Comissão</DialogTitle>
              <DialogDescription>Defina quanto um profissional ganha por atendimento</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="professional" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Profissional
            </Label>
            <Select id="professional" value={professionalId} onChange={(e) => setProfessionalId(e.target.value)}>
              <option value="">Todos os profissionais (regra padrão)</option>
              {professionals.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="service">Serviço</Label>
            <Select id="service" value={serviceName} onChange={(e) => setServiceName(e.target.value)}>
              <option value="">Todos os serviços</option>
              {services.map((s) => (
                <option key={s.name} value={s.name}>{s.name}</option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="kind">Tipo</Label>
              <Select id="kind" value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
                <option value="percentage">Percentual (%)</option>
                <option value="fixed_amount">Valor fixo (R$)</option>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="value" required>{kind === 'percentage' ? 'Percentual' : 'Valor (R$)'}</Label>
              <Input
                id="value" type="number" step="0.01" min="0"
                max={kind === 'percentage' ? 100 : undefined}
                value={value} onChange={(e) => setValue(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" variant="gradient" loading={loading}>
              Criar Regra
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
