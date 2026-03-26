'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { analyticsApi, appointmentsApi, conversationsApi } from '@/lib/api'
import { AnalyticsOverview, Appointment, Conversation } from '@/types'
import { formatDateTime, formatRelativeTime, getStatusColor, getStatusLabel } from '@/lib/utils'
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
  UserPlus,
  RefreshCw,
  CalendarCheck,
  Plus
} from 'lucide-react'
import { AppointmentsChart } from '@/components/charts/appointments-chart'
import { StatusPieChart } from '@/components/charts/status-pie-chart'
import { StatsCard } from '@/components/dashboard/stats-card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { useAuth } from '@/app/providers'

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour >= 5 && hour < 12) return 'Bom dia'
  if (hour >= 12 && hour < 18) return 'Boa tarde'
  return 'Boa noite'
}

function getFormattedDate(): string {
  const now = new Date()
  const weekdays = ['Domingo', 'Segunda-feira', 'Terca-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sabado']
  const months = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
  return `${weekdays[now.getDay()]}, ${now.getDate()} de ${months[now.getMonth()]}`
}

function getCurrentMonthName(): string {
  const months = ['Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
  return months[new Date().getMonth()]
}

function isToday(dateString: string): boolean {
  const date = new Date(dateString)
  const today = new Date()
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  )
}

