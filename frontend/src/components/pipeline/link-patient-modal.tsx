'use client'

import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/toast'
import { patientsApi, pipelineApi, conversationsApi } from '@/lib/api'
import { Loader2, Link2, Search, User, MessageSquare } from 'lucide-react'
import { cn, normalizePhoneForApi } from '@/lib/utils'

interface Patient {
  id: string
  name: string
  phone: string
  email?: string
}

interface ConversationContact {
  phone: string
  lastMessage?: string
}

interface SearchResult {
  type: 'patient' | 'conversation'
  id?: string
  name?: string
  phone: string
  email?: string
  lastMessage?: string
}

interface Stage {
  id: string
  name: string
  color: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  stages: Stage[]
}

export function LinkPatientModal({ open, onOpenChange, onSuccess, stages }: Props) {
  const [loading, setLoading] = useState(false)
  const [searching, setSearching] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null)
  const [selectedStageId, setSelectedStageId] = useState<string>('')
  const { toast } = useToast()

  // Set default stage when modal opens
  useEffect(() => {
    if (open && stages.length > 0 && !selectedStageId) {
      setSelectedStageId(stages[0].id)
    }
  }, [open, stages, selectedStageId])

  // Search patients and conversations
  useEffect(() => {
    if (!open) {
      setSearchTerm('')
      setSearchResults([])
      setSelectedResult(null)
      return
    }

    if (searchTerm.trim().length < 2) {
      setSearchResults([])
      return
    }

    const delaySearch = setTimeout(async () => {
      setSearching(true)
      try {
        const results: SearchResult[] = []

        // Search existing patients
        const patientsResponse = await patientsApi.list({ search: searchTerm, per_page: 20 })
        const patients = patientsResponse.data.patients || []
        patients.forEach((patient: Patient) => {
          results.push({
            type: 'patient',
            id: patient.id,
            name: patient.name,
            phone: patient.phone,
            email: patient.email,
          })
        })

        // Search conversations without patient_id
        const conversationsResponse = await conversationsApi.list({ per_page: 100 })
        const conversations = conversationsResponse.data.conversations || []

        // Filter conversations without patient and match search term
        conversations
          .filter((conv: any) => !conv.patient_id)
          .filter((conv: any) => {
            const phone = conv.phone_number?.toLowerCase() || ''
            const search = searchTerm.toLowerCase()
            return phone.includes(search)
          })
          .forEach((conv: any) => {
            // Get last message
            let lastMessage = 'Sem mensagens'
            if (conv.messages && conv.messages.length > 0) {
              const lastMsg = conv.messages[conv.messages.length - 1]
              lastMessage = lastMsg.content.length > 50
                ? lastMsg.content.substring(0, 50) + '...'
                : lastMsg.content
            }

            results.push({
              type: 'conversation',
              phone: conv.phone_number,
              lastMessage,
            })
          })

        setSearchResults(results)
      } catch (error) {
        console.error('Error searching:', error)
        toast({
          title: 'Erro na busca',
          description: 'Não foi possível buscar contatos.',
          variant: 'error',
        })
      } finally {
        setSearching(false)
      }
    }, 300)

    return () => clearTimeout(delaySearch)
  }, [searchTerm, open, toast])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedResult) {
      toast({
        title: 'Selecione um contato',
        description: 'Por favor, selecione um paciente ou contato da lista.',
        variant: 'error',
      })
      return
    }

    if (!selectedStageId) {
      toast({
        title: 'Selecione um estágio',
        description: 'Por favor, selecione o estágio.',
        variant: 'error',
      })
      return
    }

    setLoading(true)

    try {
      let patientId: string

      // If it's a conversation contact, create patient first
      if (selectedResult.type === 'conversation') {
        const normalizedPhone = normalizePhoneForApi(selectedResult.phone)
        try {
          // Create patient with pipeline stage in a single call
          const patientResponse = await patientsApi.create({
            name: selectedResult.phone, // Use phone as name initially
            phone: normalizedPhone,
            pipeline_stage_id: selectedStageId,
          })
          patientId = patientResponse.data.patient?.id || patientResponse.data.id

          toast({
            title: 'Paciente criado',
            description: 'Contato transformado em paciente e vinculado ao pipeline.',
            variant: 'success',
          })
        } catch (createError: any) {
          // If patient already exists (409), try to find it and move to stage
          if (createError?.response?.status === 409) {
            toast({
              title: 'Paciente já existe',
              description: 'Buscando paciente existente com este telefone...',
              variant: 'warning',
            })

            // Search for existing patient by phone
            const searchResponse = await patientsApi.list({ search: normalizedPhone, per_page: 1 })
            const existingPatient = searchResponse.data.patients?.[0]

            if (existingPatient) {
              patientId = existingPatient.id
              // Move existing patient to selected stage
              await pipelineApi.movePatient(patientId, selectedStageId)
            } else {
              throw new Error('Paciente já existe mas não foi possível encontrá-lo.')
            }
          } else {
            throw createError
          }
        }
      } else {
        // It's already a patient, just move to stage
        patientId = selectedResult.id!
        await pipelineApi.movePatient(patientId, selectedStageId)
      }

      toast({
        title: 'Sucesso',
        description: 'Paciente vinculado ao pipeline.',
        variant: 'success',
      })

      // Reset form
      setSearchTerm('')
      setSearchResults([])
      setSelectedResult(null)
      setSelectedStageId(stages[0]?.id || '')

      onSuccess()
      onOpenChange(false)
    } catch (error: any) {
      console.error('Error linking patient:', error)
      const errorMessage = error?.response?.data?.error || 'Não foi possível vincular o paciente.'
      toast({
        title: 'Erro',
        description: errorMessage,
        variant: 'error',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-primary" />
            Vincular Paciente ou Conversa
          </DialogTitle>
          <DialogDescription>
            Adicione um paciente cadastrado ou transforme uma conversa em paciente e vincule ao pipeline
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="search">
              Buscar Contato <span className="text-red-500">*</span>
            </Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Digite o nome ou telefone (pacientes e conversas)"
                className="pl-9"
                disabled={loading}
              />
              {searching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>
          </div>

          {/* Search results list */}
          {searchTerm.trim().length >= 2 && (
            <div className="space-y-2">
              <Label>Resultados da busca</Label>
              <div className="max-h-[300px] overflow-y-auto border rounded-md">
                {searching ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    Buscando contatos...
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    Nenhum contato encontrado
                  </div>
                ) : (
                  <div className="divide-y">
                    {searchResults.map((result, index) => {
                      const isSelected = selectedResult === result
                      const displayName = result.type === 'patient' ? result.name : result.phone
                      const key = result.type === 'patient' ? result.id : `conv-${result.phone}`

                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setSelectedResult(result)}
                          className={cn(
                            'w-full p-3 text-left hover:bg-muted/50 transition-colors flex items-center gap-3',
                            isSelected && 'bg-primary/10 hover:bg-primary/15'
                          )}
                          disabled={loading}
                        >
                          <div className={cn(
                            'w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0',
                            isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                          )}>
                            {result.type === 'patient' ? (
                              displayName?.charAt(0).toUpperCase()
                            ) : (
                              <MessageSquare className="w-4 h-4" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium truncate">{displayName}</p>
                              {result.type === 'conversation' && (
                                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full flex-shrink-0">
                                  Conversa
                                </span>
                              )}
                            </div>
                            {result.type === 'patient' && result.phone && (
                              <p className="text-xs text-muted-foreground truncate">{result.phone}</p>
                            )}
                            {result.type === 'conversation' && result.lastMessage && (
                              <p className="text-xs text-muted-foreground truncate italic">{result.lastMessage}</p>
                            )}
                          </div>
                          {isSelected && (
                            <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
              {selectedResult?.type === 'conversation' && (
                <p className="text-xs text-muted-foreground px-1">
                  💡 Este contato será transformado em paciente e vinculado ao pipeline
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="stageId">
              Estágio <span className="text-red-500">*</span>
            </Label>
            <select
              id="stageId"
              value={selectedStageId}
              onChange={(e) => setSelectedStageId(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={loading}
            >
              {stages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading || !selectedResult}>
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {selectedResult?.type === 'conversation' ? 'Criando e vinculando...' : 'Vinculando...'}
                </>
              ) : (
                <>
                  <Link2 className="w-4 h-4 mr-2" />
                  {selectedResult?.type === 'conversation' ? 'Criar e Vincular' : 'Vincular'}
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
