'use client'

import type { Icon as LucideIcon } from '@phosphor-icons/react'
import { Button } from './button'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
    icon?: LucideIcon
  }
  className?: string
  /** Smaller icon/spacing for use inside compact widgets (e.g. dashboard cards). */
  compact?: boolean
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  compact = false,
}: EmptyStateProps) {
  const ActionIcon = action?.icon

  return (
    <div
      className={cn(
        'relative flex flex-col items-center justify-center px-4 text-center',
        compact ? 'py-6' : 'py-16',
        className
      )}
    >
      {/* Subtle background pattern */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden opacity-[0.03]">
        <div className="w-64 h-64 rounded-full border-[32px] border-current" />
      </div>

      <div className="relative">
        <div className={cn(
          'rounded-xl bg-muted/60 border border-border flex items-center justify-center mx-auto',
          compact ? 'h-9 w-9 mb-2' : 'h-14 w-14 mb-5'
        )}>
          <Icon className={compact ? 'h-4 w-4 text-muted-foreground/60' : 'h-6 w-6 text-muted-foreground/60'} />
        </div>
        <h3 className={cn('font-semibold text-foreground', compact ? 'text-sm mb-1' : 'mb-1.5')}>
          {title}
        </h3>
        {description && (
          <p className={cn(
            'text-sm text-muted-foreground max-w-[280px] mx-auto leading-relaxed',
            compact ? 'mb-2 text-xs' : 'mb-6'
          )}>
            {description}
          </p>
        )}
        {action && (
          <Button
            onClick={action.onClick}
            variant="outline"
            size="sm"
            className=""
            leftIcon={ActionIcon ? <ActionIcon className="h-4 w-4" /> : undefined}
          >
            {action.label}
          </Button>
        )}
      </div>
    </div>
  )
}
