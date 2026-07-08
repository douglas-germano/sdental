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
import { Expense, ExpenseStatus } from '@/types'
import { Receipt, Plus, CheckCircle, Trash } from '@phosphor-icons/react'
import { NewExpenseModal } from './new-expense-modal'

const STATUS_LABEL: Record<ExpenseStatus, string> = {
  pending: 'Pendente',
  paid: 'Paga',
  cancelled: 'Cancelada',
}

const STATUS_VARIANT: Record<ExpenseStatus, 'warning' | 'success' | 'destructive'> = {
  pending: 'warning',
  paid: 'success',
  cancelled: 'destructive',
}

const CATEGORY_LABEL: Record<string, string> = {
  rent: 'Aluguel', supplies: 'Insumos', salaries: 'Salários', marketing: 'Marketing',
  equipment: 'Equipamentos', taxes: 'Impostos', utilities: 'Contas', other: 'Outro',
}

function isOverdue(expense: Expense): boolean {
  return expense.status === 'pending' && !!expense.due_date && new Date(expense.due_date) < new Date(new Date().toDateString())
}

export function ExpensesTab() {
  const { toast } = useToast()
  const { confirm, ConfirmDialogComponent } = useConfirm()
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')
  const [showNewModal, setShowNewModal] = useState(false)

  const fetchExpenses = useCallback(async () => {
    setLoading(true)
    try {
      const response = await financialApi.listExpenses({ status: status || undefined, per_page: 50 })
      setExpenses(response.data.expenses || [])
    } catch (error) {
      console.error('Error fetching expenses:', error)
      setExpenses([])
    } finally {
      setLoading(false)
    }
  }, [status])

  useEffect(() => { fetchExpenses() }, [fetchExpenses])

  const handlePay = async (expense: Expense) => {
    try {
      await financialApi.payExpense(expense.id)
      toast({ title: 'Despesa marcada como paga', variant: 'success' })
      fetchExpenses()
    } catch (error) {
      console.error('Error paying expense:', error)
      toast({ title: 'Erro', description: 'Não foi possível marcar como paga.', variant: 'error' })
    }
  }

  const handleDelete = async (expense: Expense) => {
    const ok = await confirm({
      title: 'Remover despesa',
      description: `Remover "${expense.description}" (${formatCurrency(Number(expense.amount))})?`,
      variant: 'destructive',
    })
    if (!ok) return
    try {
      await financialApi.deleteExpense(expense.id)
      toast({ title: 'Despesa removida', variant: 'success' })
      fetchExpenses()
    } catch (error) {
      console.error('Error deleting expense:', error)
      toast({ title: 'Erro', description: 'Não foi possível remover.', variant: 'error' })
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto min-w-[180px]">
          <option value="">Todos os status</option>
          <option value="pending">Pendente</option>
          <option value="paid">Paga</option>
          <option value="cancelled">Cancelada</option>
        </Select>
        <Button onClick={() => setShowNewModal(true)}>
          <Plus className="h-4 w-4" />
          Nova Despesa
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
        </div>
      ) : expenses.length === 0 ? (
        <EmptyState
          compact
          icon={Receipt}
          title="Nenhuma despesa registrada"
          description="Registre aluguel, insumos, salários e outras contas para ver o lucro real da clínica"
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Descrição</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {expenses.map((expense) => (
              <TableRow key={expense.id}>
                <TableCell>
                  <div className="font-medium">{expense.description}</div>
                  {expense.professional_name && (
                    <div className="text-xs text-muted-foreground">{expense.professional_name}</div>
                  )}
                </TableCell>
                <TableCell>{CATEGORY_LABEL[expense.category] || expense.category}</TableCell>
                <TableCell>{formatCurrency(Number(expense.amount))}</TableCell>
                <TableCell>
                  {expense.due_date ? formatDate(expense.due_date) : '—'}
                  {isOverdue(expense) && <Badge variant="destructive" size="sm" className="ml-2">Atrasada</Badge>}
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[expense.status]}>{STATUS_LABEL[expense.status]}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    {expense.status === 'pending' && (
                      <Button size="icon-sm" variant="ghost" title="Marcar como paga" onClick={() => handlePay(expense)}>
                        <CheckCircle className="h-4 w-4 text-success" />
                      </Button>
                    )}
                    <Button size="icon-sm" variant="ghost" title="Remover" onClick={() => handleDelete(expense)}>
                      <Trash className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <NewExpenseModal open={showNewModal} onOpenChange={setShowNewModal} onSuccess={fetchExpenses} />
      {ConfirmDialogComponent}
    </div>
  )
}
