'use client'

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/toast'
import { financialApi } from '@/lib/api'
import { Target } from '@phosphor-icons/react'

interface SetGoalModalProps {
  open: boolean
  currentPeriod: string
  currentTarget: number | null
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function SetGoalModal({ open, currentPeriod, currentTarget, onOpenChange, onSuccess }: SetGoalModalProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [target, setTarget] = useState('')

  useEffect(() => {
    if (open) setTarget(currentTarget ? String(currentTarget) : '')
  }, [open, currentTarget])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!target || Number(target) <= 0) return

    setLoading(true)
    try {
      await financialApi.setGoal({ period: currentPeriod, target_amount: Number(target) })
      toast({ title: 'Sucesso', description: 'Meta salva com sucesso!', variant: 'success' })
      onSuccess()
      onOpenChange(false)
    } catch (error) {
      console.error('Error setting goal:', error)
      toast({ title: 'Erro', description: 'Não foi possível salvar a meta.', variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const [year, month] = currentPeriod.split('-')
  const monthLabel = new Date(Number(year), Number(month) - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogClose onClick={() => onOpenChange(false)} />
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-card bg-primary flex items-center justify-center">
              <Target className="h-6 w-6 text-white" />
            </div>
            <div>
              <DialogTitle className="text-lg">Meta de Faturamento</DialogTitle>
              <DialogDescription className="capitalize">{monthLabel}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="target" required>Meta (R$)</Label>
            <Input id="target" type="number" step="0.01" min="0.01" value={target} onChange={(e) => setTarget(e.target.value)} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" variant="gradient" loading={loading}>
              Salvar Meta
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
