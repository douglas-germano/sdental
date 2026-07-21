'use client'

import { useEffect, useState, useCallback } from 'react'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { StatsCard } from '@/components/dashboard/stats-card'
import { RevenueChart } from '@/components/financial/revenue-chart'
import { PaymentsTab } from '@/components/financial/payments-tab'
import { ExpensesTab } from '@/components/financial/expenses-tab'
import { CommissionsTab } from '@/components/financial/commissions-tab'
import { CashFlowTab } from '@/components/financial/cash-flow-tab'
import { financialApi } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import { FinancialSummary, RevenueTimeseriesPoint, RevenueBreakdownItem } from '@/types'
import {
  CurrencyDollar,
  TrendUp as TrendingUp,
  CalendarX,
  ChartLineUp,
} from '@phosphor-icons/react'

const PERIOD_OPTIONS = [
  { label: '30 dias', value: 30 },
  { label: '60 dias', value: 60 },
  { label: '90 dias', value: 90 },
]

const GROUP_BY_OPTIONS: { label: string; value: 'day' | 'week' | 'month' }[] = [
  { label: 'Dia', value: 'day' },
  { label: 'Semana', value: 'week' },
  { label: 'Mês', value: 'month' },
]

type Section = 'overview' | 'payments' | 'expenses' | 'commissions' | 'cashflow'