export default function DashboardPage() {
  const { clinic } = useAuth()
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null)
  const [upcomingAppointments, setUpcomingAppointments] = useState<Appointment[]>([])
  const [recentConversations, setRecentConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchData = useCallback(async () => {
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
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleRefresh = () => {
    setRefreshing(true)
    fetchData()
  }

  const todayAppointmentsCount = useMemo(() => {
    return upcomingAppointments.filter(apt => isToday(apt.scheduled_datetime)).length
  }, [upcomingAppointments])

  const chartsHaveData = useMemo(() => {
    if (!overview) return false
    const { appointments } = overview
    return (appointments.completed + appointments.cancelled + appointments.no_shows + appointments.upcoming) > 0
  }, [overview])

  const greeting = getGreeting()
  const clinicName = clinic?.name || ''
  const formattedDate = getFormattedDate()
  const currentMonth = getCurrentMonthName()

  return (
    <div className="space-y-8">
      {/* Personalized Header with Quick Actions */}
      <PageHeader
        title={`${greeting}${clinicName ? `, ${clinicName}` : ''}`}
        description={formattedDate}
      >
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
        <Link href="/appointments">
          <Button variant="outline" size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Novo Agendamento
          </Button>
        </Link>
        <Link href="/patients">
          <Button variant="outline" size="sm">
            <UserPlus className="h-4 w-4 mr-2" />
            Novo Paciente
          </Button>
        </Link>
      </PageHeader>

      {/* Period Indicator + Metrics Cards */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" size="sm" className="text-xs font-medium">
            {currentMonth}
          </Badge>
          <span className="text-xs text-muted-foreground">Este mes</span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
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
            title="Agendamentos Hoje"
            value={todayAppointmentsCount}
            icon={CalendarCheck}
            variant="accent"
            loading={loading}
            delay={50}
            description="Para hoje"
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

          <StatsCard
            title="Proximos 7 dias"
            value={overview?.appointments.upcoming || 0}
            icon={Clock}
            variant="default"
            loading={loading}
            delay={200}
            description="Agendamentos futuros"
          />
        </div>
      </div>

      {/* Charts Section with Monthly Summary Row */}
      <div className="space-y-4">
        <div className="grid gap-6 lg:grid-cols-7">
          <Card className="lg:col-span-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-primary/8 flex items-center justify-center">
                  <TrendingUp className="h-4 w-4 text-primary" />
                </div>
                Visao Geral de Agendamentos
              </CardTitle>
            </CardHeader>
            <CardContent className="pl-2">
              {loading ? (
                <Skeleton className="h-[300px] w-full rounded-xl" />
              ) : chartsHaveData ? (
                <AppointmentsChart />
              ) : (
                <EmptyState
                  icon={TrendingUp}
                  title="Sem dados ainda"
                  description="Os graficos serao exibidos quando houver agendamentos"
                />
              )}
            </CardContent>
          </Card>
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>Status dos Agendamentos</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-[300px] w-full rounded-xl" />
              ) : chartsHaveData ? (
                <StatusPieChart overview={overview} />
              ) : (
                <EmptyState
                  icon={Calendar}
                  title="Sem dados ainda"
                  description="O grafico de status sera exibido quando houver agendamentos"
                />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Compact Monthly Summary Row (replaces the old full-width card) */}
        {!loading && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { icon: CheckCircle2, value: overview?.appointments.completed || 0, label: 'Concluidos', color: 'text-success', bg: 'bg-success/8' },
              { icon: XCircle, value: overview?.appointments.cancelled || 0, label: 'Cancelados', color: 'text-destructive', bg: 'bg-destructive/8' },
              { icon: UserX, value: overview?.appointments.no_shows || 0, label: 'Faltas', color: 'text-muted-foreground', bg: 'bg-muted' },
              { icon: UserPlus, value: overview?.patients.new_this_month || 0, label: 'Novos Pacientes', color: 'text-primary', bg: 'bg-primary/8' },
            ].map((item) => (
              <div
                key={item.label}
                className="flex items-center gap-3 p-3 rounded-xl border border-border/50 bg-card"
              >
                <div className={`w-8 h-8 rounded-lg ${item.bg} flex items-center justify-center shrink-0`}>
                  <item.icon className={`h-4 w-4 ${item.color}`} />
                </div>
                <div className="min-w-0">
                  <p className={`text-lg font-bold tabular-nums ${item.color}`}>{item.value}</p>
                  <p className="text-xs text-muted-foreground truncate">{item.label}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Upcoming Appointments */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-primary/8 flex items-center justify-center">
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
                      <div className="space-y-1.5">
                        <Skeleton className="h-4 w-[120px]" />
                        <Skeleton className="h-3 w-[80px]" />
                      </div>
                    </div>
                    <Skeleton className="h-5 w-[60px]" />
                  </div>
                ))}
              </div>
            ) : upcomingAppointments.length === 0 ? (
              <EmptyState
                icon={Calendar}
                title="Nenhum agendamento proximo"
                description="Nao ha agendamentos nos proximos 7 dias"
              />
            ) : (
              <div className="space-y-2">
                {upcomingAppointments.slice(0, 5).map((apt) => (
                  <Link
                    key={apt.id}
                    href="/appointments"
                    className="flex items-center justify-between p-3 rounded-xl hover:bg-muted/50 transition-colors duration-150 block"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center text-white font-medium text-sm">
                        {apt.patient?.name?.charAt(0).toUpperCase() || '?'}
                      </div>
                      <div>
                        <p className="font-medium text-sm text-foreground">{apt.patient?.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {apt.service_name}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <p className="text-xs text-muted-foreground mb-1 cursor-help">
                            {formatRelativeTime(apt.scheduled_datetime)}
                          </p>
                        </TooltipTrigger>
                        <TooltipContent>
                          {formatDateTime(apt.scheduled_datetime)}
                        </TooltipContent>
                      </Tooltip>
                      <Badge className={getStatusColor(apt.status)} variant="secondary" size="sm">
                        {getStatusLabel(apt.status)}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}
            <Link
              href="/appointments"
              className="flex items-center justify-center gap-1.5 mt-5 pt-4 border-t border-border/40 text-sm text-primary hover:text-primary/80 transition-colors font-medium"
            >
              Ver todos os agendamentos
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </CardContent>
        </Card>

        {/* Conversations Needing Attention */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-warning/8 flex items-center justify-center">
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
                      <div className="space-y-1.5">
                        <Skeleton className="h-4 w-[120px]" />
                        <Skeleton className="h-3 w-[150px]" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : recentConversations.length === 0 ? (
              <EmptyState
                icon={MessageSquare}
                title="Nenhuma conversa aguardando atencao"
                description="Todas as conversas estao em dia"
              />
            ) : (
              <div className="space-y-2">
                {recentConversations.map((conv) => (
                  <Link
                    key={conv.id}
                    href={`/conversations/${conv.id}`}
                    className="flex items-center justify-between p-3 rounded-xl hover:bg-muted/50 transition-colors duration-150 block"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center text-white font-medium text-sm">
                        {conv.patient?.name?.charAt(0).toUpperCase() || conv.phone_number?.charAt(0) || '?'}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm text-foreground">
                          {conv.patient?.name || conv.phone_number}
                        </p>
                        <p className="text-xs text-muted-foreground truncate max-w-[180px]">
                          {conv.messages && conv.messages.length > 0
                            ? conv.messages[conv.messages.length - 1].content
                            : 'Sem mensagens'}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatRelativeTime(conv.last_message_at)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
            <Link
              href="/conversations"
              className="flex items-center justify-center gap-1.5 mt-5 pt-4 border-t border-border/40 text-sm text-primary hover:text-primary/80 transition-colors font-medium"
            >
              Ver todas as conversas
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
