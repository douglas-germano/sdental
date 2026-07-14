'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react'
import { conversationsApi } from '@/lib/api'
import { Conversation, Message } from '@/types'
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
  whatsappState: string | null
  activeConversationId: string | null
  setActiveConversationId: (id: string | null) => void
  markReadLocal: (id: string) => void
  unreadTotal: number
  soundEnabled: boolean
  desktopEnabled: boolean
  toggleSound: () => void
  toggleDesktop: () => Promise<void>
}

const ConversationsContext = createContext<ConversationsContextValue | undefined>(undefined)

/** Short, quiet two-tone chime via WebAudio - no asset download needed. */
function playChime() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new AudioCtx()
    const now = ctx.currentTime
    ;[880, 1174.66].forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, now + i * 0.12)
      gain.gain.exponentialRampToValueAtTime(0.06, now + i * 0.12 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.12 + 0.25)
      osc.connect(gain).connect(ctx.destination)
      osc.start(now + i * 0.12)
      osc.stop(now + i * 0.12 + 0.3)
    })
    setTimeout(() => ctx.close(), 800)
  } catch {
    // audio blocked/unsupported - silently skip
  }
}

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
  const [whatsappState, setWhatsappState] = useState<string | null>(null)
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [desktopEnabled, setDesktopEnabled] = useState(false)
  const search = useDebounce(searchInput, 500)

  const { connected, subscribe } = useConversationStream()

  const conversationsRef = useRef<Conversation[]>([])
  conversationsRef.current = conversations
  const activeIdRef = useRef<string | null>(null)
  activeIdRef.current = activeConversationId
  const baseTitleRef = useRef<string>('')

  useEffect(() => {
    baseTitleRef.current = document.title
    setSoundEnabled(localStorage.getItem('sd-chat-sound') !== '0')
    setDesktopEnabled(
      localStorage.getItem('sd-chat-desktop') === '1' &&
      typeof Notification !== 'undefined' &&
      Notification.permission === 'granted'
    )
  }, [])

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
      if ('whatsapp_connection_state' in response.data) {
        setWhatsappState(response.data.whatsapp_connection_state)
      }
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

  // Debounced full refresh - fallback for events we can't patch locally
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout>>()
  const scheduleRefresh = useCallback(() => {
    clearTimeout(refreshTimeoutRef.current)
    refreshTimeoutRef.current = setTimeout(() => fetchConversations(true), 300)
  }, [fetchConversations])

  const notifyIncoming = useCallback((conversation: Conversation | undefined, message: Message) => {
    if (message.role !== 'user') return
    const isActiveAndVisible =
      activeIdRef.current === (conversation?.id || null) && document.visibilityState === 'visible'
    if (isActiveAndVisible) return

    if (localStorage.getItem('sd-chat-sound') !== '0') {
      playChime()
    }
    if (
      localStorage.getItem('sd-chat-desktop') === '1' &&
      typeof Notification !== 'undefined' &&
      Notification.permission === 'granted' &&
      document.visibilityState !== 'visible'
    ) {
      const title = conversation?.patient?.name || conversation?.phone_number || 'Nova mensagem'
      const body = message.type && message.type !== 'text'
        ? 'Enviou uma mídia'
        : (message.content || '').slice(0, 120)
      const notification = new Notification(title, { body, tag: conversation?.id })
      notification.onclick = () => {
        window.focus()
        notification.close()
      }
    }
  }, [])

  useEffect(() => {
    const unsubscribe = subscribe((event) => {
      if (event.type === 'new_message') {
        const conversationId = event.payload.conversation_id as string
        const message = event.payload.message as Message
        const conversationStatus = event.payload.conversation_status as Conversation['status']

        const existing = conversationsRef.current.find((c) => c.id === conversationId)
        notifyIncoming(existing, message)

        if (!existing) {
          // New conversation (or outside the current page/filter): refetch
          scheduleRefresh()
          return
        }

        // Patch in place: update preview/unread and move to top - no flicker,
        // no extra API round-trip.
        setConversations((prev) => {
          const idx = prev.findIndex((c) => c.id === conversationId)
          if (idx === -1) return prev
          const conv = prev[idx]
          const incrementUnread = message.role === 'user' && activeIdRef.current !== conversationId
          const updated: Conversation = {
            ...conv,
            status: conversationStatus || conv.status,
            last_message_at: message.timestamp,
            messages: [message],
            unread_count: (conv.unread_count || 0) + (incrementUnread ? 1 : 0),
          }
          const next = [...prev]
          next.splice(idx, 1)
          return [updated, ...next]
        })

        if (conversationStatus === 'transferred_to_human') {
          // Keep the "Aguardando" filter badge accurate
          scheduleRefresh()
        }
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

      if (event.type === 'connection_status') {
        setWhatsappState((event.payload.state as string) || null)
      }
    })
    return () => unsubscribe()
  }, [subscribe, scheduleRefresh, notifyIncoming])

  const markReadLocal = useCallback((id: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, unread_count: 0 } : c))
    )
  }, [])

  // Unread total in the tab title, so the receptionist sees activity from
  // any other tab.
  const unreadTotal = conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0)
  useEffect(() => {
    if (!baseTitleRef.current) return
    document.title = unreadTotal > 0 ? `(${unreadTotal}) ${baseTitleRef.current}` : baseTitleRef.current
    return () => {
      document.title = baseTitleRef.current
    }
  }, [unreadTotal])

  const toggleSound = useCallback(() => {
    setSoundEnabled((prev) => {
      localStorage.setItem('sd-chat-sound', prev ? '0' : '1')
      return !prev
    })
  }, [])

  const toggleDesktop = useCallback(async () => {
    if (desktopEnabled) {
      localStorage.setItem('sd-chat-desktop', '0')
      setDesktopEnabled(false)
      return
    }
    if (typeof Notification === 'undefined') return
    let permission = Notification.permission
    if (permission === 'default') {
      permission = await Notification.requestPermission()
    }
    if (permission === 'granted') {
      localStorage.setItem('sd-chat-desktop', '1')
      setDesktopEnabled(true)
    }
  }, [desktopEnabled])

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
    typingConversationIds,
    whatsappState,
    activeConversationId,
    setActiveConversationId,
    markReadLocal,
    unreadTotal,
    soundEnabled,
    desktopEnabled,
    toggleSound,
    toggleDesktop
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
