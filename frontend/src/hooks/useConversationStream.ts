'use client'

import { useEffect, useRef, useState } from 'react'
import { conversationsApi } from '@/lib/api'

export type StreamEventType = 'new_message' | 'message_status' | 'typing' | 'connection_status'

export interface StreamEvent {
  type: StreamEventType
  payload: Record<string, unknown>
}

type Listener = (event: StreamEvent) => void

const MAX_RETRY_DELAY = 15000

/**
 * Opens a single Server-Sent Events connection to the backend and fans out
 * events to any number of listeners registered via `subscribe`.
 *
 * Auto-reconnects with exponential backoff. If the browser doesn't support
 * EventSource, `connected` stays false forever so callers can fall back to
 * polling.
 */
export function useConversationStream() {
  const [connected, setConnected] = useState(false)
  const listenersRef = useRef<Set<Listener>>(new Set())

  useEffect(() => {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
      return
    }

    let cancelled = false
    let es: EventSource | null = null
    let retryTimeout: ReturnType<typeof setTimeout>
    let retryCount = 0

    const emit = (type: StreamEventType) => (e: MessageEvent) => {
      try {
        const payload = JSON.parse(e.data)
        listenersRef.current.forEach((fn) => fn({ type, payload }))
      } catch {
        // malformed event, ignore
      }
    }

    function connect() {
      if (cancelled) return

      es = new EventSource(conversationsApi.streamUrl())

      es.onopen = () => {
        retryCount = 0
        setConnected(true)
      }

      es.addEventListener('new_message', emit('new_message'))
      es.addEventListener('message_status', emit('message_status'))
      es.addEventListener('typing', emit('typing'))
      es.addEventListener('connection_status', emit('connection_status'))

      es.onerror = () => {
        setConnected(false)
        es?.close()
        if (cancelled) return
        const delay = Math.min(1000 * 2 ** retryCount, MAX_RETRY_DELAY)
        retryCount += 1
        retryTimeout = setTimeout(connect, delay)
      }
    }

    connect()

    return () => {
      cancelled = true
      clearTimeout(retryTimeout)
      es?.close()
    }
  }, [])

  const subscribe = (fn: Listener) => {
    listenersRef.current.add(fn)
    return () => {
      listenersRef.current.delete(fn)
    }
  }

  return { connected, subscribe }
}
