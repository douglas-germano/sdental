'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { analyticsApi, appointmentsApi, conversationsApi } from '@/lib/api'
import { AnalyticsOverview, Appointment, Conversation } from '@/types'
import { formatDateTime, getStatusColor, getStatusLabel } from '@/lib/utils'
import {
  Calendar,
  Users,
  MessageSquare,
  TrendingUp,
  Clock,
  AlertCircle
} from 'lucide-react'
import { AppointmentsChart } from '@/components/charts/appointments-chart'
import { StatusPieChart } from '@/components/charts/status-pie-chart'

export default function DashboardPage() {
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null)
  const [upcomingAppointments, setUpcomingAppointments] = useState<Appointment[]>([])
  const [recentConversations, setRecentConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [overviewRes, appointmentsRes, conversationsRes] = await Promise.all([
          analyticsApi.overview(),
          appointmentsApi.upcoming(),
          conversationsApi.list({ per_page: 5, needs_attention: true })
        ])

        setOverview(overviewRes.data)
        setUpcomingAppointments(appointmentsRes.data.appointments || [])
        setRecentConversations(conversationsRes.data.conversations || [])
      } catch (error) {
        console.error('Error fetching dashboard data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Visao geral da sua clinica
        </p>
      </div>

      {/* Metrics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Agendamentos do Mes
            </CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {overview?.appointments.this_month || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {overview?.appointments.completed || 0} concluidos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Proximos Agendamentos
            </CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {overview?.appointments.upcoming || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Nos proximos 7 dias
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total de Pacientes
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {overview?.patients.total || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              +{overview?.patients.new_this_month || 0} novos este mes
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Conversas Ativas
            </CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {overview?.conversations.active || 0}
            </div>
            {(overview?.conversations.needs_attention || 0) > 0 && (
              <p className="text-xs text-orange-500 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {overview?.conversations.needs_attention} precisam de atencao
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts Section */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Visão Geral de Agendamentos</CardTitle>
          </CardHeader>
          <CardContent className="pl-2">
            <AppointmentsChart />
          </CardContent>
        </Card>
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Status dos Agendamentos</CardTitle>
          </CardHeader>
          <CardContent>
            <StatusPieChart overview={overview} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Upcoming Appointments */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Proximos Agendamentos
            </CardTitle>
          </CardHeader>
          <CardContent>
            {upcomingAppointments.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Nenhum agendamento proximo.
              </p>
            ) : (
              <div className="space-y-4">
                {upcomingAppointments.slice(0, 5).map((apt) => (
                  <div
                    key={apt.id}
                    className="flex items-center justify-between border-b pb-2 last:border-0"
                  >
                    <div>
                      <p className="font-medium">{apt.patient?.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {apt.service_name}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm">
                        {formatDateTime(apt.scheduled_datetime)}
                      </p>
                      <Badge className={getStatusColor(apt.status)}>
                        {getStatusLabel(apt.status)}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <Link
              href="/appointments"
              className="block mt-4 text-sm text-primary hover:underline"
            >
              Ver todos os agendamentos
            </Link>
          </CardContent>
        </Card>

        {/* Conversations Needing Attention */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Conversas Aguardando Atencao
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentConversations.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Nenhuma conversa aguardando atencao.
              </p>
            ) : (
              <div className="space-y-4">
                {recentConversations.map((conv) => (
                  <Link
                    key={conv.id}
                    href={`/conversations/${conv.id}`}
                    className="flex items-center justify-between border-b pb-2 last:border-0 hover:bg-gray-50 -mx-2 px-2 py-1 rounded"
                  >
                    <div>
                      <p className="font-medium">
                        {conv.patient?.name || conv.phone_number}
                      </p>
                      <p className="text-sm text-muted-foreground truncate max-w-[200px]">
                        {conv.messages && conv.messages.length > 0
                          ? conv.messages[conv.messages.length - 1].content
                          : 'Sem mensagens'}
                      </p>
                    </div>
                    <Badge className={getStatusColor(conv.status)}>
                      {getStatusLabel(conv.status)}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
            <Link
              href="/conversations"
              className="block mt-4 text-sm text-primary hover:underline"
            >
              Ver todas as conversas
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Quick Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Resumo do Mes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <p className="text-2xl font-bold text-green-600">
                {overview?.appointments.completed || 0}
              </p>
              <p className="text-sm text-green-700">Concluidos</p>
            </div>
            <div className="text-center p-4 bg-red-50 rounded-lg">
              <p className="text-2xl font-bold text-red-600">
                {overview?.appointments.cancelled || 0}
              </p>
              <p className="text-sm text-red-700">Cancelados</p>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <p className="text-2xl font-bold text-gray-600">
                {overview?.appointments.no_shows || 0}
              </p>
              <p className="text-sm text-gray-700">Faltas</p>
            </div>
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <p className="text-2xl font-bold text-blue-600">
                {overview?.patients.new_this_month || 0}
              </p>
              <p className="text-sm text-blue-700">Novos Pacientes</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
