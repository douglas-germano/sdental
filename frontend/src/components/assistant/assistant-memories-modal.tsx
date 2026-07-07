'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { PageLoader } from '@/components/ui/page-loader'
import { useToast } from '@/components/ui/toast'
import { useConfirm } from '@/hooks/useConfirm'
import { assistantApi } from '@/lib/api'
import { AssistantMemory } from '@/types'
import { getErrorMessage } from '@/lib/error-messages'
import { formatDateTime } from '@/lib/utils'
import {
  Brain,
  Plus,
  PencilSimple as Edit2,
  Trash as Trash2,
  Check,
  X,
} from '@phosphor-icons/react'

interface AssistantMemoriesModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const MAX_LENGTH = 500

export function AssistantMemoriesModal({ open, onOpenChange }: AssistantMemoriesModalProps) {
  const { toast } = useToast()
  const { confirm, ConfirmDialogComponent } = useConfirm()
  const [loading, setLoading] = useState(true)
  const [memories, setMemories] = useState<AssistantMemory[]>([])
  const [newContent, setNewContent] = useState('')
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const fetchMemories = useCallback(async () => {
    setLoading(true)
    try {
      const response = await assistantApi.listMemories()
      setMemories(response.data.memories || [])
    } catch (error) {
      toast({ title: 'Erro ao carregar memórias', description: getErrorMessage(error), variant: 'error' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    if (open) fetchMemories()
  }, [open, fetchMemories])

  const handleCreate = async () => {
    const trimmed = newContent.trim()
    if (!trimmed || creating) return

    setCreating(true)
    try {
      const response = await assistantApi.createMemory(trimmed)
      setMemories((prev) => [response.data.memory, ...prev])
      setNewContent('')
    } catch (error) {
      toast({ title: 'Erro ao adicionar memória', description: getErrorMessage(error), variant: 'error' })
    } finally {
      setCreating(false)
    }
  }

  const startEdit = (memory: AssistantMemory) => {
    setEditingId(memory.id)
    setEditContent(memory.content)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditContent('')
  }

  const handleSaveEdit = async (id: string) => {
    const trimmed = editContent.trim()
    if (!trimmed) return

    setSavingId(id)
    try {
      const response = await assistantApi.updateMemory(id, trimmed)
      setMemories((prev) => prev.map((m) => (m.id === id ? response.data.memory : m)))
      cancelEdit()
    } catch (error) {
      toast({ title: 'Erro ao salvar memória', description: getErrorMessage(error), variant: 'error' })
    } finally {
      setSavingId(null)
    }
  }

  const handleDelete = async (memory: AssistantMemory) => {
    const confirmed = await confirm({
      title: 'Remover memória',
      description: 'O assistente vai esquecer esse fato nas próximas conversas. Essa ação não pode ser desfeita.',
      confirmText: 'Remover',
      variant: 'destructive',
    })
    if (!confirmed) return

    setDeletingId(memory.id)
    try {
      await assistantApi.deleteMemory(memory.id)
      setMemories((prev) => prev.filter((m) => m.id !== memory.id))
    } catch (error) {
      toast({ title: 'Erro ao remover memória', description: getErrorMessage(error), variant: 'error' })
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogClose onClick={() => onOpenChange(false)} />
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            <DialogTitle>O que o assistente sabe sobre sua clínica</DialogTitle>
          </div>
          <DialogDescription>
            Fatos, metas e preferências que a IA guardou das suas conversas. Você pode editar,
            remover ou adicionar itens manualmente.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-2 mb-4">
          <Textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="Ex: A meta deste mês é 120 consultas concluídas"
            maxLength={MAX_LENGTH}
            rows={2}
            className="min-h-0"
          />
          <Button
            type="button"
            size="icon"
            className="shrink-0"
            onClick={handleCreate}
            disabled={creating || !newContent.trim()}
            loading={creating}
            title="Adicionar memória"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {loading ? (
          <div className="py-8 flex justify-center">
            <PageLoader size="default" message="Carregando memórias..." />
          </div>
        ) : memories.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Nenhuma memória guardada ainda. Converse com o assistente ou adicione um fato acima.
          </p>
        ) : (
          <div className="space-y-2 max-h-[45vh] overflow-y-auto scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
            {memories.map((memory) => (
              <div
                key={memory.id}
                className="flex items-start gap-2 rounded-xl border border-border p-3 bg-muted/30"
              >
                {editingId === memory.id ? (
                  <>
                    <Textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      maxLength={MAX_LENGTH}
                      rows={2}
                      className="min-h-0 flex-1"
                      autoFocus
                    />
                    <div className="flex flex-col gap-1 shrink-0">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => handleSaveEdit(memory.id)}
                        disabled={savingId === memory.id || !editContent.trim()}
                        title="Salvar"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={cancelEdit}
                        disabled={savingId === memory.id}
                        title="Cancelar"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground whitespace-pre-wrap break-words">
                        {memory.content}
                      </p>
                      <p className="text-[11px] text-muted-foreground/70 mt-1">
                        {formatDateTime(memory.created_at)}
                      </p>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => startEdit(memory)}
                        title="Editar"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(memory)}
                        disabled={deletingId === memory.id}
                        loading={deletingId === memory.id}
                        title="Remover"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
      {ConfirmDialogComponent}
    </Dialog>
  )
}
