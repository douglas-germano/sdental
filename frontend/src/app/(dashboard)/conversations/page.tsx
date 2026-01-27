'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { conversationsApi } from '@/lib/api'
import { Conversation } from '@/types'
import { formatDateTime, formatPhone, getStatusColor, getStatusLabel } from '@/lib/utils'
import { MessageSquare, AlertCircle, ChevronRight, ChevronLeft } from 'lucide-react'

export default function ConversationsPage() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [needsAttentionCount, setNeedsAttentionCount] = useState(0)
  const [filter, setFilter] = useState<'all' | 'needs_attention'>('all')

  const fetchConversations = async () => {
    setLoading(true)
    try {
      const response = await conversationsApi.list({
        page,
        per_page: 20,
        needs_attention: filter === 'needs_attention' ? true : undefined
      })
      setConversations(response.data.conversations || [])
      setTotalPages(response.data.pages || 1)
      setNeedsAttentionCount(response.data.needs_attention_count || 0)
    } catch (error) {
      console.error('Error fetching conversations:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchConversations()
  }, [page, filter])

  const getLastMessage = (conv: Conversation) => {
    if (!conv.messages || conv.messages.length === 0) return 'Sem mensagens'
    const lastMsg = conv.messages[conv.messages.length - 1]
    return lastMsg.content.length > 50
      ? lastMsg.content.substring(0, 50) + '...'
      : lastMsg.content
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Conversas</h1>
          <p className="text-sm text-muted-foreground">
            Acompanhe as conversas do chatbot
          </p>
        </div>
        {needsAttentionCount > 0 && (
          <Badge variant="warning" size="lg" className="gap-2">
            <AlertCircle className="h-4 w-4" />
            {needsAttentionCount} aguardando atencao
          </Badge>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 p-1.5 bg-muted/50 rounded-xl w-fit">
        <Button
          variant={filter === 'all' ? 'default' : 'ghost'}
          onClick={() => {
            setFilter('all')
            setPage(1)
          }}
          className="rounded-lg"
        >
          Todas
        </Button>
        <Button
          variant={filter === 'needs_attention' ? 'warning' : 'ghost'}
          onClick={() => {
            setFilter('needs_attention')
            setPage(1)
          }}
          className="rounded-lg gap-2"
        >
          <AlertCircle className="h-4 w-4" />
          Aguardando Atencao
          {needsAttentionCount > 0 && (
            <span className="bg-white/20 rounded-full px-2 py-0.5 text-xs font-medium">
              {needsAttentionCount}
            </span>
          )}
        </Button>
      </div>

      {/* Conversations List */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : conversations.length === 0 ? (
        <Card className="border-border/50">
          <CardContent className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
              <MessageSquare className="h-8 w-8 opacity-50" />
            </div>
            <p className="font-medium">Nenhuma conversa encontrada</p>
            <p className="text-sm">As conversas do WhatsApp aparecerão aqui</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {conversations.map((conv) => (
            <Link key={conv.id} href={`/conversations/${conv.id}`}>
              <Card className="hover:shadow-medium transition-all duration-200 cursor-pointer border-border/50 group">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 flex-1">
                      <div className="h-12 w-12 rounded-full bg-gradient-primary flex items-center justify-center text-white font-semibold text-lg flex-shrink-0">
                        {conv.patient?.name?.charAt(0).toUpperCase() || '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1">
                          <span className="font-semibold truncate">
                            {conv.patient?.name || 'Paciente Desconhecido'}
                          </span>
                          <Badge className={getStatusColor(conv.status)}>
                            {getStatusLabel(conv.status)}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mb-1">
                          {formatPhone(conv.phone_number)}
                        </p>
                        <p className="text-sm text-muted-foreground truncate">
                          {getLastMessage(conv)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 flex-shrink-0">
                      <span className="text-sm text-muted-foreground">
                        {formatDateTime(conv.last_message_at)}
                      </span>
                      <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
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
            size="icon"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
            className="h-9 w-9"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              const pageNum = i + 1
              return (
                <Button
                  key={pageNum}
                  variant={page === pageNum ? 'default' : 'ghost'}
                  size="icon"
                  onClick={() => setPage(pageNum)}
                  className="h-9 w-9"
                >
                  {pageNum}
                </Button>
              )
            })}
          </div>
          <Button
            variant="outline"
            size="icon"
            disabled={page === totalPages}
            onClick={() => setPage(page + 1)}
            className="h-9 w-9"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  )
}
