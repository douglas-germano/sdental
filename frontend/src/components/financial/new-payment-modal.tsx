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
import { Select } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { financialApi, patientsApi } from '@/lib/api'
import { Patient, PaymentMethod } from '@/types'
import { User, CurrencyDollar, CalendarBlank as Calendar, FileText, CircleNotch as Loader2 } from '@phosphor-icons/react'

const METHOD_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: 'pix', label: 'Pix' },
  { value: 'cash', label: 'Dinheiro' },
  { value: 'credit_card', label: 'Cartão de crédito' },
  { value: 'debit_card', label: 'Cartão de débito' },
  { value: 'bank_transfer', label: 'Transferência' },
  { value: 'health_insurance', label: 'Convênio' },
  { value: 'other', label: 'Outro' },
]

interface NewPaymentModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function NewPaymentModal({ open, onOpenChange, onSuccess }: NewPaymentModalProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [loadingPatients, setLoadingPatients] = useState(false)
  const [patients, setPatients] = useState<Patient[]>([])

  const [patientId, setPatientId] = useState('')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('pix')
  const [dueDate, setDueDate] = useState('')
  const [installments, setInstallments] = useState('1')
  const [markPaidNow, setMarkPaidNow] = useState(false)
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (!open) return
    setPatientId('')
    setAmount('')
    setMethod('pix')
    setDueDate('')
    setInstallments('1')
    setMarkPaidNow(false)
    setNotes('')

    setLoadingPatients(true)
    patientsApi.list({ per_page: 100 })
      .then((res) => setPatients(res.data.patients || []))
      .catch(() => setPatients([]))
      .finally(() => setLoadingPatients(false))
  }, [open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!patientId || !amount || Number(amount) <= 0) {
      toast({ title: 'Erro', description: 'Selecione o paciente e informe um valor válido.', variant: 'error' })
      return
    }

    setLoading(true)
    try {
      const response = await financialApi.createPayment({
        patient_id: patientId,
        amount: Number(amount),
        method,
        due_date: dueDate || null,
        installments: Number(installments) || 1,
        notes: notes || undefined,
      })

      if (markPaidNow && Number(installments) === 1) {
        const payment = response.data.payments[0]
        await financialApi.registerPayment(payment.id, { paid_amount: Number(amount), method })
      }

      toast({ title: 'Sucesso', description: 'Cobrança registrada com sucesso!', variant: 'success' })
      onSuccess()
      onOpenChange(false)
    } catch (error) {
      console.error('Error creating payment:', error)
      toast({ title: 'Erro', description: 'Não foi possível registrar a cobrança.', variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogClose onClick={() => onOpenChange(false)} />
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-card bg-primary flex items-center justify-center">
              <CurrencyDollar className="h-6 w-6 text-white" />
            </div>
            <div>
              <DialogTitle className="text-lg">Novo Pagamento</DialogTitle>
              <DialogDescription>Registre uma cobrança para um paciente</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="patient" className="flex items-center gap-2" required>
              <User className="h-4 w-4" />
              Paciente
            </Label>
            {loadingPatients ? (
              <div className="flex items-center gap-3 text-sm text-muted-foreground h-10 px-3.5 bg-muted/30 rounded-lg border border-input">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando pacientes...
              </div>
            ) : (
              <Select id="patient" value={patientId} onChange={(e) => setPatientId(e.target.value)}>
                <option value="">Selecione um paciente</option>
                {patients.map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.name} - {patient.phone}
                  </option>
                ))}
              </Select>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amount" className="flex items-center gap-2" required>
                <CurrencyDollar className="h-4 w-4" />
                Valor total (R$)
              </Label>
              <Input
                id="amount" type="number" step="0.01" min="0.01" placeholder="0,00"
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
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="due_date" className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Vencimento
              </Label>
              <Input id="due_date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="installments">Parcelas</Label>
              <Select id="installments" value={installments} onChange={(e) => setInstallments(e.target.value)}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>{n}x{n > 1 ? ` de ${amount ? (Number(amount) / n).toFixed(2) : '...'}` : ''}</option>
                ))}
              </Select>
            </div>
          </div>

          {Number(installments) === 1 && (
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox" checked={markPaidNow}
                onChange={(e) => setMarkPaidNow(e.target.checked)}
                className="h-4 w-4 rounded border-input"
              />
              Já foi pago (marcar como recebido agora)
            </label>
          )}

          <div className="space-y-2">
            <Label htmlFor="notes" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Observações
            </Label>
            <Textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" variant="gradient" loading={loading}>
              <CurrencyDollar className="h-4 w-4" />
              Registrar Pagamento
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
