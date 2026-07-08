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
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { financialApi, professionalsApi } from '@/lib/api'
import { ExpenseCategory, Professional } from '@/types'
import { Receipt, CurrencyDollar, CalendarBlank as Calendar, FileText, Repeat } from '@phosphor-icons/react'

const CATEGORY_OPTIONS: { value: ExpenseCategory; label: string }[] = [
  { value: 'rent', label: 'Aluguel' },
  { value: 'supplies', label: 'Insumos/Materiais' },
  { value: 'salaries', label: 'Salários' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'equipment', label: 'Equipamentos' },
  { value: 'taxes', label: 'Impostos' },
  { value: 'utilities', label: 'Contas (água/luz/internet)' },
  { value: 'other', label: 'Outro' },
]

interface NewExpenseModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function NewExpenseModal({ open, onOpenChange, onSuccess }: NewExpenseModalProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [professionals, setProfessionals] = useState<Professional[]>([])

  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState<ExpenseCategory>('other')
  const [dueDate, setDueDate] = useState('')
  const [professionalId, setProfessionalId] = useState('')
  const [repeatMonths, setRepeatMonths] = useState('1')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (!open) return
    setDescription('')
    setAmount('')
    setCategory('other')
    setDueDate('')
    setProfessionalId('')
    setRepeatMonths('1')
    setNotes('')

    professionalsApi.list({ active: true })
      .then((res) => setProfessionals(res.data.professionals || []))
      .catch(() => setProfessionals([]))
  }, [open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!description.trim() || !amount || Number(amount) <= 0) {
      toast({ title: 'Erro', description: 'Informe a descrição e um valor válido.', variant: 'error' })
      return
    }

    setLoading(true)
    try {
      await financialApi.createExpense({
        description: description.trim(),
        amount: Number(amount),
        category,
        due_date: dueDate || null,
        professional_id: professionalId || null,
        notes: notes || undefined,
        repeat_months: Number(repeatMonths) || 1,
      })

      toast({ title: 'Sucesso', description: 'Despesa registrada com sucesso!', variant: 'success' })
      onSuccess()
      onOpenChange(false)
    } catch (error) {
      console.error('Error creating expense:', error)
      toast({ title: 'Erro', description: 'Não foi possível registrar a despesa.', variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogClose onClick={() => onOpenChange(false)} />
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-card bg-destructive flex items-center justify-center">
              <Receipt className="h-6 w-6 text-white" />
            </div>
            <div>
              <DialogTitle className="text-lg">Nova Despesa</DialogTitle>
              <DialogDescription>Registre uma conta a pagar da clínica</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="description" required>Descrição</Label>
            <Input
              id="description" placeholder="Ex: Aluguel de julho"
              value={description} onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amount" className="flex items-center gap-2" required>
                <CurrencyDollar className="h-4 w-4" />
                Valor (R$)
              </Label>
              <Input
                id="amount" type="number" step="0.01" min="0.01" placeholder="0,00"
                value={amount} onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">Categoria</Label>
              <Select id="category" value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="due_date" className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Vencimento
              </Label>
              <Input id="due_date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="repeat" className="flex items-center gap-2">
                <Repeat className="h-4 w-4" />
                Repetir por (meses)
              </Label>
              <Select id="repeat" value={repeatMonths} onChange={(e) => setRepeatMonths(e.target.value)}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>{n === 1 ? 'Não repetir' : `${n} meses`}</option>
                ))}
              </Select>
            </div>
          </div>

          {professionals.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="professional">Profissional (opcional)</Label>
              <Select id="professional" value={professionalId} onChange={(e) => setProfessionalId(e.target.value)}>
                <option value="">Nenhum</option>
                {professionals.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="notes" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Observações
            </Label>
            <Textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" variant="gradient" loading={loading}>
              <Receipt className="h-4 w-4" />
              Registrar Despesa
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
