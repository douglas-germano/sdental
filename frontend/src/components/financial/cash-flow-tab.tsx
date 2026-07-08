'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { financialApi } from '@/lib/api'
import { formatCurrency, formatDate, cn } from '@/lib/utils'
import { CashFlow, GoalProgress, Payment, Expense } from '@/types'
import {
  ArrowCircleDown as ArrowDown, ArrowCircleUp as ArrowUp, Scales,
  Target, PencilSimple as Pencil,
} from '@phosphor-icons/react'
import { SetGoalModal } from './set-goal-modal'

function currentPeriod(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function CashFlowTab() {
  const [cashFlow, setCashFlow] = useState<CashFlow | null>(null)
  const [goal, setGoal] = useState<GoalProgress | null>(null)
  const [receivables, setReceivables] = useState<{ total: number; overdue_total: number; overdue_count: number; items: Payment[] } | null>(null)
  const [payables, setPayables] = useState<{ total: number; overdue_total: number; overdue_count: number; items: Expense[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [showGoalModal, setShowGoalModal] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [cashFlowRes, goalRes, receivablesRes, payablesRes] = await Promise.all([
        financialApi.getCashFlow(30),
        financialApi.getGoals(currentPeriod()),
        financialApi.getReceivables(30),
        financialApi.getPayables(30),
      ])
      setCashFlow(cashFlowRes.data)
      setGoal(goalRes.data)
      setReceivables(receivablesRes.data)
      setPayables(payablesRes.data)
    } catch (error) {
      console.error('Error fetching cash flow data:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
        </div>
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    )
  }

  const progressPct = Math.min(goal?.progress_pct ?? 0, 100)

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-success/10 flex items-center justify-center shrink-0">
              <ArrowUp className="h-5 w-5 text-success" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Entrou (30d)</p>
              <p className="text-lg font-bold truncate">{formatCurrency(cashFlow?.cash_in || 0)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
              <ArrowDown className="h-5 w-5 text-destructive" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Saiu (30d)</p>
              <p className="text-lg font-bold truncate">{formatCurrency(cashFlow?.cash_out || 0)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Scales className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Saldo líquido (30d)</p>
              <p className={cn('text-lg font-bold truncate', (cashFlow?.net_cash_flow || 0) < 0 && 'text-destructive')}>
                {formatCurrency(cashFlow?.net_cash_flow || 0)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-primary/8 flex items-center justify-center shrink-0">
                <Target className="h-4 w-4 text-primary" />
              </div>
              Meta do mês
            </CardTitle>
            <Button size="sm" variant="outline" onClick={() => setShowGoalModal(true)}>
              <Pencil className="h-3.5 w-3.5" />
              {goal?.has_goal ? 'Editar' : 'Definir Meta'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {!goal?.has_goal ? (
            <EmptyState
              compact
              icon={Target}
              title="Nenhuma meta definida"
              description="Defina uma meta de faturamento mensal para acompanhar o progresso"
            />
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {formatCurrency(goal.realized_revenue)} de {formatCurrency(goal.target_amount || 0)}
                </span>
                <span className="font-semibold">{goal.progress_pct}%</span>
              </div>
              <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={cn('h-full rounded-full transition-all', progressPct >= 100 ? 'bg-success' : 'bg-primary')}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">A receber (próx. 30 dias)</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total em aberto</span>
              <span className="font-semibold">{formatCurrency(receivables?.total || 0)}</span>
            </div>
            {(receivables?.overdue_count || 0) > 0 && (
              <div className="flex items-center justify-between text-sm">
                <Badge variant="destructive">{receivables?.overdue_count} atrasado(s)</Badge>
                <span className="font-medium text-destructive">{formatCurrency(receivables?.overdue_total || 0)}</span>
              </div>
            )}
            {!receivables?.items.length ? (
              <p className="text-sm text-muted-foreground py-2">Nenhum valor a receber.</p>
            ) : (
              <div className="space-y-1 max-h-52 overflow-y-auto">
                {receivables.items.slice(0, 8).map((p) => (
                  <div key={p.id} className="flex items-center justify-between text-sm py-1.5 border-b border-border/50 last:border-0">
                    <span className="truncate">{p.patient_name}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted-foreground">{p.due_date ? formatDate(p.due_date) : '—'}</span>
                      <span className="font-medium">{formatCurrency(Number(p.amount) - Number(p.paid_amount))}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">A pagar (próx. 30 dias)</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total em aberto</span>
              <span className="font-semibold">{formatCurrency(payables?.total || 0)}</span>
            </div>
            {(payables?.overdue_count || 0) > 0 && (
              <div className="flex items-center justify-between text-sm">
                <Badge variant="destructive">{payables?.overdue_count} atrasada(s)</Badge>
                <span className="font-medium text-destructive">{formatCurrency(payables?.overdue_total || 0)}</span>
              </div>
            )}
            {!payables?.items.length ? (
              <p className="text-sm text-muted-foreground py-2">Nenhuma despesa a pagar.</p>
            ) : (
              <div className="space-y-1 max-h-52 overflow-y-auto">
                {payables.items.slice(0, 8).map((e) => (
                  <div key={e.id} className="flex items-center justify-between text-sm py-1.5 border-b border-border/50 last:border-0">
                    <span className="truncate">{e.description}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted-foreground">{e.due_date ? formatDate(e.due_date) : '—'}</span>
                      <span className="font-medium">{formatCurrency(Number(e.amount))}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <SetGoalModal
        open={showGoalModal}
        currentPeriod={currentPeriod()}
        currentTarget={goal?.target_amount ?? null}
        onOpenChange={setShowGoalModal}
        onSuccess={fetchData}
      />
    </div>
  )
}
