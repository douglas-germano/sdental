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
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/toast'
import { financialApi } from '@/lib/api'
import { CommissionSummaryItem } from '@/types'
import { formatCurrency } from '@/lib/utils'
import { HandCoins } from '@phosphor-icons/react'

interface RegisterPayoutModalProps {
  entry: CommissionSummaryItem | null
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

function firstDayOfMonth(): string {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
}

function today(): string {
  return new Date().toISOString().split('T')[0]
}

export function RegisterPayoutModal({ entry, onOpenChange, onSuccess }: RegisterPayoutModalProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [amount, setAmount] = useState('')
  const [periodStart, setPeriodStart] = useState(firstDayOfMonth())
  const [periodEnd, setPeriodEnd] = useState(today())
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (entry) {
      setAmount(entry.balance > 0 ? entry.balance.toFixed(2) : '')
      setPeriodStart(firstDayOfMonth())
      setPeriodEnd(today())
      setNotes('')
    }
  }, [entry])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!entry || !amount || Number(amount) <= 0) return

    setLoading(true)
    try {
      await financialApi.createCommissionPayout({
        professional_id: entry.professional_id,
        period_start: periodStart,
        period_end: periodEnd,
        amount: Number(amount),
        notes: notes || undefined,
      })
      toast({ title: 'Sucesso', description: 'Repasse registrado!', variant: 'success' })
      onSuccess()
      onOpenChange(false)
    } catch (error) {
      console.error('Error registering payout:', error)
      toast({ title: 'Erro', description: 'Não foi possível registrar o repasse.', variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={!!entry} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogClose onClick={() => onOpenChange(false)} />
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-card bg-primary flex items-center justify-center">
              <HandCoins className="h-6 w-6 text-white" />
            </div>
            <div>
              <DialogTitle className="text-lg">Registrar Repasse</DialogTitle>
              <DialogDescription>
                {entry?.professional_name} · saldo devido: {entry ? formatCurrency(entry.balance) : ''}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="period_start" required>Período - início</Label>
              <Input id="period_start" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="period_end" required>Período - fim</Label>
              <Input id="period_end" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount" required>Valor pago (R$)</Label>
            <Input id="amount" type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Observações</Label>
            <Textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" variant="gradient" loading={loading}>
              Confirmar Repasse
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
