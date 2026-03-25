'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { conversationsApi } from '@/lib/api'
import { Conversation } from '@/types'
import { formatDateTime, formatRelativeTime, formatPhone, getStatusColor, getStatusLabel } from '@/lib/utils'
import {
  MessageSquare, AlertCircle, ChevronRight, ChevronLeft,
  Search, RefreshCw, Clock
} from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { useDebounce } from '@/hooks/useDebounce'
import { cn } from '@/lib/utils'

type FilterStatus = 'all' | 'needs_attention' | 'active' | 'completed' | 'transferred_to_human'

export default function ConversationsPage() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [needsAttentionCount, setNeedsAttentionCount] = useState(0)
  const [filter, setFilter] = useState<FilterStatus>('all')
  const [searchInput, setSearchInput] = useState('')
  const search = useDebounce(searchInput, 500)
  const [refreshing, setRefreshing] = useState(false)

  const fetchConversations = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }
    try {
      const params: Record<string, unknown> = {
        page,
        per_page: 20,
      }

      if (filter === 'needs_attention') {
        params.needs_attention = true
      } else if (filter !== 'all') {
        params.status = filter
      }

      if (search) {
        params.search = search
      }

      const response = await conversationsApi.list(params as Parameters<typeof conversationsApi.list>[0])
      setConversations(response.data.conversations || [])
      setTotalPages(response.data.pages || 1)
      setNeedsAttentionCount(response.data.needs_attention_count || 0)
    } catch (error) {
      console.error('Error fetching conversations:', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [page, filter, search])

  useEffect(() => {
    fetchConversations()
  }, [fetchConversations])

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchConversations(true)
    }, 30000)
    return () => clearInterval(interval)
  }, [fetchConversations])

  // Reset page when filter or search changes
  useEffect(() => {
    setPage(1)
  }, [filter, search])

  const getLastMessage = (conv: Conversation) => {
    if (!conv.messages || conv.messages.length === 0) return 'Sem mensagens'
    const lastMsg = conv.messages[conv.messages.length - 1]
    return lastMsg.content.length > 60
      ? lastMsg.content.substring(0, 60) + '...'
      : lastMsg.content
  }

  const getLastMessageRole = (conv: Conversation) => {
    if (!conv.messages || conv.messages.length === 0) return null
    return conv.messages[conv.messages.length - 1].role
  }

  const isUrgent = (conv: Conversation) => {
    return conv.status === 'transferred_to_human'
  }

  const isRecent = (conv: Conversation) => {
    if (!conv.last_message_at) return false
    const diff = Date.now() - new Date(conv.last_message_at).getTime()
    return diff < 5 * 60 * 1000 // last 5 minutes
  }

  const filters: { value: FilterStatus; label: string; count?: number }[] = [
    { value: 'all', label: 'Todas' },
    { value: 'needs_attention', label: 'Aguardando', count: needsAttentionCount || undefined },
    { value: 'active', label: 'Ativas' },
    { value: 'completed', label: 'Concluidas' },
  ]

  return (
    <div className="space-y-8 page-enter">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Conversas</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Acompanhe as conversas do chatbot
          </p>
        </div>
        <div className="flex items-center gap-3">
          {needsAttentionCount > 0 && (
            <Badge variant="warning" size="lg" dot className="gap-1.5">
              {needsAttentionCount} aguardando atencao
            </Badge>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => fetchConversations(true)}
                disabled={refreshing}
              >
                <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Atualizar conversas</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="space-y-4">
        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
          <Input
            placeholder="Buscar por nome ou telefone..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-1.5 p-1 bg-muted/40 rounded-xl w-fit">
          {filters.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                "px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all duration-200",
                filter === f.value
                  ? "bg-background text-foreground shadow-soft"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {f.label}
              {f.count && f.count > 0 && (
                <span className={cn(
                  "ml-1.5 px-1.5 py-0.5 rounded-full text-xs font-medium",
                  filter === f.value
                    ? "bg-warning/15 text-warning"
                    : "bg-muted text-muted-foreground"
                )}>
                  {f.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Conversations List */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 rounded-full border-[3px] border-primary/20 border-t-primary animate-spin" />
        </div>
      ) : conversations.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title={search ? "Nenhuma conversa encontrada" : "Nenhuma conversa"}
          description={search ? "Tente buscar com outros termos" : "As conversas do WhatsApp aparecerao aqui"}
        />
      ) : (
        <div className="space-y-2">
          {conversations.map((conv, index) => (
            <Link key={conv.id} href={`/conversations/${conv.id}`}>
              <Card
                className={cn(
                  "cursor-pointer border-border/60 group transition-all duration-150 hover:shadow-soft-md hover:border-border",
                  isUrgent(conv) && "border-l-[3px] border-l-warning",
                  isRecent(conv) && !isUrgent(conv) && "border-l-[3px] border-l-primary"
                )}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    {/* Avatar */}
                    <div className="relative shrink-0">
                      <div className={cn(
                        "h-11 w-11 rounded-full flex items-center justify-center text-white font-semibold text-base",
                        isUrgent(conv) ? "bg-warning" : "bg-gradient-primary"
                      )}>
                        {conv.patient?.name?.charAt(0).toUpperCase() || '?'}
                      </div>
                      {isRecent(conv) && (
                        <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-success border-2 border-card" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-semibold text-sm truncate">
                          {conv.patient?.name || 'Paciente Desconhecido'}
                        </span>
                        <Badge
                          className={getStatusColor(conv.status)}
                          size="sm"
                        >
                          {getStatusLabel(conv.status)}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mb-0.5">
                        {formatPhone(conv.phone_number)}
                      </p>
                      <p className="text-sm text-muted-foreground truncate">
                        {getLastMessageRole(conv) === 'assistant' && (
                          <span className="text-primary font-medium">Bot: </span>
                        )}
                        {getLastMessage(conv)}
                      </p>
                    </div>

                    {/* Right side - Time + Arrow */}
                    <div className="flex items-center gap-3 shrink-0">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {formatRelativeTime(conv.last_message_at)}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          {formatDateTime(conv.last_message_at)}
                        </TooltipContent>
                      </Tooltip>
                      <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary transition-colors" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button
            variant="outline"
            size="icon-sm"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            Pagina {page} de {totalPages}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            disabled={page === totalPages}
            onClick={() => setPage(page + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  )
}
