'use client'

import * as React from 'react'
import { X } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

/*
 * HIG sheet: a well-scoped task presented on a surface that slides in over
 * the current context, keeping it visible behind. API mirrors dialog.tsx so
 * migrating a modal is an import + component-name swap.
 */

interface SheetProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
}

const Sheet = ({ open, onOpenChange, children }: SheetProps) => {
  React.useEffect(() => {
    if (open) {
      const originalOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = originalOverflow
      }
    }
  }, [open])

  React.useEffect(() => {
    if (!open) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onOpenChange?.(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onOpenChange])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-150"
        onClick={() => onOpenChange?.(false)}
        aria-hidden="true"
      />
      {children}
    </div>
  )
}

const SheetContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { size?: 'default' | 'lg' }
>(({ className, children, size = 'default', ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'fixed inset-y-0 right-0 z-50 h-full w-full flex flex-col',
      size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-lg',
      'bg-card border-l border-border shadow-soft-xl',
      'sm:rounded-l-2xl',
      'animate-in slide-in-from-right-4 fade-in-0 duration-200',
      className
    )}
    onClick={(e) => e.stopPropagation()}
    {...props}
  >
    <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
      {children}
    </div>
  </div>
))
SheetContent.displayName = 'SheetContent'

const SheetHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('flex flex-col space-y-2 text-left mb-6', className)}
    {...props}
  />
)
SheetHeader.displayName = 'SheetHeader'

const SheetFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-5 mt-2 border-t border-border',
      className
    )}
    {...props}
  />
)
SheetFooter.displayName = 'SheetFooter'

const SheetTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h2
    ref={ref}
    className={cn(
      'text-lg font-semibold leading-none text-foreground',
      className
    )}
    {...props}
  />
))
SheetTitle.displayName = 'SheetTitle'

const SheetDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn('text-sm text-muted-foreground mt-1.5', className)}
    {...props}
  />
))
SheetDescription.displayName = 'SheetDescription'

const SheetClose = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, ...props }, ref) => (
  <button
    ref={ref}
    aria-label="Fechar"
    className={cn(
      'absolute right-4 top-4 z-10',
      'rounded-md p-1.5',
      'text-muted-foreground hover:text-foreground',
      'hover:bg-muted',
      'transition-colors duration-150',
      'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
      'disabled:pointer-events-none',
      className
    )}
    {...props}
  >
    <X className="h-4 w-4" />
    <span className="sr-only">Fechar</span>
  </button>
))
SheetClose.displayName = 'SheetClose'

export {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
  SheetClose,
}
