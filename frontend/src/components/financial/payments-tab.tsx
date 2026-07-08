'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { useToast } from '@/components/ui/toast'
import { useConfirm } from '@/hooks/useConfirm'
import { financialApi } from '@/lib/api'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Payment, PaymentStatus } from '@/types'
import { CurrencyDollar, Plus, CheckCircle, XCircle } from '@phosphor-icons/react'
import { NewPaymentModal } from './new-payment-modal'
import { RegisterPaymentModal } from './register-payment-modal'

const STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: 'Pendente',
  partial: 'Parcial',
  paid: 'Pago',
  refunded: 'Reembolsado',
  cancelled: 'Cancelado',
}

const STATUS_VARIANT: Record<PaymentStatus, 'warning' | 'info' | 'success' | 'secondary' | 'destructive'> = {
  pending: 'warning',
  partial: 'info',
  paid: 'success',
  refunded: 'secondary',
  cancelled: 'destructive',
}

const METHOD_LABEL: Record<string, string> = {
  cash: 'Dinheiro', pix: 'Pix', credit_card: 'Cartão crédito', debit_card: 'Cartão débito',
  bank_transfer: 'Transferência', health_insurance: 'Convênio', other: 'Outro',
}

export function PaymentsTab() {
  const { toast } = useToast()
  const { confirm, ConfirmDialogComponent } = useConfirm()
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')
  const [showNewModal, setShowNewModal] = useState(false)
  const [registerTarget, setRegisterTarget] = useState<Payment | null>(null)

  const fetchPayments = useCallback(async () => {
    setLoading(true)
    try {
      const response = await financialApi.listPayments({ status: status || undefined, per_page: 50 })
      setPayments(response.data.payments || [])
    } catch (error) {
      console.error('Error fetching payments:', error)
      setPayments([])
    } finally {
      setLoading(false)
    }
  }, [status])

  useEffect(() => { fetchPayments() }, [fetchPayments])

  const handleCancel = async (payment: Payment) => {
    const ok = await confirm({
      title: 'Cancelar cobrança',
      description: `Cancelar a cobrança de ${formatCurrency(Number(payment.amount))} de ${payment.patient_name}?`,
      variant: 'destructive',
    })
    if (!ok) return
    try {
      await financialApi.cancelPayment(payment.id)
      toast({ title: 'Cobrança cancelada', variant: 'success' })
      fetchPayments()
    } catch (error) {
      console.error('Error cancelling payment:', error)
      toast({ title: 'Erro', description: 'Não foi possível cancelar.', variant: 'error' })
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto min-w-[180px]">
          <option value="">Todos os status</option>
          <option value="pending">Pendente</option>
          <option value="partial">Parcial</option>
          <option value="paid">Pago</option>
          <option value="refunded">Reembolsado</option>
          <option value="cancelled">Cancelado</option>
        </Select>
        <Button onClick={() => setShowNewModal(true)}>
          <Plus className="h-4 w-4" />
          Novo Pagamento
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
        </div>
      ) : payments.length === 0 ? (
        <EmptyState
          compact
          icon={CurrencyDollar}
          title="Nenhum pagamento registrado"
          description="Registre cobranças recebidas dos pacientes para acompanhar o caixa real da clínica"
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Paciente</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Forma</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.map((payment) => (
              <TableRow key={payment.id}>
                <TableCell>
                  <div className="font-medium">{payment.patient_name}</div>
                  {payment.installment_total > 1 && (
                    <div className="text-xs text-muted-foreground">
                      Parcela {payment.installment_number}/{payment.installment_total}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  {formatCurrency(Number(payment.amount))}
                  {payment.status === 'partial' && (
                    <div className="text-xs text-muted-foreground">
                      recebido: {formatCurrency(Number(payment.paid_amount))}
                    </div>
                  )}
                </TableCell>
                <TableCell>{METHOD_LABEL[payment.method] || payment.method}</TableCell>
                <TableCell>{payment.due_date ? formatDate(payment.due_date) : '—'}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[payment.status]}>{STATUS_LABEL[payment.status]}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    {(payment.status === 'pending' || payment.status === 'partial') && (
                      <>
                        <Button size="icon-sm" variant="ghost" title="Registrar recebimento" onClick={() => setRegisterTarget(payment)}>
                          <CheckCircle className="h-4 w-4 text-success" />
                        </Button>
                        <Button size="icon-sm" variant="ghost" title="Cancelar" onClick={() => handleCancel(payment)}>
                          <XCircle className="h-4 w-4 text-destructive" />
                        </Button>
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <NewPaymentModal open={showNewModal} onOpenChange={setShowNewModal} onSuccess={fetchPayments} />
      <RegisterPaymentModal payment={registerTarget} onOpenChange={(open) => !open && setRegisterTarget(null)} onSuccess={fetchPayments} />
      {ConfirmDialogComponent}
    </div>
  )
}
