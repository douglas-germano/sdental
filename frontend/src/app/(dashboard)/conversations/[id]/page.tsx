'use client'

export const runtime = 'edge'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { conversationsApi, patientsApi } from '@/lib/api'
import { Conversation, Message } from '@/types'
import { formatPhone, getStatusColor, getStatusLabel } from '@/lib/utils'
import {
  ArrowLeft, User, AlertCircle, CheckCircle, RotateCcw,
  Save, X, Edit2, Info, ChevronDown
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/toast'
import { useConfirm } from '@/hooks/useConfirm'
import { PageLoader } from '@/components/ui/page-loader'
import { MessageBubble } from '@/components/conversations/message-bubble'
import { TypingIndicator } from '@/components/conversations/typing-indicator'
import { ChatComposer, MediaPayload } from '@/components/conversations/chat-composer'
import { useConversations } from '@/components/conversations/conversations-provider'

function getMessageGroups(messages: Message[]) {
  const groups: { date: string; label: string; messages: Message[] }[] = []
  let currentDate = ''

  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  const formatGroupDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const dateKey = date.toLocaleDateString('pt-BR')

    if (dateKey === today.toLocaleDateString('pt-BR')) return 'Hoje'
    if (dateKey === yesterday.toLocaleDateString('pt-BR')) return 'Ontem'
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
  }

  messages.forEach((msg) => {
    const dateKey = new Date(msg.timestamp).toLocaleDateString('pt-BR')
    if (dateKey !== currentDate) {
      currentDate = dateKey
      groups.push({ date: dateKey, label: formatGroupDate(msg.timestamp), messages: [msg] })
    } else {
      groups[groups.length - 1].messages.push(msg)
    }
  })

  return groups
}

