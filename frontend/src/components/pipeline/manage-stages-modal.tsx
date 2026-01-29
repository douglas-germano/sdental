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
import { pipelineApi } from '@/lib/api'
import { Plus, Trash2, GripVertical, Save } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface Stage {
  id?: string
  name: string
  color: string
  order: number
  description?: string
  is_default?: boolean
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: () => void
}

function SortableStageItem({
  stage,
  index,
  onUpdate,
  onDelete,
}: {
  stage: Stage
  index: number
  onUpdate: (index: number, field: keyof Stage, value: any) => void
  onDelete: (index: number) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: stage.id || `new-${index}` })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg border border-border"
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing"
      >
        <GripVertical className="w-5 h-5 text-muted-foreground" />
      </div>

      <div className="flex-1 grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Nome</Label>
          <Input
            value={stage.name}
            onChange={(e) => onUpdate(index, 'name', e.target.value)}
            placeholder="Nome do estágio"
            className="h-8"
          />
        </div>

        <div>
          <Label className="text-xs">Cor</Label>
          <div className="flex gap-2">
            <Input
              type="color"
              value={stage.color}
              onChange={(e) => onUpdate(index, 'color', e.target.value)}
              className="h-8 w-16"
            />
            <Input
              value={stage.color}
              onChange={(e) => onUpdate(index, 'color', e.target.value)}
              placeholder="#3b82f6"
              className="h-8 flex-1 font-mono text-xs"
            />
          </div>
        </div>
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={() => onDelete(index)}
        className="text-destructive hover:text-destructive"
      >
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  )
}

export function ManageStagesModal({ open, onOpenChange, onSave }: Props) {
  const [stages, setStages] = useState<Stage[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  useEffect(() => {
    if (open) {
      fetchStages()
    }
  }, [open])

  const fetchStages = async () => {
    setLoading(true)
    try {
      const response = await pipelineApi.getStages()
      setStages(response.data)
    } catch (error) {
      console.error('Error fetching stages', error)
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar os estágios.',
        variant: 'error',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      setStages((items) => {
        const oldIndex = items.findIndex(
          (item) => (item.id || `new-${items.indexOf(item)}`) === active.id
        )
        const newIndex = items.findIndex(
          (item) => (item.id || `new-${items.indexOf(item)}`) === over.id
        )

        const newItems = arrayMove(items, oldIndex, newIndex)
        // Update order field
        return newItems.map((item, index) => ({ ...item, order: index }))
      })
    }
  }

  const handleAddStage = () => {
    setStages([
      ...stages,
      {
        name: '',
        color: '#3b82f6',
        order: stages.length,
        is_default: false,
      },
    ])
  }

  const handleUpdateStage = (index: number, field: keyof Stage, value: any) => {
    const newStages = [...stages]

    // If updating color, ensure it has # prefix
    if (field === 'color' && value && !value.startsWith('#')) {
      value = '#' + value.replace(/^#+/, '')
    }

    newStages[index] = { ...newStages[index], [field]: value }
    setStages(newStages)
  }

  const handleDeleteStage = (index: number) => {
    const stage = stages[index]

    // Don't allow deleting if it's the only stage
    if (stages.length === 1) {
      toast({
        title: 'Erro',
        description: 'Você precisa ter pelo menos um estágio.',
        variant: 'error',
      })
      return
    }

    // Warn if stage has an ID (exists in backend)
    if (stage.id) {
      const confirm = window.confirm(
        `Tem certeza que deseja excluir o estágio "${stage.name}"? ` +
        `Pacientes neste estágio precisarão ser movidos antes de excluir.`
      )
      if (!confirm) return
    }

    const newStages = stages.filter((_, i) => i !== index)
    // Reorder
    setStages(newStages.map((s, i) => ({ ...s, order: i })))
  }

  const handleSave = async () => {
    // Validate names
    const invalidStages = stages.filter((s) => !s.name || !s.name.trim())
    if (invalidStages.length > 0) {
      toast({
        title: 'Erro',
        description: 'Todos os estágios precisam ter um nome.',
        variant: 'error',
      })
      return
    }

    // Validate colors
    const hexColorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/
    const invalidColors = stages.filter((s) => s.color && !hexColorRegex.test(s.color))
    if (invalidColors.length > 0) {
      toast({
        title: 'Erro',
        description: 'Todas as cores devem estar no formato hexadecimal (ex: #3b82f6).',
        variant: 'error',
      })
      return
    }

    setSaving(true)
    try {
      // Prepare data - remove undefined IDs and ensure all required fields are present
      const stagesToSave = stages.map((stage) => {
        const stageData: any = {
          name: stage.name.trim(),
          color: stage.color || '#3b82f6',
          order: stage.order,
          description: stage.description || '',
          is_default: stage.is_default || false,
        }

        // Only include ID if it exists (for existing stages)
        if (stage.id) {
          stageData.id = stage.id
        }

        return stageData
      })

      await pipelineApi.updateStages(stagesToSave)

      toast({
        title: 'Sucesso',
        description: 'Estágios atualizados com sucesso.',
        variant: 'success',
      })

      onSave()
      onOpenChange(false)
    } catch (error: any) {
      console.error('Error updating stages:', error)

      const errorMessage =
        error?.response?.data?.error || 'Não foi possível atualizar os estágios.'

      toast({
        title: 'Erro',
        description: errorMessage,
        variant: 'error',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gerenciar Estágios do Pipeline</DialogTitle>
          <DialogDescription>
            Arraste para reordenar, edite os nomes e cores, ou adicione novos estágios.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : (
          <div className="space-y-4">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={stages.map((s, i) => s.id || `new-${i}`)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {stages.map((stage, index) => (
                    <SortableStageItem
                      key={stage.id || `new-${index}`}
                      stage={stage}
                      index={index}
                      onUpdate={handleUpdateStage}
                      onDelete={handleDeleteStage}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            <Button
              onClick={handleAddStage}
              variant="outline"
              className="w-full"
              type="button"
            >
              <Plus className="w-4 h-4 mr-2" />
              Adicionar Estágio
            </Button>

            <div className="flex gap-2 justify-end pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={saving}
              >
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Salvando...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Salvar
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
