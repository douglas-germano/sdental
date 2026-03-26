'use client'

export const runtime = 'edge'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { conversationsApi, patientsApi } from '@/lib/api'
import { Conversation, Message } from '@/types'
import { formatDateTime, formatPhone, getStatusColor, getStatusLabel } from '@/lib/utils'
import {
  ArrowLeft, User, Bot, AlertCircle, CheckCircle, RotateCcw,
  Phone, Mail, FileText, Save, X, Edit2, Loader2, Send
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/toast'
import { useConfirm } from '@/hooks/useConfirm'
import { PageLoader } from '@/components/ui/page-loader'

export default function ConversationDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()
  const { confirm, ConfirmDialogComponent } = useConfirm()
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [loading, setLoading] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Manual message
  const [manualMessage, setManualMessage] = useState('')
  const [sendingMessage, setSendingMessage] = useState(false)

  // Patient editing state
  const [isEditing, setIsEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [patientForm, setPatientForm] = useState({
    name: '',
    phone: '',
    email: '',
    notes: ''
  })

  const fetchConversation = async () => {
    try {
      const response = await conversationsApi.get(params.id as string)
      setConversation(response.data)

      if (response.data.patient) {
        if (!response.data.patient.id || !response.data.patient.name) {
          setPatientForm({
            name: '',
            phone: response.data.phone_number || '',
            email: '',
            notes: ''
          })
        } else {
          setPatientForm({
            name: response.data.patient.name || '',
            phone: response.data.patient.phone || '',
            email: response.data.patient.email || '',
            notes: response.data.patient.notes || ''
          })
        }
      } else if (response.data.phone_number) {
        setPatientForm({
          name: '',
          phone: response.data.phone_number,
          email: '',
          notes: ''
        })
      }
    } catch (error) {
      console.error('Error fetching conversation:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchConversation()
  }, [params.id])

  // Scroll to bottom when messages change
  useEffect(() => {
    if (conversation?.messages && conversation.messages.length > 0) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      }, 100)
    }
  }, [conversation?.messages])

  const handleResolve = async () => {
    const confirmed = await confirm({
      title: 'Finalizar Conversa',
      description: 'Tem certeza que deseja marcar esta conversa como resolvida?',
      confirmText: 'Sim, finalizar',
      cancelText: 'Cancelar',
    })
    if (!confirmed) return

    try {
      await conversationsApi.resolve(params.id as string)
      toast({ title: 'Conversa finalizada', variant: 'success' })
      fetchConversation()
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
        await conversationsApi.reactivate(params.id as string)
        toast({ title: 'IA reativada', variant: 'success' })
      } else {
        await conversationsApi.transfer(params.id as string, 'Pausado manualmente pelo usuario')
        toast({ title: 'IA pausada', variant: 'success' })
      }
      fetchConversation()
    } catch (error) {
      console.error('Error toggling AI:', error)
      toast({ title: 'Erro ao alterar status da IA', variant: 'error' })
    }
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!manualMessage.trim() || sendingMessage) return

    setSendingMessage(true)
    try {
      await conversationsApi.sendMessage(params.id as string, manualMessage.trim())
      setManualMessage('')
      toast({ title: 'Mensagem enviada', variant: 'success' })
      fetchConversation()
    } catch (error) {
      console.error('Error sending message:', error)
      toast({ title: 'Erro ao enviar mensagem', description: 'Verifique se o WhatsApp esta conectado.', variant: 'error' })
    } finally {
      setSendingMessage(false)
    }
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
      await conversationsApi.linkPatient(params.id as string, {
        name: patientForm.name,
        phone: patientForm.phone || undefined,
        email: patientForm.email || undefined,
        notes: patientForm.notes || undefined
      })
      setIsEditing(false)
      toast({ title: 'Paciente cadastrado', variant: 'success' })
      fetchConversation()
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

  // Group messages by day for date separators
  const getMessageGroups = (messages: Message[]) => {
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
        groups.push({
          date: dateKey,
          label: formatGroupDate(msg.timestamp),
          messages: [msg]
        })
      } else {
        groups[groups.length - 1].messages.push(msg)
      }
    })

    return groups
  }

  if (loading) {
    return <PageLoader />
  }

  if (!conversation) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Conversa nao encontrada</p>
        <Button variant="link" onClick={() => router.back()}>
          Voltar
        </Button>
      </div>
    )
  }

  const messageGroups = getMessageGroups(conversation.messages || [])

  return (
    <div className="space-y-8">
      {/* Header - Responsive */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Button variant="ghost" size="icon-sm" onClick={() => router.back()} className="shrink-0 rounded-lg">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="h-11 w-11 shrink-0 rounded-full bg-gradient-primary flex items-center justify-center text-white font-semibold text-base">
            {conversation.patient?.name?.charAt(0).toUpperCase() || '?'}
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold truncate">
              {conversation.patient?.name || 'Paciente Desconhecido'}
            </h1>
            <p className="text-sm text-muted-foreground">
              {formatPhone(conversation.phone_number)}
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3 sm:shrink-0">
          <div className="flex items-center gap-2 bg-muted/30 px-3 py-1.5 rounded-full border border-border/60">
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
          <Badge className={cn(getStatusColor(conversation.status))} size="lg">
            {getStatusLabel(conversation.status)}
          </Badge>
        </div>
      </div>

      {/* Transferred Alert */}
      {conversation.status === 'transferred_to_human' && (
        <Card className="bg-warning/5 border-warning/20">
          <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 shrink-0 rounded-xl bg-warning/15 flex items-center justify-center">
                <AlertCircle className="h-5 w-5 text-warning" />
              </div>
              <div>
                <p className="font-semibold text-warning text-sm">Aguardando Atencao Humana</p>
                {conversation.transfers && conversation.transfers.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Motivo: {conversation.transfers[0].reason}
                  </p>
                )}
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" size="sm" onClick={handleReactivate} className="gap-2">
                <RotateCcw className="h-3.5 w-3.5" />
                Devolver ao Bot
              </Button>
              <Button variant="success" size="sm" onClick={handleResolve} className="gap-2">
                <CheckCircle className="h-3.5 w-3.5" />
                Resolvido
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {conversation.status === 'active' && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={handleResolve} className="gap-2">
            <CheckCircle className="h-3.5 w-3.5" />
            Finalizar Conversa
          </Button>
        </div>
      )}

      {/* Patient Info */}
      <Card className="border-border/60">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2.5 text-base">
              <div className="h-7 w-7 rounded-lg bg-primary/8 flex items-center justify-center">
                <User className="h-3.5 w-3.5 text-primary" />
              </div>
              Informacoes do Paciente
            </CardTitle>
            {conversation.patient && !isEditing && (
              <Button variant="outline" size="sm" onClick={() => setIsEditing(true)} className="gap-2">
                <Edit2 className="h-3.5 w-3.5" />
                Editar
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {conversation.patient ? (
            isEditing ? (
              <div className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nome</Label>
                    <Input id="name" value={patientForm.name} onChange={(e) => setPatientForm({ ...patientForm, name: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Telefone</Label>
                    <Input id="phone" value={patientForm.phone} onChange={(e) => setPatientForm({ ...patientForm, phone: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" value={patientForm.email} onChange={(e) => setPatientForm({ ...patientForm, email: e.target.value })} />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="notes">Observacoes</Label>
                    <Input id="notes" value={patientForm.notes} onChange={(e) => setPatientForm({ ...patientForm, notes: e.target.value })} />
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-4 border-t border-border/40">
                  <Button variant="outline" onClick={handleCancelEdit} disabled={saving} className="gap-2">
                    <X className="h-4 w-4" />
                    Cancelar
                  </Button>
                  <Button onClick={handleSavePatient} disabled={saving || !patientForm.name || !patientForm.phone} loading={saving} className="gap-2">
                    <Save className="h-4 w-4" />
                    Salvar
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-muted/30 p-3 rounded-xl border border-border/40">
                  <p className="text-xs text-muted-foreground mb-1">Nome</p>
                  <p className="text-sm font-medium truncate">{conversation.patient.name}</p>
                </div>
                <div className="bg-muted/30 p-3 rounded-xl border border-border/40">
                  <p className="text-xs text-muted-foreground mb-1">Telefone</p>
                  <p className="text-sm font-medium">{formatPhone(conversation.patient.phone)}</p>
                </div>
                <div className="bg-muted/30 p-3 rounded-xl border border-border/40">
                  <p className="text-xs text-muted-foreground mb-1">Email</p>
                  <p className="text-sm font-medium truncate">{conversation.patient.email || '-'}</p>
                </div>
                <div className="bg-muted/30 p-3 rounded-xl border border-border/40">
                  <p className="text-xs text-muted-foreground mb-1">Observacoes</p>
                  <p className="text-sm font-medium truncate">{conversation.patient.notes || '-'}</p>
                </div>
              </div>
            )
          ) : (
            isEditing ? (
              <div className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nome *</Label>
                    <Input id="name" value={patientForm.name} onChange={(e) => setPatientForm({ ...patientForm, name: e.target.value })} placeholder="Nome do paciente" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Telefone</Label>
                    <Input id="phone" value={patientForm.phone || conversation.phone_number} onChange={(e) => setPatientForm({ ...patientForm, phone: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" value={patientForm.email} onChange={(e) => setPatientForm({ ...patientForm, email: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="notes">Observacoes</Label>
                    <Input id="notes" value={patientForm.notes} onChange={(e) => setPatientForm({ ...patientForm, notes: e.target.value })} />
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-4 border-t border-border/40">
                  <Button variant="outline" onClick={() => setIsEditing(false)} disabled={saving} className="gap-2">
                    <X className="h-4 w-4" />
                    Cancelar
                  </Button>
                  <Button onClick={handleCreatePatient} disabled={saving || !patientForm.name} loading={saving} className="gap-2">
                    <Save className="h-4 w-4" />
                    Criar Paciente
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center py-6">
                <div className="h-12 w-12 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-3">
                  <User className="h-6 w-6 text-muted-foreground/50" />
                </div>
                <p className="text-sm text-muted-foreground mb-3">Paciente nao identificado</p>
                <Button variant="outline" size="sm" onClick={() => setIsEditing(true)} className="gap-2">
                  <User className="h-3.5 w-3.5" />
                  Cadastrar Paciente
                </Button>
              </div>
            )
          )}
        </CardContent>
      </Card>

      {/* Messages */}
      <Card className="border-border/60">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2.5 text-base">
            <div className="h-7 w-7 rounded-lg bg-primary/8 flex items-center justify-center">
              <Bot className="h-3.5 w-3.5 text-primary" />
            </div>
            Historico da Conversa
            {conversation.messages && (
              <span className="text-xs text-muted-foreground font-normal ml-1">
                ({conversation.messages.length} mensagens)
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[500px] overflow-y-auto px-6 pb-4 scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
            {(!conversation.messages || conversation.messages.length === 0) ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <div className="h-14 w-14 rounded-2xl bg-muted/40 flex items-center justify-center mb-3">
                  <Bot className="h-7 w-7 opacity-40" />
                </div>
                <p className="font-medium text-sm">Nenhuma mensagem nesta conversa</p>
              </div>
            ) : (
              <div className="space-y-4">
                {messageGroups.map((group) => (
                  <div key={group.date}>
                    {/* Date separator */}
                    <div className="flex items-center gap-3 my-5">
                      <div className="flex-1 h-px bg-border/50" />
                      <span className="text-2xs font-medium text-muted-foreground bg-card px-2">
                        {group.label}
                      </span>
                      <div className="flex-1 h-px bg-border/50" />
                    </div>

                    {/* Messages for this day */}
                    <div className="space-y-3">
                      {group.messages.map((msg, index) => (
                        <div
                          key={index}
                          className={cn(
                            'flex gap-2.5',
                            msg.role === 'assistant' ? 'flex-row' : 'flex-row-reverse'
                          )}
                        >
                          <div
                            className={cn(
                              'shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
                              msg.role === 'assistant'
                                ? 'bg-primary/10 text-primary'
                                : 'bg-muted text-muted-foreground'
                            )}
                          >
                            {msg.role === 'assistant' ? (
                              <Bot className="h-3.5 w-3.5" />
                            ) : (
                              <User className="h-3.5 w-3.5" />
                            )}
                          </div>
                          <div
                            className={cn(
                              'max-w-[75%] rounded-2xl px-3.5 py-2.5',
                              msg.role === 'assistant'
                                ? 'bg-muted/50 rounded-tl-md'
                                : 'bg-primary/8 rounded-tr-md'
                            )}
                          >
                            <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
                            <p className="text-2xs text-muted-foreground mt-1.5">
                              {new Date(msg.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Send message input */}
          {conversation.status !== 'completed' && (
            <form onSubmit={handleSendMessage} className="border-t border-border/40 p-4 flex gap-3">
              <Input
                value={manualMessage}
                onChange={(e) => setManualMessage(e.target.value)}
                placeholder="Enviar mensagem via WhatsApp..."
                disabled={sendingMessage}
                className="flex-1"
              />
              <Button
                type="submit"
                disabled={sendingMessage || !manualMessage.trim()}
                size="icon"
                className="shrink-0 rounded-xl"
              >
                {sendingMessage ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      {ConfirmDialogComponent}
    </div>
  )
}
