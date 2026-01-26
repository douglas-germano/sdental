'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { conversationsApi } from '@/lib/api'
import { Conversation } from '@/types'
import { formatDateTime, formatPhone, getStatusColor, getStatusLabel } from '@/lib/utils'
import { MessageSquare, AlertCircle, ChevronRight } from 'lucide-react'

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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Conversas</h1>
          <p className="text-muted-foreground">
            Acompanhe as conversas do chatbot
          </p>
        </div>
        {needsAttentionCount > 0 && (
          <Badge className="bg-orange-100 text-orange-800 text-base px-4 py-2">
            <AlertCircle className="h-4 w-4 mr-2" />
            {needsAttentionCount} aguardando atencao
          </Badge>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2">
        <Button
          variant={filter === 'all' ? 'default' : 'outline'}
          onClick={() => {
            setFilter('all')
            setPage(1)
          }}
        >
          Todas
        </Button>
        <Button
          variant={filter === 'needs_attention' ? 'default' : 'outline'}
          onClick={() => {
            setFilter('needs_attention')
            setPage(1)
          }}
        >
          <AlertCircle className="h-4 w-4 mr-2" />
          Aguardando Atencao
          {needsAttentionCount > 0 && (
            <span className="ml-2 bg-white text-primary rounded-full px-2 py-0.5 text-xs">
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
        <Card>
          <CardContent className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <MessageSquare className="h-12 w-12 mb-4" />
            <p>Nenhuma conversa encontrada</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {conversations.map((conv) => (
            <Link key={conv.id} href={`/conversations/${conv.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <span className="font-medium">
                          {conv.patient?.name || 'Paciente Desconhecido'}
                        </span>
                        <Badge className={getStatusColor(conv.status)}>
                          {getStatusLabel(conv.status)}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mb-1">
                        {formatPhone(conv.phone_number)}
                      </p>
                      <p className="text-sm text-gray-600">
                        {getLastMessage(conv)}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-muted-foreground">
                        {formatDateTime(conv.last_message_at)}
                      </span>
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
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
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
          >
            Anterior
          </Button>
          <span className="text-sm text-muted-foreground">
            Pagina {page} de {totalPages}
          </span>
          <Button
            variant="outline"
            disabled={page === totalPages}
            onClick={() => setPage(page + 1)}
          >
            Proxima
          </Button>
        </div>
      )}
    </div>
  )
}
