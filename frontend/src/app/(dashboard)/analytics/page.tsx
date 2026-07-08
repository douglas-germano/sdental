'use client'

import { useCallback, useEffect, useState } from 'react'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { MarkdownContent } from '@/components/assistant/markdown-content'
import { analyticsApi } from '@/lib/api'
import { formatDateTime } from '@/lib/utils'
import { AgentAction, AgentActionType, AgentActionStatus } from '@/types'
import {
  Robot as Bot,
  ChatCircleText,
  PaperPlaneTilt as Send,
  ClockCounterClockwise,
} from '@phosphor-icons/react'

const ACTION_TYPE_LABEL: Record<AgentActionType, string> = {
  noshow_recovery: 'Recuperação de falta',
  cancellation_recovery: 'Recuperação de cancelamento',
  waitlist_offer: 'Oferta de lista de espera',
  recall: 'Recall de inativo',
  handoff_summary: 'Resumo para atendente',
  funnel_qualification: 'Qualificação de funil',
  weekly_report: 'Relatório semanal',
  proactive_message: 'Mensagem proativa',
}

const STATUS_LABEL: Record<AgentActionStatus, string> = {
  sent: 'Enviado',
  skipped: 'Ignorado',
  failed: 'Falhou',
}

const STATUS_VARIANT: Record<AgentActionStatus, 'success' | 'secondary' | 'destructive'> = {
  sent: 'success',
  skipped: 'secondary',
  failed: 'destructive',
}

const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp',
  internal: 'Interno',
  email: 'E-mail',
}

const ASK_PERIOD_OPTIONS = [
  { label: '30 dias', value: 30 },
  { label: '90 dias', value: 90 },
  { label: '180 dias', value: 180 },
]

function AgentActionsTab() {
  const [actions, setActions] = useState<AgentAction[]>([])
  const [summary, setSummary] = useState<Partial<Record<AgentActionType, number>>>({})
  const [type, setType] = useState('')
  const [loading, setLoading] = useState(true)

  const fetchActions = useCallback(async () => {
    setLoading(true)
    try {
      const response = await analyticsApi.agentActions({ type: type || undefined, limit: 100 })
      setActions(response.data.actions || [])
      setSummary(response.data.summary_30d || {})
    } catch (error) {
      console.error('Error fetching agent actions:', error)
      setActions([])
    } finally {
      setLoading(false)
    }
  }, [type])

  useEffect(() => { fetchActions() }, [fetchActions])

  const summaryEntries = Object.entries(summary) as [AgentActionType, number][]

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground mb-3">
          O que a IA fez por conta própria nos últimos 30 dias, por tipo de ação.
        </p>
        {summaryEntries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma ação autônoma registrada ainda neste período.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {summaryEntries.map(([actionType, count]) => (
              <Badge key={actionType} variant="info" className="gap-1.5">
                {ACTION_TYPE_LABEL[actionType] || actionType}
                <span className="font-bold">{count}</span>
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <Select value={type} onChange={(e) => setType(e.target.value)} className="w-auto min-w-[220px]">
          <option value="">Todos os tipos</option>
          {(Object.keys(ACTION_TYPE_LABEL) as AgentActionType[]).map((t) => (
            <option key={t} value={t}>{ACTION_TYPE_LABEL[t]}</option>
          ))}
        </Select>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
        </div>
      ) : actions.length === 0 ? (
        <EmptyState
          compact
          icon={ClockCounterClockwise}
          title="Nenhuma ação registrada"
          description="Quando as automações autônomas agirem, o histórico aparece aqui."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Paciente</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Canal</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Detalhe</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {actions.map((action) => (
              <TableRow key={action.id}>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {action.created_at ? formatDateTime(action.created_at) : '—'}
                </TableCell>
                <TableCell>{action.patient_name || '—'}</TableCell>
                <TableCell>{ACTION_TYPE_LABEL[action.action_type] || action.action_type}</TableCell>
                <TableCell>{action.channel ? (CHANNEL_LABEL[action.channel] || action.channel) : '—'}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[action.status]}>{STATUS_LABEL[action.status]}</Badge>
                </TableCell>
                <TableCell className="max-w-xs truncate text-sm text-muted-foreground" title={action.detail || ''}>
                  {action.detail || '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}

function AskAiTab() {
  const [question, setQuestion] = useState('')
  const [days, setDays] = useState(90)
  const [loading, setLoading] = useState(false)
  const [answer, setAnswer] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleAsk = async () => {
    if (!question.trim()) return
    setLoading(true)
    setError(null)
    setAnswer(null)
    try {
      const response = await analyticsApi.ask(question.trim(), days)
      setAnswer(response.data.answer)
    } catch (err) {
      console.error('Error asking analytics question:', err)
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setError(message || 'Não foi possível gerar a resposta agora.')
    } finally {
      setLoading(false)
    }
  }

  const suggestions = [
    'Quantos pacientes novos tivemos este mês?',
    'Qual profissional teve mais faltas nos últimos 30 dias?',
    'Como está a taxa de cancelamento comparada ao mês passado?',
  ]

  return (
    <div className="space-y-4 max-w-2xl">
      <p className="text-sm text-muted-foreground">
        Faça uma pergunta em linguagem natural sobre os números da clínica. A
        resposta usa exclusivamente os dados reais deste período.
      </p>

      <div className="flex items-center gap-2 flex-wrap">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setQuestion(s)}
            className="text-xs px-3 py-1.5 rounded-full border border-border/60 text-muted-foreground hover:border-primary hover:text-primary transition-colors"
          >
            {s}
          </button>
        ))}
      </div>

      <Textarea
        placeholder="Ex: quantos agendamentos concluímos essa semana?"
        rows={3}
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
      />

      <div className="flex items-center justify-between gap-3">
        <Select value={String(days)} onChange={(e) => setDays(Number(e.target.value))} className="w-auto">
          {ASK_PERIOD_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>Período: {opt.label}</option>
          ))}
        </Select>
        <Button onClick={handleAsk} loading={loading} disabled={!question.trim()}>
          <Send className="h-4 w-4" />
          Perguntar
        </Button>
      </div>

      {loading && (
        <div className="space-y-2 pt-2">
          <Skeleton className="h-4 w-full rounded" />
          <Skeleton className="h-4 w-5/6 rounded" />
          <Skeleton className="h-4 w-2/3 rounded" />
        </div>
      )}

      {error && !loading && (
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg p-3">
          {error}
        </div>
      )}

      {answer && !loading && (
        <Card>
          <CardContent className="p-4">
            <MarkdownContent content={answer} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default function AnalyticsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Analytics"
        description="Auditoria das automações autônomas da IA e perguntas em linguagem natural sobre os números da clínica"
      />

      <Tabs defaultValue="actions">
        <TabsList>
          <TabsTrigger value="actions" className="gap-2">
            <Bot className="h-4 w-4" />
            Ações da IA
          </TabsTrigger>
          <TabsTrigger value="ask" className="gap-2">
            <ChatCircleText className="h-4 w-4" />
            Pergunte à IA
          </TabsTrigger>
        </TabsList>

        <TabsContent value="actions" className="mt-6">
          <AgentActionsTab />
        </TabsContent>
        <TabsContent value="ask" className="mt-6">
          <AskAiTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
