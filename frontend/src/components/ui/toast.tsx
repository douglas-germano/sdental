'use client'

import * as React from 'react'
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface Toast {
  id: string
  title?: string
  description?: string
  variant?: 'default' | 'success' | 'error' | 'warning'
  duration?: number // Duration in milliseconds
}

interface ToastContextValue {
  toasts: Toast[]
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
}

const ToastContext = React.createContext<ToastContextValue | undefined>(undefined)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([])

  const addToast = React.useCallback((toast: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).slice(2)
    setToasts((prev) => [...prev, { ...toast, id }])

    // Determine duration based on variant if not specified
    const getDefaultDuration = (variant?: Toast['variant']) => {
      switch (variant) {
        case 'success':
          return 3000
        case 'error':
          return 5000
        case 'warning':
          return 4000
        default:
          return 5000
      }
    }

    const duration = toast.duration ?? getDefaultDuration(toast.variant)

    // Auto remove after specified duration
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, duration)
  }, [])

  const removeToast = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <Toaster />
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = React.useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }

  return {
    toast: context.addToast,
    dismiss: context.removeToast,
  }
}

function Toaster() {
  const context = React.useContext(ToastContext)
  if (!context) return null

  const { toasts, removeToast } = context

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-3">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
      ))}
    </div>
  )
}

function ToastItem({
  toast,
  onClose,
}: {
  toast: Toast
  onClose: () => void
}) {
  const Icon = {
    success: CheckCircle,
    error: AlertCircle,
    warning: AlertCircle,
    default: Info,
  }[toast.variant || 'default']

  return (
    <div
      className={cn(
        'pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl border p-4 shadow-lg transition-all duration-300 animate-slide-in-right',
        'bg-background/95 backdrop-blur-sm',
        toast.variant === 'success' && 'border-success/30 bg-success/5',
        toast.variant === 'error' && 'border-destructive/30 bg-destructive/5',
        toast.variant === 'warning' && 'border-warning/30 bg-warning/5',
        (!toast.variant || toast.variant === 'default') && 'border-border'
      )}
    >
      <div
        className={cn(
          'flex-shrink-0 mt-0.5',
          toast.variant === 'success' && 'text-success',
          toast.variant === 'error' && 'text-destructive',
          toast.variant === 'warning' && 'text-warning',
          (!toast.variant || toast.variant === 'default') && 'text-primary'
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        {toast.title && (
          <p
            className={cn(
              'font-semibold text-sm',
              toast.variant === 'success' && 'text-success',
              toast.variant === 'error' && 'text-destructive',
              toast.variant === 'warning' && 'text-warning',
              (!toast.variant || toast.variant === 'default') && 'text-foreground'
            )}
          >
            {toast.title}
          </p>
        )}
        {toast.description && (
          <p className={cn('text-sm text-muted-foreground', toast.title && 'mt-1')}>
            {toast.description}
          </p>
        )}
      </div>
      <button
        onClick={onClose}
        className="flex-shrink-0 rounded-lg p-1 opacity-70 transition-all duration-200 hover:opacity-100 hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

export { Toaster }
