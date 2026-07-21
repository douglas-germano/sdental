'use client'

import * as React from 'react'
import { Minus, Plus } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

export interface StepperProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  /** Unit label rendered inside, after the number (e.g. "min", "dias") */
  unit?: string
  disabled?: boolean
  className?: string
  'aria-label'?: string
}

/**
 * HIG stepper: incremental adjustment of a small numeric value without
 * pulling up a keyboard. The number stays directly editable for typing.
 */
export function Stepper({
  value,
  onChange,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  step = 1,
  unit,
  disabled = false,
  className,
  'aria-label': ariaLabel,
}: StepperProps) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v))

  const commitText = (raw: string) => {
    const parsed = parseInt(raw, 10)
    if (!isNaN(parsed)) onChange(clamp(parsed))
    else onChange(clamp(min))
  }

  const [text, setText] = React.useState(String(value))
  React.useEffect(() => setText(String(value)), [value])

  return (
    <div
      className={cn(
        'inline-flex items-stretch h-9 rounded-button border border-input bg-card overflow-hidden',
        disabled && 'opacity-50 pointer-events-none',
        className
      )}
    >
      <button
        type="button"
        aria-label="Diminuir"
        tabIndex={-1}
        disabled={disabled || value <= min}
        onClick={() => onChange(clamp(value - step))}
        className="w-8 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <div className="flex items-center border-x border-input">
        <input
          type="text"
          inputMode="numeric"
          aria-label={ariaLabel}
          value={text}
          disabled={disabled}
          onChange={(e) => setText(e.target.value.replace(/[^0-9]/g, ''))}
          onBlur={(e) => commitText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitText((e.target as HTMLInputElement).value)
            if (e.key === 'ArrowUp') { e.preventDefault(); onChange(clamp(value + step)) }
            if (e.key === 'ArrowDown') { e.preventDefault(); onChange(clamp(value - step)) }
          }}
          className={cn(
            'w-12 text-center text-sm bg-transparent focus:outline-none tabular-nums',
            unit && 'w-10 pr-0 text-right'
          )}
        />
        {unit && <span className="text-xs text-muted-foreground pr-2 pl-1">{unit}</span>}
      </div>
      <button
        type="button"
        aria-label="Aumentar"
        tabIndex={-1}
        disabled={disabled || value >= max}
        onClick={() => onChange(clamp(value + step))}
        className="w-8 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
