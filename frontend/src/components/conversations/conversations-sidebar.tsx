'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { EmptyState } from '@/components/ui/empty-state'
import { PageLoader } from '@/components/ui/page-loader'
import { useConversations, FilterStatus } from './conversations-provider'
import { Conversation } from '@/types'
import { formatRelativeTime, formatPhone, cn } from '@/lib/utils'
import { Chat as MessageSquare, ArrowsClockwise as RefreshCw, MagnifyingGlass as Search, CaretLeft as ChevronLeft, CaretRight as ChevronRight, Image as ImageIcon, Microphone as Mic, FileText, SpeakerHigh, SpeakerSlash, Bell, BellSlash } from '@phosphor-icons/react'

function avatarInitial(conv: Conversation): string {
  const name = conv.patient?.name?.trim()
  if (name) return name.charAt(0).toUpperCase()
  // Unknown contact: last two phone digits beat an anonymous "?"
  const digits = (conv.phone_number || '').replace(/\D/g, '')
  return digits.slice(-2) || '?'
}

const FILTERS: { value: FilterStatus; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'needs_attention', label: 'Aguardando' },
  { value: 'active', label: 'Ativas' },
  { value: 'completed', label: 'Concluidas' },
]

function isUrgent(conv: Conversation) {
  return conv.status === 'transferred_to_human'
}

function isRecent(conv: Conversation) {
  if (!conv.last_message_at) return false
  return Date.now() - new Date(conv.last_message_at).getTime() < 5 * 60 * 1000
}

function LastMessagePreview({ conv }: { conv: Conversation }) {
  const last = conv.messages && conv.messages.length > 0 ? conv.messages[conv.messages.length - 1] : null
  if (!last) return <span>Sem mensagens</span>

  const prefix = last.role === 'assistant' ? <span className="text-primary font-medium">Bot: </span> : null

  if (last.type === 'image') {
    return <span className="inline-flex items-center gap-1">{prefix}<ImageIcon className="h-3.5 w-3.5" /> Foto{last.caption ? `: ${last.caption}` : ''}</span>
  }
  if (last.type === 'audio') {
    return <span className="inline-flex items-center gap-1">{prefix}<Mic className="h-3.5 w-3.5" /> Audio</span>
  }
  if (last.type === 'document') {
    return <span className="inline-flex items-center gap-1">{prefix}<FileText className="h-3.5 w-3.5" /> Documento</span>
  }

  const content = last.content?.length > 60 ? `${last.content.substring(0, 60)}...` : last.content
  return <span>{prefix}{content}</span>
}

export function ConversationsSidebar() {
  const pathname = usePathname()
  const {
    conversations, loading, refreshing, page, setPage, totalPages,
    needsAttentionCount, filter, setFilter, searchInput, setSearchInput,
    refresh, connected, typingConversationIds,
    soundEnabled, desktopEnabled, toggleSound, toggleDesktop
  } = useConversations()

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="p-4 border-b border-border shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-foreground">Conversas</h1>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className={cn('h-1.5 w-1.5 rounded-full', connected ? 'bg-success' : 'bg-muted-foreground/40')} />
              </TooltipTrigger>
              <TooltipContent>{connected ? 'Tempo real conectado' : 'Reconectando...'}</TooltipContent>
            </Tooltip>
          </div>
          <div className="flex items-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" onClick={toggleSound}>
                  {soundEnabled ? <SpeakerHigh className="h-4 w-4" /> : <SpeakerSlash className="h-4 w-4 text-muted-foreground/50" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{soundEnabled ? 'Som ligado' : 'Som desligado'}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" onClick={toggleDesktop}>
                  {desktopEnabled ? <Bell className="h-4 w-4" /> : <BellSlash className="h-4 w-4 text-muted-foreground/50" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{desktopEnabled ? 'Notificações do navegador ativas' : 'Ativar notificações do navegador'}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" onClick={refresh} disabled={refreshing}>
                  <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Atualizar</TooltipContent>
            </Tooltip>
          </div>
        </div>

        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
          <Input
            placeholder="Buscar por nome ou telefone..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        <div className="flex gap-1 overflow-x-auto scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                'px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors duration-150',
                filter === f.value ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'
              )}
            >
              {f.label}
              {f.value === 'needs_attention' && needsAttentionCount > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full text-2xs font-semibold bg-warning/15 text-warning">
                  {needsAttentionCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
        {loading ? (
          <PageLoader size="sm" />
        ) : conversations.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title={searchInput ? 'Nenhuma conversa encontrada' : 'Nenhuma conversa'}
            description={searchInput ? 'Tente buscar com outros termos' : 'As conversas do WhatsApp aparecerao aqui'}
          />
        ) : (
          <ul>
            {conversations.map((conv) => {
              const active = pathname === `/conversations/${conv.id}`
              const typing = typingConversationIds.has(conv.id)
              return (
                <li key={conv.id}>
                  <Link
                    href={`/conversations/${conv.id}`}
                    className={cn(
                      'flex items-center gap-3 px-4 py-3 border-b border-border/50 transition-colors duration-100',
                      active ? 'bg-primary/8' : 'hover:bg-muted/50'
                    )}
                  >
                    <div className="relative shrink-0">
                      <div className={cn(
                        'h-11 w-11 rounded-full flex items-center justify-center text-white font-semibold text-sm',
                        conv.urgent ? 'bg-destructive' : isUrgent(conv) ? 'bg-warning' : 'bg-primary'
                      )}>
                        {avatarInitial(conv)}
                      </div>
                      {isRecent(conv) && (
                        <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-success border-2 border-card" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className={cn(
                          'text-sm truncate',
                          active ? 'font-semibold text-primary' : (conv.unread_count || 0) > 0 ? 'font-semibold text-foreground' : 'font-medium text-foreground'
                        )}>
                          {conv.patient?.name || formatPhone(conv.phone_number)}
                        </span>
                        <span className="text-2xs text-muted-foreground shrink-0">
                          {formatRelativeTime(conv.last_message_at)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <p className={cn(
                          'text-xs truncate',
                          (conv.unread_count || 0) > 0 ? 'text-foreground font-medium' : 'text-muted-foreground'
                        )}>
                          {typing ? (
                            <span className="text-primary font-medium">digitando...</span>
                          ) : (
                            <LastMessagePreview conv={conv} />
                          )}
                        </p>
                        <span className="flex items-center gap-1.5 shrink-0">
                          {conv.urgent ? (
                            <Badge variant="destructive" size="sm" dot>Urgente</Badge>
                          ) : isUrgent(conv) && (
                            <Badge variant="warning" size="sm">Aguardando</Badge>
                          )}
                          {(conv.unread_count || 0) > 0 && (
                            <span
                              className="min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-2xs font-semibold flex items-center justify-center"
                              aria-label={`${conv.unread_count} mensagens não lidas`}
                            >
                              {(conv.unread_count || 0) > 99 ? '99+' : conv.unread_count}
                            </span>
                          )}
                        </span>
                      </div>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 p-2 border-t border-border shrink-0">
          <Button variant="ghost" size="icon-sm" disabled={page === 1} onClick={() => setPage(page - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground">{page} / {totalPages}</span>
          <Button variant="ghost" size="icon-sm" disabled={page === totalPages} onClick={() => setPage(page + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  )
}
