'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { analyticsApi, appointmentsApi, conversationsApi } from '@/lib/api'
import { AnalyticsOverview, Appointment, Conversation } from '@/types'
import { formatDateTime, formatRelativeTime, getStatusColor, getStatusLabel } from '@/lib/utils'
import { CalendarBlank as Calendar, Users, Chat as MessageSquare, TrendUp as TrendingUp, Clock, WarningCircle as AlertCircle, ArrowUpRight, CheckCircle as CheckCircle2, XCircle, UserMinus as UserX, UserPlus, ArrowsClockwise as RefreshCw, CalendarCheck, Plus } from '@phosphor-icons/react'
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
    <div className="space-y-3">
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
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" size="sm" className="text-xs font-medium">
            {currentMonth}
          </Badge>
          <span className="text-xs text-muted-foreground">Este mes</span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
      <div className="space-y-2">
        <div className="grid gap-4 lg:grid-cols-7">
          <Card className="lg:col-span-4">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <div className="h-7 w-7 rounded-lg bg-primary/8 flex items-center justify-center">
                  <TrendingUp className="h-3.5 w-3.5 text-primary" />
                </div>
                Visao Geral de Agendamentos
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 pl-1">
              {loading ? (
                <Skeleton className="h-[95px] w-full rounded-xl" />
              ) : chartsHaveData ? (
                <AppointmentsChart />
              ) : (
                <EmptyState
                  compact
                  icon={TrendingUp}
                  title="Sem dados ainda"
                  description="Os graficos serao exibidos quando houver agendamentos"
                />
              )}
            </CardContent>
          </Card>
          <Card className="lg:col-span-3">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-base">Status dos Agendamentos</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              {loading ? (
                <Skeleton className="h-[95px] w-full rounded-xl" />
              ) : chartsHaveData ? (
                <StatusPieChart overview={overview} />
              ) : (
                <EmptyState
                  compact
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
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            {[
              { icon: CheckCircle2, value: overview?.appointments.completed || 0, label: 'Concluidos', color: 'text-success', bg: 'bg-success/8' },
              { icon: XCircle, value: overview?.appointments.cancelled || 0, label: 'Cancelados', color: 'text-destructive', bg: 'bg-destructive/8' },
              { icon: UserX, value: overview?.appointments.no_shows || 0, label: 'Faltas', color: 'text-muted-foreground', bg: 'bg-muted' },
              { icon: UserPlus, value: overview?.patients.new_this_month || 0, label: 'Novos Pacientes', color: 'text-primary', bg: 'bg-primary/8' },
            ].map((item) => (
              <div
                key={item.label}
                className="flex items-center gap-2 p-2 rounded-xl border border-border/50 bg-card"
              >
                <div className={`w-7 h-7 rounded-lg ${item.bg} flex items-center justify-center shrink-0`}>
                  <item.icon className={`h-3.5 w-3.5 ${item.color}`} />
                </div>
                <div className="min-w-0">
                  <p className={`text-base font-bold tabular-nums ${item.color}`}>{item.value}</p>
                  <p className="text-xs text-muted-foreground truncate">{item.label}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Upcoming Appointments */}
        <Card className="flex flex-col">
          <CardHeader className="p-3 pb-1.5">
            <CardTitle className="flex items-center gap-2.5 text-base">
              <div className="w-7 h-7 rounded-lg bg-primary/8 flex items-center justify-center">
                <Calendar className="h-3.5 w-3.5 text-primary" />
              </div>
              Proximos Agendamentos
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            {loading ? (
              <div className="space-y-1.5">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center justify-between p-2">
                    <div className="flex items-center gap-3">
                      <Skeleton className="w-8 h-8 rounded-full" />
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
                compact
                icon={Calendar}
                title="Nenhum agendamento proximo"
                description="Nao ha agendamentos nos proximos 7 dias"
              />
            ) : (
              <div className="space-y-1">
                {upcomingAppointments.slice(0, 2).map((apt) => (
                  <Link
                    key={apt.id}
                    href="/appointments"
                    className="flex items-center justify-between p-1.5 rounded-xl hover:bg-muted/50 transition-colors duration-150 block"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white font-medium text-sm">
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
              className="flex items-center justify-center gap-1.5 mt-1.5 pt-1.5 border-t border-border/40 text-sm text-primary hover:text-primary/80 transition-colors font-medium"
            >
              Ver todos os agendamentos
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </CardContent>
        </Card>

        {/* Conversations Needing Attention */}
        <Card className="flex flex-col">
          <CardHeader className="p-3 pb-1.5">
            <CardTitle className="flex items-center gap-2.5 text-base">
              <div className="w-7 h-7 rounded-lg bg-warning/8 flex items-center justify-center">
                <MessageSquare className="h-3.5 w-3.5 text-warning" />
              </div>
              Conversas Aguardando Atencao
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            {loading ? (
              <div className="space-y-1.5">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center justify-between p-2">
                    <div className="flex items-center gap-3">
                      <Skeleton className="w-8 h-8 rounded-full" />
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
                compact
                icon={MessageSquare}
                title="Nenhuma conversa aguardando atencao"
                description="Todas as conversas estao em dia"
              />
            ) : (
              <div className="space-y-1">
                {recentConversations.slice(0, 2).map((conv) => (
                  <Link
                    key={conv.id}
                    href={`/conversations/${conv.id}`}
                    className="flex items-center justify-between p-1.5 rounded-xl hover:bg-muted/50 transition-colors duration-150 block"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white font-medium text-sm">
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
              className="flex items-center justify-center gap-1.5 mt-1.5 pt-1.5 border-t border-border/40 text-sm text-primary hover:text-primary/80 transition-colors font-medium"
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
