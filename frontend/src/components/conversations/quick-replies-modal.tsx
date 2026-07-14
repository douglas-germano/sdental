'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { conversationsApi } from '@/lib/api'
import { QuickReply } from '@/types'
import { Plus, Trash as Trash2 } from '@phosphor-icons/react'

interface QuickRepliesModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  quickReplies: QuickReply[]
  onSaved: (replies: QuickReply[]) => void
}

/**
 * Manage the clinic's canned responses, used via "/" in the chat composer.
 */
export function QuickRepliesModal({ open, onOpenChange, quickReplies, onSaved }: QuickRepliesModalProps) {
  const { toast } = useToast()
  const [items, setItems] = useState<QuickReply[]>(quickReplies)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) setItems(quickReplies.length > 0 ? quickReplies : [{ title: '', text: '' }])
  }, [open, quickReplies])

  const updateItem = (index: number, patch: Partial<QuickReply>) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  }

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSave = async () => {
    const cleaned = items
      .map((i) => ({ title: i.title.trim(), text: i.text.trim() }))
      .filter((i) => i.title && i.text)

    setSaving(true)
    try {
      await conversationsApi.updateQuickReplies(cleaned)
      onSaved(cleaned)
      onOpenChange(false)
      toast({ title: 'Respostas rápidas salvas', variant: 'success' })
    } catch (error) {
      console.error('Error saving quick replies:', error)
      toast({ title: 'Erro ao salvar respostas rápidas', variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Respostas rápidas</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground -mt-2 mb-1">
          Digite <span className="font-mono bg-muted px-1 rounded">/</span> no campo de mensagem para usar.
          Exemplos: chave PIX, endereço, preparo de procedimentos.
        </p>

        <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
          {items.map((item, index) => (
            <div key={index} className="flex gap-2 items-start border border-border/60 rounded-card p-2.5">
              <div className="flex-1 space-y-2">
                <Input
                  placeholder="Atalho (ex.: PIX)"
                  value={item.title}
                  maxLength={60}
                  onChange={(e) => updateItem(index, { title: e.target.value })}
                  className="h-8 text-sm"
                />
                <textarea
                  placeholder="Texto completo da resposta..."
                  value={item.text}
                  maxLength={4096}
                  onChange={(e) => updateItem(index, { text: e.target.value })}
                  rows={2}
                  className="w-full rounded border border-input bg-background px-3 py-2 text-sm resize-y focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => removeItem(index)}
                className="text-destructive shrink-0 mt-1"
                aria-label="Remover resposta rápida"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setItems((prev) => [...prev, { title: '', text: '' }])}
            className="gap-1.5"
            disabled={items.length >= 50}
          >
            <Plus className="h-3.5 w-3.5" /> Adicionar
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleSave} loading={saving}>
              Salvar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
