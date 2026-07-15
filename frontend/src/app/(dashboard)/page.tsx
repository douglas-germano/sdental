'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { analyticsApi, appointmentsApi, conversationsApi, financialApi } from '@/lib/api'
import { AnalyticsOverview, Appointment, Conversation, FinancialSummary } from '@/types'
import { cn, formatDateTime, formatRelativeTime, getStatusColor, getStatusLabel } from '@/lib/utils'
import {
  CalendarBlank as Calendar, Users, Chat as MessageSquare, TrendUp as TrendingUp,
  WarningCircle as AlertCircle, ArrowUpRight, UserPlus, ArrowsClockwise as RefreshCw,
  CalendarCheck, Plus, Robot as Bot, CheckCircle as CheckCircle2, WifiHigh, WifiSlash,
  CurrencyDollar,
} from '@phosphor-icons/react'
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
  return new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
}

function getCurrentMonthName(): string {
  const month = new Date().toLocaleDateString('pt-BR', { month: 'long' })
  return month.charAt(0).toUpperCase() + month.slice(1)
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

const formatBRL = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value)

/** Section label: "HOJE · quarta-feira, 15 de julho" */
function SectionKicker({ label, detail }: { label: string; detail?: string }) {
  return (
    <p className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-muted-foreground">
      {label}
      {detail && <span className="font-medium normal-case tracking-normal text-muted-foreground/80"> · {detail}</span>}
    </p>
  )
}