export default function ConversationDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()
  const { confirm, ConfirmDialogComponent } = useConfirm()
  const { subscribe, typingConversationIds, refresh: refreshList } = useConversations()

  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [loading, setLoading] = useState(true)
  const [showInfo, setShowInfo] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const conversationId = params.id as string

  const [isEditing, setIsEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [patientForm, setPatientForm] = useState({ name: '', phone: '', email: '', notes: '' })

  const fetchConversation = useCallback(async () => {
    try {
      const response = await conversationsApi.get(conversationId)
      setConversation(response.data)

      const patient = response.data.patient
      setPatientForm({
        name: patient?.name || '',
        phone: patient?.phone || response.data.phone_number || '',
        email: patient?.email || '',
        notes: patient?.notes || ''
      })
    } catch (error) {
      console.error('Error fetching conversation:', error)
      setConversation(null)
    } finally {
      setLoading(false)
    }
  }, [conversationId])

  useEffect(() => {
    setLoading(true)
    setShowInfo(false)
    setIsEditing(false)
    fetchConversation()
  }, [fetchConversation])

  // Live-append messages/status updates for this conversation via SSE
  useEffect(() => {
    const unsubscribe = subscribe((event) => {
      if (event.type === 'new_message') {
        const conversationIdInEvent = event.payload.conversation_id as string
        if (conversationIdInEvent !== conversationId) return
        const message = event.payload.message as Message
        const status = event.payload.conversation_status as string
        setConversation((prev) => {
          if (!prev) return prev
          if (prev.messages?.some((m) => m.id === message.id)) return prev
          return { ...prev, status: status as Conversation['status'], messages: [...(prev.messages || []), message] }
        })
      }

      if (event.type === 'message_status') {
        const conversationIdInEvent = event.payload.conversation_id as string
        if (conversationIdInEvent !== conversationId) return
        const messageId = event.payload.message_id as string
        const status = event.payload.status as string
        setConversation((prev) => {
          if (!prev?.messages) return prev
          return {
            ...prev,
            messages: prev.messages.map((m) => (m.id === messageId ? { ...m, status: status as Message['status'] } : m))
          }
        })
      }
    })
    return unsubscribe
  }, [subscribe, conversationId])

  useEffect(() => {
    if (conversation?.messages && conversation.messages.length > 0) {
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    }
  }, [conversation?.messages])

  const isTyping = typingConversationIds.has(conversationId)

  const handleResolve = async () => {
    const confirmed = await confirm({
      title: 'Finalizar Conversa',
      description: 'Tem certeza que deseja marcar esta conversa como resolvida?',
      confirmText: 'Sim, finalizar',
      cancelText: 'Cancelar',
    })
    if (!confirmed) return

    try {
      await conversationsApi.resolve(conversationId)
      toast({ title: 'Conversa finalizada', variant: 'success' })
      fetchConversation()
      refreshList()
    } catch (error) {
      console.error('Error resolving conversation:', error)
      toast({ title: 'Erro ao finalizar conversa', variant: 'error' })
    }
  }

  const handleReactivate = async () => {
    const confirmed = await confirm({
      title: 'Reativar Conversa',
      description: 'A IA voltara a responder automaticamente nesta conversa.',
      confirmText: 'Sim, reativar',
      cancelText: 'Cancelar',
    })
    if (!confirmed) return
    await toggleAI(true)
  }

  const toggleAI = async (active: boolean) => {
    try {
      if (active) {
        await conversationsApi.reactivate(conversationId)
        toast({ title: 'IA reativada', variant: 'success' })
      } else {
        await conversationsApi.transfer(conversationId, 'Pausado manualmente pelo usuario')
        toast({ title: 'IA pausada', variant: 'success' })
      }
      fetchConversation()
      refreshList()
    } catch (error) {
      console.error('Error toggling AI:', error)
      toast({ title: 'Erro ao alterar status da IA', variant: 'error' })
    }
  }

  const handleSendText = async (text: string) => {
    await conversationsApi.sendMessage(conversationId, text)
    fetchConversation()
  }

  const handleSendMedia = async (payload: MediaPayload) => {
    await conversationsApi.sendMedia(conversationId, payload)
    fetchConversation()
  }

  const handleSavePatient = async () => {
    if (!conversation?.patient?.id) return

    setSaving(true)
    try {
      await patientsApi.update(conversation.patient.id, {
        name: patientForm.name,
        phone: patientForm.phone,
        email: patientForm.email || undefined,
        notes: patientForm.notes || undefined
      })
      setIsEditing(false)
      toast({ title: 'Paciente atualizado', variant: 'success' })
      fetchConversation()
    } catch (error: unknown) {
      console.error('Error saving patient:', error)
      const err = error as { response?: { status?: number } }

      if (err?.response?.status === 404) {
        const shouldCreate = await confirm({
          title: 'Paciente nao encontrado',
          description: 'O paciente vinculado a esta conversa nao foi encontrado. Deseja criar um novo com estes dados?',
          confirmText: 'Criar paciente',
          cancelText: 'Cancelar',
        })
        if (shouldCreate) {
          handleCreatePatient()
          return
        }
      }

      toast({ title: 'Erro ao salvar paciente', variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const handleCreatePatient = async () => {
    if (!patientForm.name) return

    setSaving(true)
    try {
      await conversationsApi.linkPatient(conversationId, {
        name: patientForm.name,
        phone: patientForm.phone || undefined,
        email: patientForm.email || undefined,
        notes: patientForm.notes || undefined
      })
      setIsEditing(false)
      toast({ title: 'Paciente cadastrado', variant: 'success' })
      fetchConversation()
      refreshList()
    } catch (error) {
      console.error('Error creating patient:', error)
      toast({ title: 'Erro ao criar paciente', variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const handleCancelEdit = () => {
    if (conversation?.patient) {
      setPatientForm({
        name: conversation.patient.name || '',
        phone: conversation.patient.phone || '',
        email: conversation.patient.email || '',
        notes: conversation.patient.notes || ''
      })
    }
    setIsEditing(false)
  }

  if (loading) {
    return <div className="flex-1 flex items-center justify-center"><PageLoader /></div>
  }

  if (!conversation) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
        <p className="text-muted-foreground">Conversa nao encontrada</p>
        <Button variant="outline" onClick={() => router.push('/conversations')}>Voltar</Button>
      </div>
    )
  }

  const messageGroups = getMessageGroups(conversation.messages || [])

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0 bg-card">
        <Button variant="ghost" size="icon-sm" onClick={() => router.push('/conversations')} className="lg:hidden shrink-0 rounded-full">
          <ArrowLeft className="h-5 w-5" />
        </Button>

        <button
          onClick={() => setShowInfo((v) => !v)}
          className="flex items-center gap-3 flex-1 min-w-0 text-left"
        >
          <div className="h-10 w-10 shrink-0 rounded-full bg-gradient-primary flex items-center justify-center text-white font-semibold text-sm">
            {conversation.patient?.name?.charAt(0).toUpperCase() || '?'}
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold truncate">
              {conversation.patient?.name || 'Paciente Desconhecido'}
            </h1>
            <p className="text-xs text-muted-foreground truncate">
              {isTyping ? <span className="text-primary font-medium">digitando...</span> : formatPhone(conversation.phone_number)}
            </p>
          </div>
        </button>

        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden sm:flex items-center gap-1.5 bg-muted/30 px-2.5 py-1 rounded-full border border-border">
            <Switch
              id="ai-toggle"
              checked={conversation.status === 'active'}
              onCheckedChange={toggleAI}
              className="scale-75"
            />
            <Label htmlFor="ai-toggle" className="text-xs font-medium cursor-pointer text-muted-foreground whitespace-nowrap">
              {conversation.status === 'active' ? 'IA Ativa' : 'IA Pausada'}
            </Label>
          </div>
          <Badge className={cn(getStatusColor(conversation.status))} size="sm">
            {getStatusLabel(conversation.status)}
          </Badge>
          <Button variant="ghost" size="icon-sm" onClick={() => setShowInfo((v) => !v)} className="rounded-full" title="Informacoes do paciente">
            <Info className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Transferred alert / resolve bar */}
      {conversation.status === 'transferred_to_human' && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 bg-warning/5 border-b border-warning/20 shrink-0">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="h-4 w-4 text-warning shrink-0" />
            <div>
              <p className="font-semibold text-warning text-xs">Aguardando Atencao Humana</p>
              {conversation.transfers && conversation.transfers.length > 0 && (
                <p className="text-[11px] text-muted-foreground">Motivo: {conversation.transfers[0].reason}</p>
              )}
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={handleReactivate} className="gap-1.5 h-7 text-xs">
              <RotateCcw className="h-3 w-3" />
              Devolver ao Bot
            </Button>
            <Button variant="success" size="sm" onClick={handleResolve} className="gap-1.5 h-7 text-xs">
              <CheckCircle className="h-3 w-3" />
              Resolvido
            </Button>
          </div>
        </div>
      )}

      {/* Collapsible patient info panel */}
      {showInfo && (
        <div className="border-b border-border shrink-0 bg-muted/20 px-4 py-4 max-h-[45%] overflow-y-auto scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <User className="h-3.5 w-3.5" /> Informacoes do Paciente
            </p>
            <div className="flex items-center gap-2">
              {conversation.patient && !isEditing && (
                <Button variant="outline" size="sm" onClick={() => setIsEditing(true)} className="gap-1.5 h-7 text-xs">
                  <Edit2 className="h-3 w-3" /> Editar
                </Button>
              )}
              <Button variant="ghost" size="icon-sm" onClick={() => setShowInfo(false)} className="rounded-full h-7 w-7">
                <ChevronDown className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {conversation.patient && !isEditing ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="bg-background p-2.5 rounded-lg border border-border/60">
                <p className="text-[10px] text-muted-foreground mb-0.5">Nome</p>
                <p className="text-xs font-medium truncate">{conversation.patient.name}</p>
              </div>
              <div className="bg-background p-2.5 rounded-lg border border-border/60">
                <p className="text-[10px] text-muted-foreground mb-0.5">Telefone</p>
                <p className="text-xs font-medium">{formatPhone(conversation.patient.phone)}</p>
              </div>
              <div className="bg-background p-2.5 rounded-lg border border-border/60">
                <p className="text-[10px] text-muted-foreground mb-0.5">Email</p>
                <p className="text-xs font-medium truncate">{conversation.patient.email || '-'}</p>
              </div>
              <div className="bg-background p-2.5 rounded-lg border border-border/60">
                <p className="text-[10px] text-muted-foreground mb-0.5">Observacoes</p>
                <p className="text-xs font-medium truncate">{conversation.patient.notes || '-'}</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="name" size="sm">Nome {!conversation.patient && '*'}</Label>
                  <Input id="name" value={patientForm.name} onChange={(e) => setPatientForm({ ...patientForm, name: e.target.value })} placeholder="Nome do paciente" className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone" size="sm">Telefone</Label>
                  <Input id="phone" value={patientForm.phone} onChange={(e) => setPatientForm({ ...patientForm, phone: e.target.value })} className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email" size="sm">Email</Label>
                  <Input id="email" type="email" value={patientForm.email} onChange={(e) => setPatientForm({ ...patientForm, email: e.target.value })} className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="notes" size="sm">Observacoes</Label>
                  <Input id="notes" value={patientForm.notes} onChange={(e) => setPatientForm({ ...patientForm, notes: e.target.value })} className="h-8 text-sm" />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={conversation.patient ? handleCancelEdit : () => setIsEditing(false)} disabled={saving} className="gap-1.5 h-7 text-xs">
                  <X className="h-3 w-3" /> Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={conversation.patient ? handleSavePatient : handleCreatePatient}
                  disabled={saving || !patientForm.name || (!conversation.patient && !patientForm.name)}
                  loading={saving}
                  className="gap-1.5 h-7 text-xs"
                >
                  <Save className="h-3 w-3" /> {conversation.patient ? 'Salvar' : 'Criar Paciente'}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent bg-[radial-gradient(circle_at_1px_1px,hsl(var(--muted-foreground)/0.08)_1px,transparent_0)] bg-[size:20px_20px]">
        {(!conversation.messages || conversation.messages.length === 0) ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
            <p className="text-sm">Nenhuma mensagem nesta conversa</p>
          </div>
        ) : (
          <div className="space-y-4">
            {messageGroups.map((group) => (
              <div key={group.date}>
                <div className="flex items-center justify-center my-3">
                  <span className="text-[10px] font-medium text-muted-foreground bg-card border border-border/60 rounded-full px-3 py-1">
                    {group.label}
                  </span>
                </div>
                <div className="space-y-2">
                  {group.messages.map((msg, index) => (
                    <MessageBubble key={msg.id || index} message={msg} />
                  ))}
                </div>
              </div>
            ))}
            {isTyping && <TypingIndicator />}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Composer */}
      {conversation.status !== 'completed' ? (
        <ChatComposer onSendText={handleSendText} onSendMedia={handleSendMedia} />
      ) : (
        <div className="border-t border-border p-3 text-center text-xs text-muted-foreground shrink-0">
          Esta conversa foi concluida.
        </div>
      )}

      {ConfirmDialogComponent}
    </div>
  )
}
