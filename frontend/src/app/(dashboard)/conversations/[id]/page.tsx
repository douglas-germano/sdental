'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { conversationsApi } from '@/lib/api'
import { Conversation, Message } from '@/types'
import { formatDateTime, formatPhone, getStatusColor, getStatusLabel } from '@/lib/utils'
import { ArrowLeft, User, Bot, AlertCircle, CheckCircle, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function ConversationDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchConversation = async () => {
    try {
      const response = await conversationsApi.get(params.id as string)
      setConversation(response.data)
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
    try {
      await conversationsApi.reactivate(params.id as string)
      fetchConversation()
    } catch (error) {
      console.error('Error reactivating conversation:', error)
    }
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">
            {conversation.patient?.name || 'Paciente Desconhecido'}
          </h1>
          <p className="text-muted-foreground">
            {formatPhone(conversation.phone_number)}
          </p>
        </div>
        <Badge className={cn(getStatusColor(conversation.status), 'text-base px-4 py-2')}>
          {getStatusLabel(conversation.status)}
        </Badge>
      </div>

      {/* Actions */}
      {conversation.status === 'transferred_to_human' && (
        <Card className="bg-orange-50 border-orange-200">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-orange-600" />
              <div>
                <p className="font-medium text-orange-800">Aguardando Atencao Humana</p>
                {conversation.transfers && conversation.transfers.length > 0 && (
                  <p className="text-sm text-orange-600">
                    Motivo: {conversation.transfers[0].reason}
                  </p>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleReactivate}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Devolver ao Bot
              </Button>
              <Button onClick={handleResolve}>
                <CheckCircle className="h-4 w-4 mr-2" />
                Marcar Resolvido
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {conversation.status === 'active' && (
        <div className="flex justify-end">
          <Button variant="outline" onClick={handleResolve}>
            <CheckCircle className="h-4 w-4 mr-2" />
            Finalizar Conversa
          </Button>
        </div>
      )}

      {/* Messages */}
      <Card>
        <CardHeader>
          <CardTitle>Historico da Conversa</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 max-h-[600px] overflow-y-auto">
            {(!conversation.messages || conversation.messages.length === 0) ? (
              <p className="text-center text-muted-foreground py-8">
                Nenhuma mensagem nesta conversa
              </p>
            ) : (
              conversation.messages.map((msg, index) => (
                <div
                  key={index}
                  className={cn(
                    'flex gap-3',
                    msg.role === 'assistant' ? 'flex-row' : 'flex-row-reverse'
                  )}
                >
                  <div
                    className={cn(
                      'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
                      msg.role === 'assistant'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-gray-200'
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
                      'max-w-[70%] rounded-lg p-3',
                      msg.role === 'assistant'
                        ? 'bg-primary/10'
                        : 'bg-gray-100'
                    )}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDateTime(msg.timestamp)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Patient Info */}
      {conversation.patient && (
        <Card>
          <CardHeader>
            <CardTitle>Informacoes do Paciente</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-sm text-muted-foreground">Nome</dt>
                <dd className="font-medium">{conversation.patient.name}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">Telefone</dt>
                <dd className="font-medium">{formatPhone(conversation.patient.phone)}</dd>
              </div>
              {conversation.patient.email && (
                <div>
                  <dt className="text-sm text-muted-foreground">Email</dt>
                  <dd className="font-medium">{conversation.patient.email}</dd>
                </div>
              )}
              {conversation.patient.notes && (
                <div className="col-span-2">
                  <dt className="text-sm text-muted-foreground">Observacoes</dt>
                  <dd className="font-medium">{conversation.patient.notes}</dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
