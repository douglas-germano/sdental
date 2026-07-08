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
import { financialApi } from '@/lib/api'
import { Payment, PaymentMethod } from '@/types'
import { formatCurrency } from '@/lib/utils'
import { CurrencyDollar } from '@phosphor-icons/react'

const METHOD_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: 'pix', label: 'Pix' },
  { value: 'cash', label: 'Dinheiro' },
  { value: 'credit_card', label: 'Cartão de crédito' },
  { value: 'debit_card', label: 'Cartão de débito' },
  { value: 'bank_transfer', label: 'Transferência' },
  { value: 'health_insurance', label: 'Convênio' },
  { value: 'other', label: 'Outro' },
]

interface RegisterPaymentModalProps {
  payment: Payment | null
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function RegisterPaymentModal({ payment, onOpenChange, onSuccess }: RegisterPaymentModalProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('pix')

  const outstanding = payment ? Number(payment.amount) - Number(payment.paid_amount) : 0

  useEffect(() => {
    if (payment) {
      setAmount(outstanding.toFixed(2))
      setMethod(payment.method)
    }
  }, [payment]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!payment || !amount || Number(amount) <= 0) return

    setLoading(true)
    try {
      await financialApi.registerPayment(payment.id, { paid_amount: Number(amount), method })
      toast({ title: 'Sucesso', description: 'Recebimento registrado!', variant: 'success' })
      onSuccess()
      onOpenChange(false)
    } catch (error) {
      console.error('Error registering payment:', error)
      toast({ title: 'Erro', description: 'Não foi possível registrar o recebimento.', variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={!!payment} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogClose onClick={() => onOpenChange(false)} />
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-card bg-success flex items-center justify-center">
              <CurrencyDollar className="h-6 w-6 text-white" />
            </div>
            <div>
              <DialogTitle className="text-lg">Registrar Recebimento</DialogTitle>
              <DialogDescription>
                {payment?.patient_name} · saldo em aberto: {formatCurrency(outstanding)}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="paid_amount" required>Valor recebido (R$)</Label>
            <Input
              id="paid_amount" type="number" step="0.01" min="0.01" max={outstanding}
              value={amount} onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="method">Forma de pagamento</Label>
            <Select id="method" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              {METHOD_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </Select>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" variant="gradient" loading={loading}>
              Confirmar Recebimento
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