export default function FinancialPage() {
  const [activeSection, setActiveSection] = useState<Section>('overview')
  const [days, setDays] = useState(30)
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('week')
  const [breakdownBy, setBreakdownBy] = useState<'service' | 'professional'>('service')

  const [summary, setSummary] = useState<FinancialSummary | null>(null)
  const [series, setSeries] = useState<RevenueTimeseriesPoint[]>([])
  const [breakdown, setBreakdown] = useState<RevenueBreakdownItem[]>([])

  const [loadingSummary, setLoadingSummary] = useState(true)
  const [loadingSeries, setLoadingSeries] = useState(true)
  const [loadingBreakdown, setLoadingBreakdown] = useState(true)

  const fetchSummary = useCallback(async () => {
    setLoadingSummary(true)
    try {
      const response = await financialApi.getSummary(days)
      setSummary(response.data)
    } catch (error) {
      console.error('Error fetching financial summary:', error)
      setSummary(null)
    } finally {
      setLoadingSummary(false)
    }
  }, [days])

  const fetchSeries = useCallback(async () => {
    setLoadingSeries(true)
    try {
      const response = await financialApi.getTimeseries({ group_by: groupBy })
      setSeries(response.data.series || [])
    } catch (error) {
      console.error('Error fetching revenue timeseries:', error)
      setSeries([])
    } finally {
      setLoadingSeries(false)
    }
  }, [groupBy])

  const fetchBreakdown = useCallback(async () => {
    setLoadingBreakdown(true)
    try {
      const response = await financialApi.getBreakdown({ days, by: breakdownBy })
      setBreakdown(response.data.breakdown || [])
    } catch (error) {
      console.error('Error fetching revenue breakdown:', error)
      setBreakdown([])
    } finally {
      setLoadingBreakdown(false)
    }
  }, [days, breakdownBy])

  useEffect(() => { fetchSummary() }, [fetchSummary])
  useEffect(() => { fetchSeries() }, [fetchSeries])
  useEffect(() => { fetchBreakdown() }, [fetchBreakdown])

  const seriesHasData = series.some((p) => p.realized > 0 || p.forecast > 0)

  return (
    <div className="space-y-6">
      <PageHeader title="Financeiro" description="Faturamento, pagamentos, despesas, comissões e fluxo de caixa da clínica">
        {activeSection === 'overview' && (
          <SegmentedControl
            size="sm"
            options={PERIOD_OPTIONS}
            value={days}
            onValueChange={setDays}
          />
        )}
      </PageHeader>

      <Tabs value={activeSection} onValueChange={(v) => setActiveSection(v as typeof activeSection)}>
        <TabsList>
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="payments">Pagamentos</TabsTrigger>
          <TabsTrigger value="expenses">Despesas</TabsTrigger>
          <TabsTrigger value="commissions">Comissões</TabsTrigger>
          <TabsTrigger value="cashflow">Fluxo de Caixa</TabsTrigger>
        </TabsList>

        <TabsContent value="payments" className="mt-6">
          <PaymentsTab />
        </TabsContent>
        <TabsContent value="expenses" className="mt-6">
          <ExpensesTab />
        </TabsContent>
        <TabsContent value="commissions" className="mt-6">
          <CommissionsTab />
        </TabsContent>
        <TabsContent value="cashflow" className="mt-6">
          <CashFlowTab />
        </TabsContent>

        <TabsContent value="overview" className="mt-6 space-y-8">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatsCard
              title="Faturamento Realizado"
              value={loadingSummary ? '' : formatCurrency(summary?.realized_revenue || 0)}
              icon={CurrencyDollar}
              variant="success"
              loading={loadingSummary}
              description={`${summary?.realized_count || 0} consultas concluídas`}
            />
            <StatsCard
              title="Faturamento Previsto"
              value={loadingSummary ? '' : formatCurrency(summary?.forecast_revenue || 0)}
              icon={TrendingUp}
              variant="accent"
              loading={loadingSummary}
              description={`${summary?.forecast_count || 0} consultas confirmadas/pendentes`}
            />
            <StatsCard
              title="Receita Perdida"
              value={loadingSummary ? '' : formatCurrency(summary?.lost_revenue || 0)}
              icon={CalendarX}
              variant="destructive"
              loading={loadingSummary}
              description={`${summary?.lost_count || 0} cancelamentos/faltas`}
            />
          </div>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <CardTitle className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-primary/8 flex items-center justify-center shrink-0">
                    <ChartLineUp className="h-4 w-4 text-primary" />
                  </div>
                  Faturamento ao longo do tempo
                </CardTitle>
                <SegmentedControl
                  size="sm"
                  options={GROUP_BY_OPTIONS}
                  value={groupBy}
                  onValueChange={setGroupBy}
                />
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {loadingSeries ? (
                <Skeleton className="h-[280px] w-full rounded-xl" />
              ) : seriesHasData ? (
                <RevenueChart data={series} groupBy={groupBy} />
              ) : (
                <EmptyState
                  compact
                  icon={ChartLineUp}
                  title="Sem dados ainda"
                  description="O gráfico será exibido quando houver agendamentos com serviços precificados"
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Detalhamento</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <Tabs value={breakdownBy} onValueChange={(v) => setBreakdownBy(v as 'service' | 'professional')}>
                <TabsList className="mb-4">
                  <TabsTrigger value="service">Por Serviço</TabsTrigger>
                  <TabsTrigger value="professional">Por Profissional</TabsTrigger>
                </TabsList>
                <TabsContent value={breakdownBy}>
                  {loadingBreakdown ? (
                    <div className="space-y-2">
                      {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
                    </div>
                  ) : breakdown.length === 0 ? (
                    <EmptyState
                      compact
                      icon={CurrencyDollar}
                      title="Nenhum dado no período"
                      description="Ajuste o período ou verifique se os serviços têm preço cadastrado"
                    />
                  ) : (
                    <div className="space-y-1">
                      {breakdown.map((item) => (
                        <div
                          key={item.name}
                          className="flex items-center justify-between gap-3 py-3 border-b border-border/60 last:border-0"
                        >
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">{item.name}</p>
                            <p className="text-xs text-muted-foreground">{item.count} consulta(s)</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {item.realized > 0 && (
                              <Badge variant="success" className="gap-1">
                                {formatCurrency(item.realized)}
                              </Badge>
                            )}
                            {item.forecast > 0 && (
                              <Badge variant="info" className="gap-1">
                                {formatCurrency(item.forecast)}
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
