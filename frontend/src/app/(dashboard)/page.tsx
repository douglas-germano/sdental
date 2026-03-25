'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
  UserPlus
} from 'lucide-react'
import { AppointmentsChart } from '@/components/charts/appointments-chart'
import { StatusPieChart } from '@/components/charts/status-pie-chart'
import { StatsCard } from '@/components/dashboard/stats-card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'

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

  return (
    <div className="space-y-8 animate-fade-in">
      <PageHeader title="Dashboard" description="Visao geral da sua clinica" />

      {/* Metrics Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
      <div className="grid gap-6 lg:grid-cols-7">
        <Card className="lg:col-span-4 animate-fade-in-up" style={{ animationDelay: '200ms' }}>
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
              <Skeleton className="h-[300px] w-full rounded-xl" />
            ) : (
              <StatusPieChart overview={overview} />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Upcoming Appointments */}
        <Card className="animate-fade-in-up" style={{ animationDelay: '300ms' }}>
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
                {upcomingAppointments.slice(0, 5).map((apt, index) => (
                  <div
                    key={apt.id}
                    className="flex items-center justify-between p-3 rounded-xl hover:bg-muted/50 transition-colors duration-150 cursor-pointer animate-fade-in-up"
                    style={{ animationDelay: `${index * 50}ms` }}
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
                  </div>
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
        <Card className="animate-fade-in-up" style={{ animationDelay: '350ms' }}>
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
                {recentConversations.map((conv, index) => (
                  <Link
                    key={conv.id}
                    href={`/conversations/${conv.id}`}
                    className="flex items-center justify-between p-3 rounded-xl hover:bg-muted/50 transition-colors duration-150 block animate-fade-in-up"
                    style={{ animationDelay: `${index * 50}ms` }}
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
                    <Badge className={getStatusColor(conv.status)} variant="secondary" size="sm">
                      {getStatusLabel(conv.status)}
                    </Badge>
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

      {/* Monthly Summary */}
      <Card className="animate-fade-in-up" style={{ animationDelay: '400ms' }}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/8 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-primary" />
            </div>
            Resumo do Mes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {loading ? (
              [1, 2, 3, 4].map(i => <Skeleton key={i} className="h-[120px] rounded-xl" />)
            ) : (
              <>
                {[
                  { icon: CheckCircle2, value: overview?.appointments.completed || 0, label: 'Concluidos', color: 'success' as const },
                  { icon: XCircle, value: overview?.appointments.cancelled || 0, label: 'Cancelados', color: 'destructive' as const },
                  { icon: UserX, value: overview?.appointments.no_shows || 0, label: 'Faltas', color: 'muted' as const },
                  { icon: UserPlus, value: overview?.patients.new_this_month || 0, label: 'Novos Pacientes', color: 'primary' as const },
                ].map((item, i) => {
                  const colorMap = {
                    success: { bg: 'bg-success/[0.06]', border: 'border-success/15', iconBg: 'bg-success/[0.12]', iconText: 'text-success', valueText: 'text-success', hover: 'hover:bg-success/[0.1]' },
                    destructive: { bg: 'bg-destructive/[0.06]', border: 'border-destructive/15', iconBg: 'bg-destructive/[0.12]', iconText: 'text-destructive', valueText: 'text-destructive', hover: 'hover:bg-destructive/[0.1]' },
                    muted: { bg: 'bg-muted/60', border: 'border-border/50', iconBg: 'bg-muted', iconText: 'text-muted-foreground', valueText: 'text-foreground', hover: 'hover:bg-muted/80' },
                    primary: { bg: 'bg-primary/[0.06]', border: 'border-primary/15', iconBg: 'bg-primary/[0.12]', iconText: 'text-primary', valueText: 'text-primary', hover: 'hover:bg-primary/[0.1]' },
                  }
                  const c = colorMap[item.color]
                  return (
                    <div
                      key={item.label}
                      className={`text-center p-5 ${c.bg} border ${c.border} rounded-xl ${c.hover} transition-all duration-200 animate-fade-in-up`}
                      style={{ animationDelay: `${450 + i * 50}ms` }}
                    >
                      <div className={`w-10 h-10 rounded-xl ${c.iconBg} flex items-center justify-center mx-auto mb-3`}>
                        <item.icon className={`h-5 w-5 ${c.iconText}`} />
                      </div>
                      <p className={`text-2xl font-bold ${c.valueText} tabular-nums`}>
                        {item.value}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1 font-medium">{item.label}</p>
                    </div>
                  )
                })}
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
