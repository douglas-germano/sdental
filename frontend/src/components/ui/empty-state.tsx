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

/**
 * Componente padronizado para estados vazios
 *
 * @example
 * <EmptyState
 *   icon={Calendar}
 *   title="Nenhum agendamento encontrado"
 *   description="Crie um novo agendamento ou ajuste os filtros"
 *   action={{
 *     label: "Novo Agendamento",
 *     onClick: () => setShowModal(true)
 *   }}
 * />
 */
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
        'flex flex-col items-center justify-center py-12 px-4 text-center',
        className
      )}
    >
      <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4 animate-fade-in">
        <Icon className="h-8 w-8 text-muted-foreground opacity-50" />
      </div>
      <h3 className="font-medium text-foreground mb-1 animate-fade-in-up" style={{ animationDelay: '50ms' }}>
        {title}
      </h3>
      {description && (
        <p className="text-sm text-muted-foreground mb-4 max-w-sm animate-fade-in-up" style={{ animationDelay: '100ms' }}>
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
          leftIcon={ActionIcon ? <ActionIcon /> : undefined}
        >
          {action.label}
        </Button>
      )}
    </div>
  )
}
