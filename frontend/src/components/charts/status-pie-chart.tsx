'use client'

import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts'
import { AnalyticsOverview } from '@/types'

interface StatusPieChartProps {
  overview: AnalyticsOverview | null
}

const COLORS = {
  completed: 'hsl(160, 84%, 39%)',
  cancelled: 'hsl(350, 89%, 60%)',
  no_shows: 'hsl(var(--muted-foreground))',
  upcoming: 'hsl(238, 84%, 67%)',
}

export function StatusPieChart({ overview }: StatusPieChartProps) {
  if (!overview) {
    return (
      <div className="h-[200px] flex items-center justify-center">
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
      <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
        Nenhum dado disponivel
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={50}
          outerRadius={70}
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
            backgroundColor: 'hsl(var(--background))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '12px',
            fontSize: '12px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
          }}
        />
        <Legend
          verticalAlign="bottom"
          height={36}
          formatter={(value) => <span className="text-xs text-muted-foreground">{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}
