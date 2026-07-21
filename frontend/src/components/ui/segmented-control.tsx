'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

export interface SegmentedControlOption<T extends string | number> {
  label: React.ReactNode
  value: T
}

export interface SegmentedControlProps<T extends string | number> {
  options: SegmentedControlOption<T>[]
  value: T
  onValueChange: (value: T) => void
  className?: string
  /** Stretch segments to fill the container width */
  fullWidth?: boolean
  size?: 'default' | 'sm'
}

/**
 * HIG segmented control: switches between VIEWS of the same content
 * (tabs switch between different content). Selected segment reads as a
 * raised chip on the recessed muted track.
 */
export function SegmentedControl<T extends string | number>({
  options,
  value,
  onValueChange,
  className,
  fullWidth = false,
  size = 'default',
}: SegmentedControlProps<T>) {
  const groupRef = React.useRef<HTMLDivElement>(null)

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const idx = options.findIndex((o) => o.value === value)
    const next = e.key === 'ArrowRight'
      ? Math.min(idx + 1, options.length - 1)
      : Math.max(idx - 1, 0)
    if (next !== idx) {
      onValueChange(options[next].value)
      const buttons = groupRef.current?.querySelectorAll('button')
      buttons?.[next]?.focus()
    }
  }

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      onKeyDown={handleKeyDown}
      className={cn(
        'inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5',
        fullWidth && 'flex w-full',
        className
      )}
    >
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onValueChange(option.value)}
            className={cn(
              'rounded-md px-3 text-sm font-medium whitespace-nowrap transition-all duration-150',
              size === 'sm' ? 'h-6 text-xs' : 'h-7',
              fullWidth && 'flex-1',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
              selected
                ? 'bg-card text-foreground shadow-soft'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
