'use client'

import { useState, useCallback } from 'react'
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
  resolve: ((value: boolean) => void) | null
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
    resolve: null,
  })

  const confirm = useCallback((options: UseConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setState({
        open: true,
        options,
        resolve,
      })
    })
  }, [])

  const handleConfirm = useCallback(() => {
    state.resolve?.(true)
    setState({ open: false, options: null, resolve: null })
  }, [state.resolve])

  const handleCancel = useCallback(() => {
    state.resolve?.(false)
    setState({ open: false, options: null, resolve: null })
  }, [state.resolve])

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
