'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

export interface ProgressProps {
  /** 0-100. Pass undefined for the indeterminate variant. */
  value?: number
  className?: string
  'aria-label'?: string
}

/**
 * HIG determinate progress bar - use when the amount of remaining work is
 * known (otherwise use a spinner). Indeterminate falls back to a sweeping
 * animation on the same track.
 */
export function Progress({ value, className, 'aria-label': ariaLabel }: ProgressProps) {
  const clamped = value === undefined ? undefined : Math.min(100, Math.max(0, value))
  return (
    <div
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      className={cn('h-1.5 w-full rounded-full bg-muted overflow-hidden', className)}
    >
      {clamped === undefined ? (
        <div className="h-full w-1/3 rounded-full bg-primary animate-shimmer" />
      ) : (
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
          style={{ width: `${clamped}%` }}
        />
      )}
    </div>
  )
}
