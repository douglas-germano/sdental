'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { useToast } from '@/components/ui/toast'
import { useConfirm } from '@/hooks/useConfirm'
import { financialApi } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import { CommissionRule, CommissionSummaryItem } from '@/types'
import { Percent, Plus, HandCoins, Trash, Users } from '@phosphor-icons/react'
import { CommissionRuleModal } from './commission-rule-modal'
import { RegisterPayoutModal } from './register-payout-modal'

export function CommissionsTab() {
  const { toast } = useToast()
  const { confirm, ConfirmDialogComponent } = useConfirm()
  const [summary, setSummary] = useState<CommissionSummaryItem[]>([])
  const [rules, setRules] = useState<CommissionRule[]>([])
  const [loading, setLoading] = useState(true)
  const [showRuleModal, setShowRuleModal] = useState(false)
  const [payoutTarget, setPayoutTarget] = useState<CommissionSummaryItem | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [summaryRes, rulesRes] = await Promise.all([
        financialApi.getCommissions(30),
        financialApi.listCommissionRules(),
      ])
      setSummary(summaryRes.data.commissions || [])
      setRules(rulesRes.data.rules || [])
    } catch (error) {
      console.error('Error fetching commissions:', error)
      setSummary([])
      setRules([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const handleDeleteRule = async (rule: CommissionRule) => {
    const ok = await confirm({
      title: 'Remover regra',
      description: `Remover a regra de comissão de ${rule.professional_name || 'todos os profissionais'}${rule.service_name ? ` para ${rule.service_name}` : ''}?`,
      variant: 'destructive',
    })
    if (!ok) return
    try {
      await financialApi.deleteCommissionRule(rule.id)
      toast({ title: 'Regra removida', variant: 'success' })
      fetchData()
    } catch (error) {
      console.error('Error deleting rule:', error)
      toast({ title: 'Erro', description: 'Não foi possível remover a regra.', variant: 'error' })
    }
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold mb-3">Comissões por profissional (últimos 30 dias)</h3>
        {summary.length === 0 ? (
          <EmptyState
            compact
            icon={HandCoins}
            title="Nenhuma comissão calculada"
            description="Crie regras de comissão e conclua atendimentos com profissionais para ver os valores aqui"
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {summary.map((entry) => (
              <Card key={entry.professional_id}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-sm truncate">{entry.professional_name}</p>
                    {entry.balance > 0 && (
                      <Badge variant="warning">a pagar</Badge>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div>
                      <p className="text-2xs uppercase tracking-wide">Ganho (30d)</p>
                      <p className="text-sm font-semibold text-foreground">{formatCurrency(entry.earned_period)}</p>
                    </div>
                    <div>
                      <p className="text-2xs uppercase tracking-wide">Total pago</p>
                      <p className="text-sm font-semibold text-foreground">{formatCurrency(entry.paid_total)}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-border/60">
                    <div>
                      <p className="text-2xs uppercase tracking-wide text-muted-foreground">Saldo devido</p>
                      <p className={`text-base font-bold ${entry.balance > 0 ? 'text-warning' : 'text-success'}`}>
                        {formatCurrency(entry.balance)}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => setPayoutTarget(entry)}>
                      <HandCoins className="h-4 w-4" />
                      Repassar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Regras de comissão</h3>
          <Button size="sm" onClick={() => setShowRuleModal(true)}>
            <Plus className="h-4 w-4" />
            Nova Regra
          </Button>
        </div>
        {rules.length === 0 ? (
          <EmptyState
            compact
            icon={Percent}
            title="Nenhuma regra cadastrada"
            description="Defina um percentual ou valor fixo por profissional e/ou serviço"
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Profissional</TableHead>
                <TableHead>Serviço</TableHead>
                <TableHead>Comissão</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Users className="h-3.5 w-3.5 text-muted-foreground" />
                      {rule.professional_name || 'Todos os profissionais'}
                    </div>
                  </TableCell>
                  <TableCell>{rule.service_name || 'Todos os serviços'}</TableCell>
                  <TableCell>
                    {rule.percentage !== null ? `${rule.percentage}%` : formatCurrency(rule.fixed_amount || 0)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="icon-sm" variant="ghost" title="Remover" onClick={() => handleDeleteRule(rule)}>
                      <Trash className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <CommissionRuleModal open={showRuleModal} onOpenChange={setShowRuleModal} onSuccess={fetchData} />
      <RegisterPayoutModal entry={payoutTarget} onOpenChange={(open) => !open && setPayoutTarget(null)} onSuccess={fetchData} />
      {ConfirmDialogComponent}
    </div>
  )
}
