'use client'

export const runtime = 'edge'

import { useEffect, useState } from 'react'
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
  Phone, Mail, FileText, Save, X, Edit2, Loader2
} from 'lucide-react'
import { cn } from '@/lib/utils'

export default function ConversationDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [loading, setLoading] = useState(true)

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
      // Initialize form with patient data
      if (response.data.patient) {
        setPatientForm({
          name: response.data.patient.name || '',
          phone: response.data.patient.phone || '',
          email: response.data.patient.email || '',
          notes: response.data.patient.notes || ''
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

  const handleResolve = async () => {
    if (!confirm('Marcar conversa como resolvida?')) return
    try {
      await conversationsApi.resolve(params.id as string)
      fetchConversation()
    } catch (error) {
      console.error('Error resolving conversation:', error)
    }
  }

  const handleReactivate = async () => {
    if (!confirm('Reativar conversa para o bot?')) return
    await toggleAI(true)
  }

  const toggleAI = async (active: boolean) => {
    try {
      if (active) {
        await conversationsApi.reactivate(params.id as string)
      } else {
        await conversationsApi.transfer(params.id as string, 'Pausado manualmente pelo usuário')
      }
      fetchConversation()
    } catch (error) {
      console.error('Error toggling AI:', error)
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
      fetchConversation()
    } catch (error) {
      console.error('Error saving patient:', error)
      alert('Erro ao salvar dados do paciente')
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
      fetchConversation()
    } catch (error) {
      console.error('Error creating patient:', error)
      alert('Erro ao criar paciente')
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
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
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

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-xl">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="h-12 w-12 rounded-full bg-gradient-primary flex items-center justify-center text-white font-semibold text-lg">
          {conversation.patient?.name?.charAt(0).toUpperCase() || '?'}
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">
            {conversation.patient?.name || 'Paciente Desconhecido'}
          </h1>
          <p className="text-muted-foreground">
            {formatPhone(conversation.phone_number)}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-muted/30 px-3 py-1.5 rounded-full border border-border/50">
            <Switch
              id="ai-toggle"
              checked={conversation.status === 'active'}
              onCheckedChange={toggleAI}
              className="scale-75"
            />
            <Label htmlFor="ai-toggle" className="text-xs font-medium cursor-pointer text-muted-foreground">
              {conversation.status === 'active' ? 'IA Ativa' : 'IA Pausada'}
            </Label>
          </div>
          <Badge className={cn(getStatusColor(conversation.status))} size="lg">
            {getStatusLabel(conversation.status)}
          </Badge>
        </div>
      </div>

      {/* Actions */}
      {conversation.status === 'transferred_to_human' && (
        <Card className="bg-warning/10 border-warning/30">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-warning/20 flex items-center justify-center">
                <AlertCircle className="h-5 w-5 text-warning" />
              </div>
              <div>
                <p className="font-semibold text-warning">Aguardando Atencao Humana</p>
                {conversation.transfers && conversation.transfers.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    Motivo: {conversation.transfers[0].reason}
                  </p>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleReactivate} className="gap-2">
                <RotateCcw className="h-4 w-4" />
                Devolver ao Bot
              </Button>
              <Button variant="success" onClick={handleResolve} className="gap-2">
                <CheckCircle className="h-4 w-4" />
                Marcar Resolvido
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {conversation.status === 'active' && (
        <div className="flex justify-end">
          <Button variant="outline" onClick={handleResolve} className="gap-2">
            <CheckCircle className="h-4 w-4" />
            Finalizar Conversa
          </Button>
        </div>
      )}

      {/* Patient Info - Editable */}
      <Card className="border-border/50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-primary flex items-center justify-center">
                <User className="h-4 w-4 text-white" />
              </div>
              Informações do Paciente
            </CardTitle>
            {conversation.patient && !isEditing && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(true)}
                className="gap-2"
              >
                <Edit2 className="h-4 w-4" />
                Editar
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {conversation.patient ? (
            isEditing ? (
              // Edit Mode
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name" className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Nome
                    </Label>
                    <Input
                      id="name"
                      value={patientForm.name}
                      onChange={(e) => setPatientForm({ ...patientForm, name: e.target.value })}
                      placeholder="Nome do paciente"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone" className="flex items-center gap-2">
                      <Phone className="h-4 w-4" />
                      Telefone
                    </Label>
                    <Input
                      id="phone"
                      value={patientForm.phone}
                      onChange={(e) => setPatientForm({ ...patientForm, phone: e.target.value })}
                      placeholder="Telefone"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email" className="flex items-center gap-2">
                      <Mail className="h-4 w-4" />
                      Email
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      value={patientForm.email}
                      onChange={(e) => setPatientForm({ ...patientForm, email: e.target.value })}
                      placeholder="email@exemplo.com"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="notes" className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Observações
                    </Label>
                    <Input
                      id="notes"
                      value={patientForm.notes}
                      onChange={(e) => setPatientForm({ ...patientForm, notes: e.target.value })}
                      placeholder="Observações sobre o paciente"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    variant="outline"
                    onClick={handleCancelEdit}
                    disabled={saving}
                    className="gap-2"
                  >
                    <X className="h-4 w-4" />
                    Cancelar
                  </Button>
                  <Button
                    onClick={handleSavePatient}
                    disabled={saving || !patientForm.name || !patientForm.phone}
                    className="gap-2 bg-primary hover:bg-primary/90"
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    Salvar
                  </Button>
                </div>
              </div>
            ) : (
              // View Mode
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1 bg-muted/30 p-3 rounded-xl border border-border/50">
                  <Label className="flex items-center gap-2 text-muted-foreground">
                    <User className="h-4 w-4" />
                    Nome
                  </Label>
                  <p className="font-medium">{conversation.patient.name}</p>
                </div>
                <div className="space-y-1 bg-muted/30 p-3 rounded-xl border border-border/50">
                  <Label className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-4 w-4" />
                    Telefone
                  </Label>
                  <p className="font-medium">{formatPhone(conversation.patient.phone)}</p>
                </div>
                <div className="space-y-1 bg-muted/30 p-3 rounded-xl border border-border/50">
                  <Label className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="h-4 w-4" />
                    Email
                  </Label>
                  <p className="font-medium">{conversation.patient.email || '-'}</p>
                </div>
                <div className="space-y-1 bg-muted/30 p-3 rounded-xl border border-border/50">
                  <Label className="flex items-center gap-2 text-muted-foreground">
                    <FileText className="h-4 w-4" />
                    Observações
                  </Label>
                  <p className="font-medium">{conversation.patient.notes || '-'}</p>
                </div>
              </div>
            )
          ) : (
            // No patient - show create form
            isEditing ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name" className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Nome *
                    </Label>
                    <Input
                      id="name"
                      value={patientForm.name}
                      onChange={(e) => setPatientForm({ ...patientForm, name: e.target.value })}
                      placeholder="Nome do paciente"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone" className="flex items-center gap-2">
                      <Phone className="h-4 w-4" />
                      Telefone
                    </Label>
                    <Input
                      id="phone"
                      value={patientForm.phone || conversation.phone_number}
                      onChange={(e) => setPatientForm({ ...patientForm, phone: e.target.value })}
                      placeholder="Telefone"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email" className="flex items-center gap-2">
                      <Mail className="h-4 w-4" />
                      Email
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      value={patientForm.email}
                      onChange={(e) => setPatientForm({ ...patientForm, email: e.target.value })}
                      placeholder="email@exemplo.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="notes" className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Observações
                    </Label>
                    <Input
                      id="notes"
                      value={patientForm.notes}
                      onChange={(e) => setPatientForm({ ...patientForm, notes: e.target.value })}
                      placeholder="Observações"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    variant="outline"
                    onClick={() => setIsEditing(false)}
                    disabled={saving}
                    className="gap-2"
                  >
                    <X className="h-4 w-4" />
                    Cancelar
                  </Button>
                  <Button
                    onClick={handleCreatePatient}
                    disabled={saving || !patientForm.name}
                    className="gap-2 bg-primary hover:bg-primary/90"
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    Criar Paciente
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
                  <User className="h-8 w-8 text-muted-foreground" />
                </div>
                <p className="text-muted-foreground mb-4">Paciente não identificado</p>
                <Button onClick={() => setIsEditing(true)} className="gap-2">
                  <User className="h-4 w-4" />
                  Cadastrar Paciente
                </Button>
              </div>
            )
          )}
        </CardContent>
      </Card>

      {/* Messages */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-primary flex items-center justify-center">
              <Bot className="h-4 w-4 text-white" />
            </div>
            Historico da Conversa
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
            {(!conversation.messages || conversation.messages.length === 0) ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
                  <Bot className="h-8 w-8 opacity-50" />
                </div>
                <p className="font-medium">Nenhuma mensagem nesta conversa</p>
              </div>
            ) : (
              conversation.messages.map((msg, index) => (
                <div
                  key={index}
                  className={cn(
                    'flex gap-3 animate-fade-in',
                    msg.role === 'assistant' ? 'flex-row' : 'flex-row-reverse'
                  )}
                >
                  <div
                    className={cn(
                      'flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center',
                      msg.role === 'assistant'
                        ? 'bg-gradient-primary text-white'
                        : 'bg-muted'
                    )}
                  >
                    {msg.role === 'assistant' ? (
                      <Bot className="h-4 w-4" />
                    ) : (
                      <User className="h-4 w-4" />
                    )}
                  </div>
                  <div
                    className={cn(
                      'max-w-[70%] rounded-2xl px-4 py-3',
                      msg.role === 'assistant'
                        ? 'bg-primary/10 rounded-tl-md'
                        : 'bg-muted rounded-tr-md'
                    )}
                  >
                    <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
                    <p className="text-xs text-muted-foreground mt-2">
                      {formatDateTime(msg.timestamp)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
