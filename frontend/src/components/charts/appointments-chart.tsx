'use client'

import { useEffect, useState } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { analyticsApi } from '@/lib/api'
import { CalendarBlank as Calendar } from '@phosphor-icons/react'

interface ChartData {
  date: string
  total: number
  completed: number
  cancelled: number
}

function formatChartDate(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`)
  if (isNaN(date.getTime())) return dateStr
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

export function AppointmentsChart() {
  const [data, setData] = useState<ChartData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await analyticsApi.appointmentsByPeriod('day', 30)
        const chartData = response.data.data || []
        setData(chartData)
        setError(false)
      } catch (error) {
        console.error('Error fetching chart data:', error)
        setData([])
        setError(true)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  if (loading) {
    return (
      <div className="h-[95px] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
      </div>
    )
  }

  if (error || data.length === 0) {
    return (
      <div className="h-[95px] flex flex-col items-center justify-center text-muted-foreground">
        <Calendar className="h-8 w-8 mb-1.5 opacity-40" />
        <p className="text-sm">Nenhum dado disponivel</p>
        <p className="text-xs mt-1">Os dados aparecerao conforme os agendamentos forem criados</p>
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={95}>
      <AreaChart
        data={data}
        margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
      >
        <defs>
          <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="colorCompleted" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.4} />
            <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
        <XAxis
          dataKey="date"
          tickFormatter={formatChartDate}
          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
        />
        <Tooltip
          labelFormatter={formatChartDate}
          contentStyle={{
            backgroundColor: 'hsl(var(--background))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '6px',
            fontSize: '12px',
            boxShadow: 'none',
          }}
        />
        <Area
          type="monotone"
          dataKey="total"
          name="Total"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          fillOpacity={1}
          fill="url(#colorTotal)"
        />
        <Area
          type="monotone"
          dataKey="completed"
          name="Concluidos"
          stroke="hsl(var(--success))"
          strokeWidth={2}
          fillOpacity={1}
          fill="url(#colorCompleted)"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
