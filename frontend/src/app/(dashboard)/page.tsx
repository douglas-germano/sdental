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
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  XCircle,
  UserX,
  UserPlus
} from 'lucide-react'
import { AppointmentsChart } from '@/components/charts/appointments-chart'
import { StatusPieChart } from '@/components/charts/status-pie-chart'
import { StatsCard } from '@/components/dashboard/stats-card'
import { Skeleton } from '@/components/ui/skeleton'

export default function DashboardPage() {
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null)
  const [upcomingAppointments, setUpcomingAppointments] = useState<Appointment[]>([])
  const [recentConversations, setRecentConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Set loading is already true initially, we keep it true while fetching
        // We can add a minimum delay to prevent flickering if needed, but skeletons handle this well
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="animate-fade-in">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Visao geral da sua clinica
        </p>
      </div>

      {/* Metrics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Agendamentos do Mes"
          value={overview?.appointments.this_month || 0}
          icon={Calendar}
          variant="primary"
          loading={loading}
          delay={0}
          description={
            <span className="flex items-center text-success">
              <ArrowUpRight className="h-3 w-3 mr-1" />
              {overview?.appointments.completed || 0} concluidos
            </span>
          }
        />

        <StatsCard
          title="Proximos Agendamentos"
          value={overview?.appointments.upcoming || 0}
          icon={Clock}
          variant="accent"
          loading={loading}
          delay={50}
          description="Nos proximos 7 dias"
        />

        <StatsCard
          title="Total de Pacientes"
          value={overview?.patients.total || 0}
          icon={Users}
          variant="success"
          loading={loading}
          delay={100}
          description={
            <span className="flex items-center text-success">
              <ArrowUpRight className="h-3 w-3 mr-1" />
              +{overview?.patients.new_this_month || 0} novos este mes
            </span>
          }
        />

        <StatsCard
          title="Conversas Ativas"
          value={overview?.conversations.active || 0}
          icon={MessageSquare}
          variant="warning"
          loading={loading}
          delay={150}
          description={
            (overview?.conversations.needs_attention || 0) > 0 ? (
              <span className="flex items-center text-warning">
                <AlertCircle className="h-3 w-3 mr-1" />
                {overview?.conversations.needs_attention} precisam de atencao
              </span>
            ) : (
              <span>Todas em dia</span>
            )
          }
        />
      </div>

      {/* Charts Section */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
        <Card className="lg:col-span-4 animate-fade-in-up" style={{ animationDelay: '200ms' }}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Visao Geral de Agendamentos
            </CardTitle>
          </CardHeader>
          <CardContent className="pl-2">
            {loading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : (
              <AppointmentsChart />
            )}
          </CardContent>
        </Card>
        <Card className="lg:col-span-3 animate-fade-in-up" style={{ animationDelay: '250ms' }}>
          <CardHeader>
            <CardTitle>Status dos Agendamentos</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : (
              <StatusPieChart overview={overview} />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Upcoming Appointments */}
        <Card className="animate-fade-in-up" style={{ animationDelay: '300ms' }}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Calendar className="h-4 w-4 text-primary" />
              </div>
              Proximos Agendamentos
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center justify-between p-3">
                    <div className="flex items-center gap-3">
                      <Skeleton className="w-10 h-10 rounded-full" />
                      <div className="space-y-1">
                        <Skeleton className="h-4 w-[120px]" />
                        <Skeleton className="h-3 w-[80px]" />
                      </div>
                    </div>
                    <Skeleton className="h-5 w-[60px]" />
                  </div>
                ))}
              </div>
            ) : upcomingAppointments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Calendar className="h-12 w-12 mb-3 opacity-50" />
                <p className="text-sm">Nenhum agendamento proximo</p>
              </div>
            ) : (
              <div className="space-y-3">
                {upcomingAppointments.slice(0, 5).map((apt, index) => (
                  <div
                    key={apt.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-muted/50 hover:bg-muted transition-colors animate-fade-in"
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center text-white font-medium text-sm">
                        {apt.patient?.name?.charAt(0).toUpperCase() || '?'}
                      </div>
                      <div>
                        <p className="font-medium text-sm">{apt.patient?.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {apt.service_name}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground mb-1">
                        {formatDateTime(apt.scheduled_datetime)}
                      </p>
                      <Badge className={getStatusColor(apt.status)} variant="secondary">
                        {getStatusLabel(apt.status)}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <Link
              href="/appointments"
              className="flex items-center justify-center gap-1 mt-4 text-sm text-primary hover:text-primary/80 transition-colors font-medium"
            >
              Ver todos os agendamentos
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </CardContent>
        </Card>

        {/* Conversations Needing Attention */}
        <Card className="animate-fade-in-up" style={{ animationDelay: '350ms' }}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <div className="w-8 h-8 rounded-lg bg-warning/10 flex items-center justify-center">
                <MessageSquare className="h-4 w-4 text-warning" />
              </div>
              Conversas Aguardando Atencao
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center justify-between p-3">
                    <div className="flex items-center gap-3">
                      <Skeleton className="w-10 h-10 rounded-full" />
                      <div className="space-y-1">
                        <Skeleton className="h-4 w-[120px]" />
                        <Skeleton className="h-3 w-[150px]" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : recentConversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <MessageSquare className="h-12 w-12 mb-3 opacity-50" />
                <p className="text-sm">Nenhuma conversa aguardando atencao</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentConversations.map((conv, index) => (
                  <Link
                    key={conv.id}
                    href={`/conversations/${conv.id}`}
                    className="flex items-center justify-between p-3 rounded-xl bg-muted/50 hover:bg-muted transition-colors block animate-fade-in"
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center text-white font-medium text-sm">
                        {conv.patient?.name?.charAt(0).toUpperCase() || conv.phone_number?.charAt(0) || '?'}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm">
                          {conv.patient?.name || conv.phone_number}
                        </p>
                        <p className="text-xs text-muted-foreground truncate max-w-[180px]">
                          {conv.messages && conv.messages.length > 0
                            ? conv.messages[conv.messages.length - 1].content
                            : 'Sem mensagens'}
                        </p>
                      </div>
                    </div>
                    <Badge className={getStatusColor(conv.status)} variant="secondary">
                      {getStatusLabel(conv.status)}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
            <Link
              href="/conversations"
              className="flex items-center justify-center gap-1 mt-4 text-sm text-primary hover:text-primary/80 transition-colors font-medium"
            >
              Ver todas as conversas
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Quick Stats - Resumo do Mes */}
      <Card className="animate-fade-in-up" style={{ animationDelay: '400ms' }}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-primary" />
            </div>
            Resumo do Mes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Using a mini-abstraction map here for consistency if desired, or verbose cards */}
            {loading ? (
              [1, 2, 3, 4].map(i => <Skeleton key={i} className="h-[120px] rounded-xl" />)
            ) : (
              <>
                <div className="text-center p-5 bg-success/5 border border-success/20 rounded-xl hover:bg-success/10 transition-colors">
                  <div className="w-10 h-10 rounded-full bg-success/20 flex items-center justify-center mx-auto mb-3">
                    <CheckCircle2 className="h-5 w-5 text-success" />
                  </div>
                  <p className="text-2xl font-bold text-success">
                    {overview?.appointments.completed || 0}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Concluidos</p>
                </div>
                <div className="text-center p-5 bg-destructive/5 border border-destructive/20 rounded-xl hover:bg-destructive/10 transition-colors">
                  <div className="w-10 h-10 rounded-full bg-destructive/20 flex items-center justify-center mx-auto mb-3">
                    <XCircle className="h-5 w-5 text-destructive" />
                  </div>
                  <p className="text-2xl font-bold text-destructive">
                    {overview?.appointments.cancelled || 0}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Cancelados</p>
                </div>
                <div className="text-center p-5 bg-muted border border-border rounded-xl hover:bg-muted/80 transition-colors">
                  <div className="w-10 h-10 rounded-full bg-muted-foreground/20 flex items-center justify-center mx-auto mb-3">
                    <UserX className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <p className="text-2xl font-bold">
                    {overview?.appointments.no_shows || 0}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Faltas</p>
                </div>
                <div className="text-center p-5 bg-primary/5 border border-primary/20 rounded-xl hover:bg-primary/10 transition-colors">
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-3">
                    <UserPlus className="h-5 w-5 text-primary" />
                  </div>
                  <p className="text-2xl font-bold text-primary">
                    {overview?.patients.new_this_month || 0}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Novos Pacientes</p>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
