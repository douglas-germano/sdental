'use client'

import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'

interface PageLoaderProps {
  message?: string
  className?: string
  size?: 'sm' | 'default' | 'lg'
}

/**
 * Componente padronizado de carregamento de pagina.
 * Usado em todas as paginas e secoes que precisam de loading state.
 *
 * @example
 * // Carregamento de pagina inteira
 * if (loading) return <PageLoader />
 *
 * // Com mensagem
 * if (loading) return <PageLoader message="Carregando pacientes..." />
 *
 * // Tamanho menor para secoes dentro de cards
 * <PageLoader size="sm" />
 */
export function PageLoader({ message, className, size = 'default' }: PageLoaderProps) {
  const sizes = {
    sm: { container: 'h-32', spinner: 'w-6 h-6 border-2', text: 'text-xs' },
    default: { container: 'h-48', spinner: 'w-8 h-8 border-[3px]', text: 'text-sm' },
    lg: { container: 'h-64', spinner: 'w-10 h-10 border-[3px]', text: 'text-sm' },
  }

  const s = sizes[size]

  return (
    <div className={cn('flex flex-col items-center justify-center gap-3', s.container, className)}>
      <div className={cn('rounded-full border-primary/20 border-t-primary animate-spin', s.spinner)} />
      {message && (
        <p className={cn('text-muted-foreground', s.text)}>{message}</p>
      )}
    </div>
  )
}