export default function DashboardPage() {
  const { clinic } = useAuth()
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null)
  const [upcomingAppointments, setUpcomingAppointments] = useState<Appointment[]>([])
  const [attentionConversations, setAttentionConversations] = useState<Conversation[]>([])
  const [financialSummary, setFinancialSummary] = useState<FinancialSummary | null>(null)
  const [whatsappState, setWhatsappState] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchData = useCallback(async () => {
    // allSettled: one failing widget must not blank the whole home page
    const [overviewRes, appointmentsRes, conversationsRes, financialRes] = await Promise.allSettled([
      analyticsApi.overview(),
      appointmentsApi.upcoming(),
      conversationsApi.list({ per_page: 5, needs_attention: true }),
      financialApi.getSummary(30),
    ])

    if (overviewRes.status === 'fulfilled') setOverview(overviewRes.value.data)
    if (appointmentsRes.status === 'fulfilled') setUpcomingAppointments(appointmentsRes.value.data.appointments || [])
    if (conversationsRes.status === 'fulfilled') {
      setAttentionConversations(conversationsRes.value.data.conversations || [])
      setWhatsappState(conversationsRes.value.data.whatsapp_connection_state ?? null)
    }
    if (financialRes.status === 'fulfilled') setFinancialSummary(financialRes.value.data)

    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleRefresh = () => {
    setRefreshing(true)
    fetchData()
  }

  const todayAppointments = useMemo(
    () =>
      upcomingAppointments
        .filter((apt) => isToday(apt.scheduled_datetime))
        .sort((a, b) => a.scheduled_datetime.localeCompare(b.scheduled_datetime)),
    [upcomingAppointments]
  )

  const nextToday = useMemo(() => {
    const now = new Date()
    return todayAppointments.find((apt) => new Date(apt.scheduled_datetime) >= now) || null
  }, [todayAppointments])

  const needsAttentionCount = overview?.conversations.needs_attention || 0

  const chartsHaveData = useMemo(() => {
    if (!overview) return false
    const { appointments } = overview
    return (appointments.completed + appointments.cancelled + appointments.no_shows + appointments.upcoming) > 0
  }, [overview])

  const whatsappDown = whatsappState === 'close'

  return (
    <div className="space-y-7">
      {/* Header */}
      <PageHeader
        title={`${getGreeting()}${clinic?.name ? `, ${clinic.name}` : ''}`}
        description={getFormattedDate()}
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

      {/* ─── HOJE: o que precisa da sua atenção agora ─────────────────── */}
      <section className="space-y-3">
        <SectionKicker label="Hoje" detail="o que precisa da sua atenção agora" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Consultas de hoje */}
          <Card hover className="relative">
            <Link href="/calendar" className="absolute inset-0" aria-label="Abrir calendário" />
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Consultas hoje</p>
                  {loading ? (
                    <Skeleton className="h-9 w-14 mt-1.5" />
                  ) : (
                    <p className="text-3xl font-extrabold tabular-nums mt-1">{todayAppointments.length}</p>
                  )}
                </div>
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <CalendarCheck className="h-5 w-5 text-primary" />
                </div>
              </div>
              <p className="text-sm text-muted-foreground mt-2 truncate">
                {loading ? ' ' : nextToday
                  ? `Próxima: ${new Date(nextToday.scheduled_datetime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} — ${nextToday.patient?.name || 'paciente'}`
                  : todayAppointments.length > 0
                    ? 'Todas as consultas de hoje já ocorreram'
                    : 'Agenda livre por enquanto'}
              </p>
            </CardContent>
          </Card>

          {/* Fila de atenção humana */}
          <Card
            hover
            className={cn('relative', needsAttentionCount > 0 && 'border-warning/40 bg-warning/[0.03]')}
          >
            <Link href="/conversations" className="absolute inset-0" aria-label="Abrir conversas" />
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Aguardando você</p>
                  {loading ? (
                    <Skeleton className="h-9 w-14 mt-1.5" />
                  ) : (
                    <p className={cn(
                      'text-3xl font-extrabold tabular-nums mt-1',
                      needsAttentionCount > 0 && 'text-warning'
                    )}>
                      {needsAttentionCount}
                    </p>
                  )}
                </div>
                <div className={cn(
                  'h-10 w-10 rounded-lg flex items-center justify-center shrink-0',
                  needsAttentionCount > 0 ? 'bg-warning/12' : 'bg-success/10'
                )}>
                  {needsAttentionCount > 0
                    ? <AlertCircle className="h-5 w-5 text-warning" />
                    : <CheckCircle2 className="h-5 w-5 text-success" />}
                </div>
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                {loading ? ' ' : needsAttentionCount > 0
                  ? 'Conversas transferidas para atendimento humano'
                  : 'Nenhuma conversa esperando resposta sua'}
              </p>
            </CardContent>
          </Card>

          {/* Saúde do assistente WhatsApp */}
          <Card
            hover
            className={cn('relative', whatsappDown && 'border-destructive/40 bg-destructive/[0.03]')}
          >
            <Link href={whatsappDown ? '/settings' : '/agents'} className="absolute inset-0" aria-label="Status do assistente" />
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Assistente WhatsApp</p>
                  {loading ? (
                    <Skeleton className="h-9 w-32 mt-1.5" />
                  ) : (
                    <p className={cn(
                      'text-xl font-extrabold mt-1.5 flex items-center gap-2',
                      whatsappDown ? 'text-destructive' : whatsappState === 'open' ? 'text-success' : 'text-foreground'
                    )}>
                      <span className={cn(
                        'h-2.5 w-2.5 rounded-full',
                        whatsappDown ? 'bg-destructive' : whatsappState === 'open' ? 'bg-success' : 'bg-muted-foreground/50'
                      )} />
                      {whatsappDown ? 'Desconectado' : whatsappState === 'open' ? 'Conectado' : 'Status desconhecido'}
                    </p>
                  )}
                </div>
                <div className={cn(
                  'h-10 w-10 rounded-lg flex items-center justify-center shrink-0',
                  whatsappDown ? 'bg-destructive/10' : 'bg-primary/10'
                )}>
                  {whatsappDown
                    ? <WifiSlash className="h-5 w-5 text-destructive" />
                    : <WifiHigh className="h-5 w-5 text-primary" />}
                </div>
              </div>
              <p className="text-sm text-muted-foreground mt-2 flex items-center gap-1.5">
                {loading ? ' ' : whatsappDown ? (
                  <span className="text-destructive font-medium">Reconectar em Configurações →</span>
                ) : (
                  <>
                    <Bot className="h-3.5 w-3.5" />
                    IA {clinic?.agent_enabled === false ? 'pausada' : 'ativa'} respondendo pacientes
                  </>
                )}
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ─── ESTE MÊS: desempenho ─────────────────────────────────────── */}
      <section className="space-y-3">
        <SectionKicker label="Este mês" detail={getCurrentMonthName()} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatsCard
            title="Agendamentos"
            value={overview?.appointments.this_month || 0}
            icon={Calendar}
            variant="primary"
            loading={loading}
            description={
              <span className="flex items-center text-success">
                <ArrowUpRight className="h-3 w-3 mr-1" />
                {overview?.appointments.completed || 0} concluídos
              </span>
            }
          />
          <StatsCard
            title="Novos pacientes"
            value={overview?.patients.new_this_month || 0}
            icon={UserPlus}
            variant="success"
            loading={loading}
            description={`${overview?.patients.total || 0} pacientes no total`}
          />
          <StatsCard
            title="Receita realizada"
            value={financialSummary ? formatBRL(financialSummary.realized_revenue) : '—'}
            icon={CurrencyDollar}
            variant="accent"
            loading={loading}
            description="Últimos 30 dias · ver Financeiro"
          />
          <StatsCard
            title="Conversas ativas"
            value={overview?.conversations.active || 0}
            icon={MessageSquare}
            variant="default"
            loading={loading}
            description={`${overview?.appointments.upcoming || 0} consultas nos próximos 7 dias`}
          />
        </div>
      </section>

      {/* ─── Gráficos ─────────────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-primary/8 flex items-center justify-center shrink-0">
                <TrendingUp className="h-4 w-4 text-primary" />
              </div>
              Agendamentos — últimos 30 dias
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            {loading ? (
              <Skeleton className="h-[200px] w-full rounded-xl" />
            ) : chartsHaveData ? (
              <AppointmentsChart height={200} />
            ) : (
              <EmptyState
                compact
                icon={TrendingUp}
                title="Sem dados ainda"
                description="Os gráficos aparecem com os primeiros agendamentos"
              />
            )}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle>Status do mês</CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            {loading ? (
              <Skeleton className="h-[200px] w-full rounded-xl" />
            ) : chartsHaveData ? (
              <StatusPieChart overview={overview} height={200} />
            ) : (
              <EmptyState
                compact
                icon={Calendar}
                title="Sem dados ainda"
                description="O gráfico de status aparece com os primeiros agendamentos"
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── Listas: próximos + fila de atenção ───────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Próximos agendamentos */}
        <Card className="flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/8 flex items-center justify-center shrink-0">
                <Calendar className="h-4 w-4 text-primary" />
              </div>
              Próximos agendamentos
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 flex-1 flex flex-col">
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
                compact
                icon={Calendar}
                title="Nenhum agendamento próximo"
                description="Não há agendamentos para hoje e amanhã"
              />
            ) : (
              <div className="space-y-1 flex-1">
                {upcomingAppointments.slice(0, 5).map((apt) => (
                  <Link
                    key={apt.id}
                    href="/appointments"
                    className="flex items-center justify-between p-2 rounded-xl hover:bg-muted/50 transition-colors duration-150"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white font-medium text-sm shrink-0">
                        {apt.patient?.name?.charAt(0).toUpperCase() || '?'}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm text-foreground truncate">{apt.patient?.name}</p>
                        <p className="text-sm text-muted-foreground truncate">{apt.service_name}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <p className="text-xs text-muted-foreground mb-1.5 cursor-help">
                            {formatRelativeTime(apt.scheduled_datetime)}
                          </p>
                        </TooltipTrigger>
                        <TooltipContent>{formatDateTime(apt.scheduled_datetime)}</TooltipContent>
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
              className="flex items-center justify-center gap-1.5 mt-2 pt-2 border-t border-border/40 text-sm text-primary hover:text-primary/80 transition-colors font-medium"
            >
              Ver todos os agendamentos
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </CardContent>
        </Card>

        {/* Conversas aguardando atenção */}
        <Card className="flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-warning/8 flex items-center justify-center shrink-0">
                <MessageSquare className="h-4 w-4 text-warning" />
              </div>
              Aguardando atenção humana
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 flex-1 flex flex-col">
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
            ) : attentionConversations.length === 0 ? (
              <EmptyState
                compact
                icon={CheckCircle2}
                title="Tudo em dia"
                description="Nenhuma conversa esperando resposta humana"
              />
            ) : (
              <div className="space-y-1 flex-1">
                {attentionConversations.slice(0, 5).map((conv) => (
                  <Link
                    key={conv.id}
                    href={`/conversations/${conv.id}`}
                    className="flex items-center justify-between p-2 rounded-xl hover:bg-muted/50 transition-colors duration-150"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={cn(
                        'w-10 h-10 rounded-full flex items-center justify-center text-white font-medium text-sm shrink-0',
                        conv.urgent ? 'bg-destructive' : 'bg-warning'
                      )}>
                        {conv.patient?.name?.charAt(0).toUpperCase() || conv.phone_number?.slice(-2) || '?'}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm text-foreground truncate flex items-center gap-1.5">
                          {conv.patient?.name || conv.phone_number}
                          {conv.urgent && <Badge variant="destructive" size="sm" dot>Urgente</Badge>}
                        </p>
                        <p className="text-sm text-muted-foreground truncate max-w-[220px]">
                          {conv.messages && conv.messages.length > 0
                            ? conv.messages[conv.messages.length - 1].content
                            : 'Sem mensagens'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0 flex flex-col items-end gap-1">
                      <span className="text-xs text-muted-foreground">
                        {formatRelativeTime(conv.last_message_at)}
                      </span>
                      {(conv.unread_count || 0) > 0 && (
                        <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10.5px] font-bold flex items-center justify-center">
                          {conv.unread_count}
                        </span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )}
            <Link
              href="/conversations"
              className="flex items-center justify-center gap-1.5 mt-2 pt-2 border-t border-border/40 text-sm text-primary hover:text-primary/80 transition-colors font-medium"
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
