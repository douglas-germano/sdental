'use client'

import * as React from 'react'
import { MagnifyingGlass, XCircle } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

export interface SearchFieldProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: string
  onChange: (value: string) => void
}

/**
 * HIG search field: leading magnifier, quiet placeholder and a clear button
 * that appears while there is text. Esc clears before it bubbles up.
 */
const SearchField = React.forwardRef<HTMLInputElement, SearchFieldProps>(
  ({ className, value, onChange, placeholder = 'Buscar', ...props }, ref) => {
    return (
      <div className={cn('relative', className)}>
        <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          ref={ref}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && value) {
              e.stopPropagation()
              onChange('')
            }
          }}
          placeholder={placeholder}
          className={cn(
            'flex h-9 w-full rounded-button border border-input bg-card pl-9 pr-8 py-2 text-sm ring-offset-background transition-colors duration-150',
            'placeholder:text-muted-foreground/50',
            'hover:border-foreground/40',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25 focus-visible:border-primary'
          )}
          {...props}
        />
        {value && (
          <button
            type="button"
            aria-label="Limpar busca"
            onClick={() => onChange('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground transition-colors"
          >
            <XCircle className="h-4 w-4" weight="fill" />
          </button>
        )}
      </div>
    )
  }
)
SearchField.displayName = 'SearchField'

export { SearchField }
