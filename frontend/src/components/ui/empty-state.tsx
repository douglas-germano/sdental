'use client'

import { LucideIcon } from 'lucide-react'
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
        <div className="h-16 w-16 rounded-2xl bg-muted/50 border border-border/40 flex items-center justify-center mb-5 mx-auto animate-fade-in shadow-soft">
          <Icon className="h-7 w-7 text-muted-foreground/50" />
        </div>
        <h3 className="font-semibold text-foreground mb-1.5 animate-fade-in-up" style={{ animationDelay: '50ms' }}>
          {title}
        </h3>
        {description && (
          <p className="text-sm text-muted-foreground mb-6 max-w-[280px] mx-auto leading-relaxed animate-fade-in-up" style={{ animationDelay: '100ms' }}>
            {description}
          </p>
        )}
        {action && (
          <Button
            onClick={action.onClick}
            variant="outline"
            size="sm"
            className="animate-fade-in-up"
            style={{ animationDelay: '150ms' }}
            leftIcon={ActionIcon ? <ActionIcon className="h-4 w-4" /> : undefined}
          >
            {action.label}
          </Button>
        )}
      </div>
    </div>
  )
}
