'use client'

import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts'
import { AnalyticsOverview } from '@/types'

interface StatusPieChartProps {
  overview: AnalyticsOverview | null
}

const COLORS = {
  completed: '#22c55e',
  cancelled: '#ef4444',
  no_shows: '#6b7280',
  upcoming: '#3b82f6',
}

export function StatusPieChart({ overview }: StatusPieChartProps) {
  if (!overview) {
    return (
      <div className="h-[200px] flex items-center justify-center">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
      </div>
    )
  }

  const data = [
    { name: 'Concluídos', value: overview.appointments.completed, color: COLORS.completed },
    { name: 'Cancelados', value: overview.appointments.cancelled, color: COLORS.cancelled },
    { name: 'Faltas', value: overview.appointments.no_shows, color: COLORS.no_shows },
    { name: 'Próximos', value: overview.appointments.upcoming, color: COLORS.upcoming },
  ].filter(item => item.value > 0)

  if (data.length === 0) {
    return (
      <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
        Nenhum dado disponível
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
          paddingAngle={2}
          dataKey="value"
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value: number) => [value, 'Agendamentos']}
          contentStyle={{
            backgroundColor: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            fontSize: '12px',
          }}
        />
        <Legend
          verticalAlign="bottom"
          height={36}
          formatter={(value) => <span className="text-xs">{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}
