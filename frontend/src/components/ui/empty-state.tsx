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
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  const ActionIcon = action?.icon

  return (
    <div
      className={cn(
        'relative flex flex-col items-center justify-center py-16 px-4 text-center',
        className
      )}
    >
      {/* Subtle background pattern */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden opacity-[0.03]">
        <div className="w-64 h-64 rounded-full border-[32px] border-current" />
      </div>

      <div className="relative">
        <div className="h-14 w-14 rounded-xl bg-muted/60 border border-border flex items-center justify-center mb-5 mx-auto">
          <Icon className="h-6 w-6 text-muted-foreground/60" />
        </div>
        <h3 className="font-semibold text-foreground mb-1.5">
          {title}
        </h3>
        {description && (
          <p className="text-sm text-muted-foreground mb-6 max-w-[280px] mx-auto leading-relaxed">
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
