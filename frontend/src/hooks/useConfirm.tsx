'use client'

import { useState, useCallback, useRef } from 'react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

interface UseConfirmOptions {
  title: string
  description: string
  confirmText?: string
  cancelText?: string
  variant?: 'default' | 'destructive' | 'warning'
}

interface ConfirmState {
  open: boolean
  options: UseConfirmOptions | null
}

/**
 * Hook para mostrar diálogos de confirmação de forma programática
 *
 * @example
 * const { confirm, ConfirmDialogComponent } = useConfirm()
 *
 * const handleDelete = async () => {
 *   const confirmed = await confirm({
 *     title: 'Confirmar exclusão',
 *     description: 'Tem certeza que deseja excluir?',
 *     variant: 'destructive'
 *   })
 *
 *   if (confirmed) {
 *     // Executar ação
 *   }
 * }
 *
 * return (
 *   <>
 *     <button onClick={handleDelete}>Deletar</button>
 *     {ConfirmDialogComponent}
 *   </>
 * )
 */
export function useConfirm() {
  const [state, setState] = useState<ConfirmState>({
    open: false,
    options: null,
  })
  // The pending promise resolver lives in a ref (not state): the handlers
  // below always see the current resolver without re-creating themselves,
  // and resolving is not a render concern.
  const resolveRef = useRef<((value: boolean) => void) | null>(null)

  const confirm = useCallback((options: UseConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      resolveRef.current = resolve
      setState({ open: true, options })
    })
  }, [])

  const settle = useCallback((value: boolean) => {
    resolveRef.current?.(value)
    resolveRef.current = null
    setState({ open: false, options: null })
  }, [])

  const handleConfirm = useCallback(() => settle(true), [settle])
  const handleCancel = useCallback(() => settle(false), [settle])

  const ConfirmDialogComponent = state.options ? (
    <ConfirmDialog
      open={state.open}
      onOpenChange={(open) => {
        if (!open) {
          handleCancel()
        }
      }}
      onConfirm={handleConfirm}
      {...state.options}
    />
  ) : null

  return { confirm, ConfirmDialogComponent }
}
