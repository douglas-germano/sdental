'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { PageLoader } from '@/components/ui/page-loader'
import { useToast } from '@/components/ui/toast'
import { useConfirm } from '@/hooks/useConfirm'
import { assistantApi } from '@/lib/api'
import { AssistantMessage } from '@/types'
import { getErrorMessage } from '@/lib/error-messages'
import { AssistantMessageBubble } from '@/components/assistant/assistant-message-bubble'
import { Sparkle, PaperPlaneTilt as Send, CircleNotch as Loader2, Trash as Trash2 } from '@phosphor-icons/react'

const SUGGESTIONS = [
  'Como foi meu desempenho nos últimos 30 dias?',
  'Quais pacientes estão parados no funil?',
  'Tem algum paciente que faltou recentemente?',
]

export default function AssistantPage() {
  const { toast } = useToast()
  const { confirm, ConfirmDialogComponent } = useConfirm()
  const [messages, setMessages] = useState<AssistantMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

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
  }, [messages])

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
    <div className="space-y-4 flex flex-col h-full">
      <PageHeader title="Assistente IA" description="Seu braço direito para decisões da clínica">
        {messages.length > 0 && (
          <Button variant="outline" size="sm" onClick={handleClear}>
            <Trash2 className="h-4 w-4 mr-2" />
            Limpar conversa
          </Button>
        )}
      </PageHeader>

      <Card className="flex-1 flex flex-col overflow-hidden min-h-[520px]">
        <CardContent className="p-0 flex-1 flex flex-col min-h-0">
          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <PageLoader size="default" message="Carregando conversa..." />
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center px-6">
                  <div className="w-14 h-14 rounded-card bg-primary/8 flex items-center justify-center mb-4">
                    <Sparkle className="h-6 w-6 text-primary" />
                  </div>
                  <h2 className="text-base font-semibold text-foreground mb-1">
                    Converse com o assistente da clínica
                  </h2>
                  <p className="text-sm text-muted-foreground max-w-[420px] mb-4">
                    Diferente do assistente que atende pacientes no WhatsApp, esta IA é só sua: ela
                    acessa os dados da clínica (agendamentos, pacientes, funil, conversas) para
                    ajudar a entender o negócio e tomar decisões.
                  </p>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => send(s)}
                        className="text-xs px-3 py-1.5 rounded-full bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  {messages.map((message) => (
                    <AssistantMessageBubble key={message.id} message={message} />
                  ))}
                  {sending && (
                    <div className="flex gap-2 items-end">
                      <div className="shrink-0 w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                        <Sparkle className="h-3.5 w-3.5" />
                      </div>
                      <div className="rounded-2xl rounded-bl-sm bg-muted px-3.5 py-2.5">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      </div>
                    </div>
                  )}
                </>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}

          <div className="border-t border-border shrink-0 bg-card p-3">
            <div className="flex items-end gap-2">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Pergunte algo sobre sua clínica..."
                rows={1}
                maxLength={2000}
                disabled={sending}
                className="flex-1 resize-none rounded-2xl border border-input bg-background px-4 py-2.5 text-sm placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25 focus-visible:border-primary max-h-[120px]"
              />
              <Button
                type="button"
                size="icon"
                className="shrink-0 rounded-full"
                onClick={handleSend}
                disabled={sending || !text.trim()}
                title="Enviar"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {ConfirmDialogComponent}
    </div>
  )
}
