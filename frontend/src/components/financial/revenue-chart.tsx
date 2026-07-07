'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { formatCurrency } from '@/lib/utils'
import type { RevenueTimeseriesPoint } from '@/types'

interface RevenueChartProps {
  data: RevenueTimeseriesPoint[]
  groupBy: 'day' | 'week' | 'month'
}

function formatPeriodLabel(period: string, groupBy: string): string {
  if (groupBy === 'month') {
    const [year, month] = period.split('-')
    const date = new Date(Number(year), Number(month) - 1, 1)
    return date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
  }
  if (groupBy === 'week') {
    const [, week] = period.split('-W')
    return `Sem ${week}`
  }
  const date = new Date(`${period}T00:00:00`)
  if (isNaN(date.getTime())) return period
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

export function RevenueChart({ data, groupBy }: RevenueChartProps) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }} barGap={2} barCategoryGap="20%">
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} vertical={false} />
        <XAxis
          dataKey="period"
          tickFormatter={(value) => formatPeriodLabel(value, groupBy)}
          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => formatCurrency(value, { compact: true })}
          width={64}
        />
        <Tooltip
          labelFormatter={(value) => formatPeriodLabel(String(value), groupBy)}
          formatter={(value: number, name: string) => [formatCurrency(value), name]}
          contentStyle={{
            backgroundColor: 'hsl(var(--background))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '6px',
            fontSize: '12px',
            boxShadow: 'none',
          }}
        />
        <Legend
          wrapperStyle={{ fontSize: '12px', color: 'hsl(var(--muted-foreground))' }}
          iconType="circle"
          iconSize={8}
        />
        <Bar
          dataKey="realized"
          name="Realizado"
          fill="hsl(var(--success))"
          radius={[4, 4, 0, 0]}
          maxBarSize={24}
        />
        <Bar
          dataKey="forecast"
          name="Previsto"
          fill="hsl(var(--accent))"
          radius={[4, 4, 0, 0]}
          maxBarSize={24}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}
