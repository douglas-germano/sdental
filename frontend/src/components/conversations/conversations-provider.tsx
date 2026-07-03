'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react'
import { conversationsApi } from '@/lib/api'
import { Conversation } from '@/types'
import { useDebounce } from '@/hooks/useDebounce'
import { useConversationStream, StreamEvent } from '@/hooks/useConversationStream'

export type FilterStatus = 'all' | 'needs_attention' | 'active' | 'completed'

interface ConversationsContextValue {
  conversations: Conversation[]
  loading: boolean
  refreshing: boolean
  page: number
  setPage: (page: number) => void
  totalPages: number
  needsAttentionCount: number
  filter: FilterStatus
  setFilter: (filter: FilterStatus) => void
  searchInput: string
  setSearchInput: (value: string) => void
  refresh: () => void
  connected: boolean
  subscribe: (fn: (event: StreamEvent) => void) => () => void
  typingConversationIds: Set<string>
}

const ConversationsContext = createContext<ConversationsContextValue | undefined>(undefined)

export function ConversationsProvider({ children }: { children: ReactNode }) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [needsAttentionCount, setNeedsAttentionCount] = useState(0)
  const [filter, setFilter] = useState<FilterStatus>('all')
  const [searchInput, setSearchInput] = useState('')
  const [typingConversationIds, setTypingConversationIds] = useState<Set<string>>(new Set())
  const search = useDebounce(searchInput, 500)

  const { connected, subscribe } = useConversationStream()

  const fetchConversations = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }
    try {
      const params: Record<string, unknown> = { page, per_page: 20 }

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

  useEffect(() => {
    setPage(1)
  }, [filter, search])

  // Fall back to polling only while the SSE connection isn't up
  useEffect(() => {
    if (connected) return
    const interval = setInterval(() => fetchConversations(true), 15000)
    return () => clearInterval(interval)
  }, [connected, fetchConversations])

  // Debounce list refreshes so a burst of events doesn't hammer the API
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout>>()
  const scheduleRefresh = useCallback(() => {
    clearTimeout(refreshTimeoutRef.current)
    refreshTimeoutRef.current = setTimeout(() => fetchConversations(true), 300)
  }, [fetchConversations])

  useEffect(() => {
    const unsubscribe = subscribe((event) => {
      if (event.type === 'new_message' || event.type === 'message_status') {
        scheduleRefresh()
      }

      if (event.type === 'typing') {
        const conversationId = event.payload.conversation_id as string
        const isTyping = Boolean(event.payload.is_typing)
        setTypingConversationIds((prev) => {
          const next = new Set(prev)
          if (isTyping) {
            next.add(conversationId)
          } else {
            next.delete(conversationId)
          }
          return next
        })
      }
    })
    return () => unsubscribe()
  }, [subscribe, scheduleRefresh])

  const value: ConversationsContextValue = {
    conversations,
    loading,
    refreshing,
    page,
    setPage,
    totalPages,
    needsAttentionCount,
    filter,
    setFilter,
    searchInput,
    setSearchInput,
    refresh: () => fetchConversations(true),
    connected,
    subscribe,
    typingConversationIds
  }

  return (
    <ConversationsContext.Provider value={value}>
      {children}
    </ConversationsContext.Provider>
  )
}

export function useConversations() {
  const ctx = useContext(ConversationsContext)
  if (!ctx) {
    throw new Error('useConversations must be used within a ConversationsProvider')
  }
  return ctx
}
