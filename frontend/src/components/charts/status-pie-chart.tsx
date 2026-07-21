'use client'

import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts'
import { AnalyticsOverview } from '@/types'

interface StatusPieChartProps {
  overview: AnalyticsOverview | null
  height?: number
}

const COLORS = {
  completed: 'hsl(var(--success))',
  cancelled: 'hsl(var(--destructive))',
  no_shows: 'hsl(var(--muted-foreground))',
  upcoming: 'hsl(var(--primary))',
}

export function StatusPieChart({ overview, height = 95 }: StatusPieChartProps) {
  if (!overview) {
    return (
      <div style={{ height }} className="flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
      </div>
    )
  }

  const data = [
    { name: 'Concluidos', value: overview.appointments.completed, color: COLORS.completed },
    { name: 'Cancelados', value: overview.appointments.cancelled, color: COLORS.cancelled },
    { name: 'Faltas', value: overview.appointments.no_shows, color: COLORS.no_shows },
    { name: 'Proximos', value: overview.appointments.upcoming, color: COLORS.upcoming },
  ].filter(item => item.value > 0)

  if (data.length === 0) {
    return (
      <div style={{ height }} className="flex items-center justify-center text-muted-foreground text-sm">
        Nenhum dado disponivel
      </div>
    )
  }

  const radius = Math.max(Math.min(Math.floor(height / 2) - 22, 64), 32)

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={Math.floor(radius * 0.66)}
          outerRadius={radius}
          paddingAngle={3}
          dataKey="value"
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} strokeWidth={0} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value: number) => [value, 'Agendamentos']}
          contentStyle={{
            backgroundColor: 'hsl(var(--popover))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '10px',
            fontSize: '12px',
            boxShadow: '0 2px 8px rgb(0 0 0 / 0.06), 0 1px 2px rgb(0 0 0 / 0.04)',
          }}
        />
        <Legend
          verticalAlign="bottom"
          height={28}
          formatter={(value) => <span className="text-xs text-muted-foreground">{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}
