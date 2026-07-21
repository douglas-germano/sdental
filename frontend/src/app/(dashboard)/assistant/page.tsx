'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { PageLoader } from '@/components/ui/page-loader'
import { useToast } from '@/components/ui/toast'
import { useConfirm } from '@/hooks/useConfirm'
import { assistantApi } from '@/lib/api'
import { AssistantMessage } from '@/types'
import { getErrorMessage } from '@/lib/error-messages'
import { AssistantMessageBubble } from '@/components/assistant/assistant-message-bubble'
import { AssistantMemoriesModal } from '@/components/assistant/assistant-memories-modal'
import { cn } from '@/lib/utils'
import {
  Sparkle,
  ArrowUp,
  Trash as Trash2,
  ChartLineUp,
  UsersThree,
  CalendarX,
  Brain,
} from '@phosphor-icons/react'

const SUGGESTIONS = [
  { icon: ChartLineUp, text: 'Como foi meu desempenho nos últimos 30 dias?' },
  { icon: UsersThree, text: 'Quais pacientes estão parados no funil?' },
  { icon: CalendarX, text: 'Tem algum paciente que faltou recentemente?' },
]

const TEXTAREA_MAX_HEIGHT = 200

function TypingIndicator() {
  return (
    <div className="flex gap-3 items-center">
      <div className="shrink-0 w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center">
        <Sparkle className="h-3.5 w-3.5" />
      </div>
      <div className="flex items-center gap-1">
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce" />
      </div>
    </div>
  )
}

export default function AssistantPage() {
  const { toast } = useToast()
  const { confirm, ConfirmDialogComponent } = useConfirm()
  const [messages, setMessages] = useState<AssistantMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [memoriesOpen, setMemoriesOpen] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const fetchMessages = useCallback(async () => {
    setLoading(true)
    try {
      const response = await assistantApi.getMessages()
      setMessages(response.data.messages || [])
    } catch (error) {
      toast({ title: 'Erro ao carregar conversa', description: getErrorMessage(error), variant: 'error' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    fetchMessages()
  }, [fetchMessages])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, TEXTAREA_MAX_HEIGHT)}px`
  }, [])

  useEffect(() => {
    resizeTextarea()
  }, [text, resizeTextarea])

  const send = async (content: string) => {
    const trimmed = content.trim()
    if (!trimmed || sending) return

    setSending(true)
    const optimisticUser: AssistantMessage = {
      id: `optimistic-${Date.now()}`,
      role: 'user',
      content: trimmed,
      timestamp: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, optimisticUser])
    setText('')
    requestAnimationFrame(resizeTextarea)

    try {
      const response = await assistantApi.sendMessage(trimmed)
      setMessages(response.data.conversation.messages || [])
    } catch (error) {
      toast({ title: 'Erro ao enviar mensagem', description: getErrorMessage(error), variant: 'error' })
      setMessages((prev) => prev.filter((m) => m.id !== optimisticUser.id))
    } finally {
      setSending(false)
    }
  }

  const handleSend = () => send(text)

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleClear = async () => {
    const confirmed = await confirm({
      title: 'Limpar conversa',
      description: 'Isso apaga o histórico de mensagens desta conversa. O que a IA já aprendeu sobre sua clínica é mantido.',
      confirmText: 'Limpar',
      variant: 'destructive',
    })
    if (!confirmed) return

    try {
      await assistantApi.clearMessages()
      setMessages([])
    } catch (error) {
      toast({ title: 'Erro ao limpar conversa', description: getErrorMessage(error), variant: 'error' })
    }
  }

  return (
    <div className="flex flex-col h-[100dvh] lg:h-[calc(100dvh-2rem)] min-h-0 bg-card lg:rounded-card lg:border lg:border-border lg:overflow-hidden">
      {/* Compact header */}
      <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-8 w-8 shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center">
            <Sparkle className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-foreground truncate">Assistente IA</h1>
            <p className="text-xs text-muted-foreground truncate">Seu braço direito para decisões da clínica</p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="sm" onClick={() => setMemoriesOpen(true)} className="gap-1.5 text-muted-foreground">
            <Brain className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Memórias</span>
          </Button>
          {messages.length > 0 && (
            <Button variant="ghost" size="sm" onClick={handleClear} className="gap-1.5 text-muted-foreground">
              <Trash2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Limpar conversa</span>
            </Button>
          )}
        </div>
      </div>

      <AssistantMemoriesModal open={memoriesOpen} onOpenChange={setMemoriesOpen} />

      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <PageLoader size="default" message="Carregando conversa..." />
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-6">
            <div className="w-14 h-14 rounded-full bg-primary/8 flex items-center justify-center mb-4">
              <Sparkle className="h-6 w-6 text-primary" />
            </div>
            <h2 className="text-lg font-semibold text-foreground mb-1.5">
              Como posso ajudar sua clínica hoje?
            </h2>
            <p className="text-sm text-muted-foreground max-w-[440px] mb-6">
              Diferente do assistente que atende pacientes no WhatsApp, esta IA é só sua: ela
              acessa os dados da clínica (agendamentos, pacientes, funil, conversas) para
              ajudar a entender o negócio e tomar decisões.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 w-full max-w-2xl">
              {SUGGESTIONS.map(({ icon: Icon, text: suggestion }) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => send(suggestion)}
                  className="flex flex-col items-start gap-2 text-left p-3.5 rounded-xl border border-border bg-card hover:bg-muted/50 hover:border-foreground/20 transition-colors"
                >
                  <Icon className="h-4 w-4 text-primary" />
                  <span className="text-xs text-foreground leading-snug">{suggestion}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto w-full px-4 sm:px-6 py-6 space-y-6">
            {messages.map((message) => (
              <AssistantMessageBubble key={message.id} message={message} />
            ))}
            {sending && <TypingIndicator />}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Composer */}
      {/* Left padding clears the floating mobile menu button (fixed at
          bottom-20 left-4, see (dashboard)/layout.tsx), which would otherwise
          sit on top of the input pill below the lg breakpoint. */}
      <div className="shrink-0 pl-16 pr-4 sm:pr-6 lg:pl-6 pb-4 pt-2">
        <div className="max-w-3xl mx-auto w-full">
          <div className="flex items-end gap-2 rounded-3xl border border-input bg-card px-3 py-2 shadow-soft focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-ring/15 transition-colors">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Pergunte algo sobre sua clínica..."
              rows={1}
              maxLength={2000}
              disabled={sending}
              className="flex-1 resize-none bg-transparent px-2 py-1.5 text-sm placeholder:text-muted-foreground/50 focus-visible:outline-none max-h-[200px]"
            />
            <Button
              type="button"
              size="icon"
              className="shrink-0 rounded-full h-9 w-9"
              onClick={handleSend}
              disabled={sending || !text.trim()}
              loading={sending}
              title="Enviar"
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-center text-[11px] text-muted-foreground/60 mt-2">
            A IA pode cometer erros. Confira informações importantes antes de decidir.
          </p>
        </div>
      </div>

      {ConfirmDialogComponent}
    </div>
  )
}
