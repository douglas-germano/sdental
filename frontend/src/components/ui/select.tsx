'use client'

import * as React from 'react'
import { CaretDown as ChevronDown } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: boolean
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, label, error, ...props }, ref) => {
    return (
      <div className="relative group">
        <select
          className={cn(
            'flex h-10 w-full items-center justify-between rounded-button border bg-background px-3.5 py-2 pr-10 text-sm ring-offset-background transition-colors duration-150',
            'text-foreground',
            '[&>option[value=""]]:text-muted-foreground',
            'hover:border-foreground/40',
            'focus:outline-none focus:ring-2 focus:ring-ring/25 focus:border-primary',
            'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-input',
            'appearance-none cursor-pointer',
            error ? 'border-destructive focus:ring-destructive/20' : 'border-input',
            className
          )}
          ref={ref}
          {...props}
        >
          {children}
        </select>
        <ChevronDown className={cn(
          'absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none transition-transform duration-150',
          'text-muted-foreground group-hover:text-foreground',
          'group-focus-within:text-primary group-focus-within:rotate-180'
        )} />
      </div>
    )
  }
)
Select.displayName = 'Select'

const SelectOption = React.forwardRef<
  HTMLOptionElement,
  React.OptionHTMLAttributes<HTMLOptionElement>
>(({ className, ...props }, ref) => (
  <option ref={ref} className={cn('bg-background text-foreground', className)} {...props} />
))
SelectOption.displayName = 'SelectOption'

export { Select, SelectOption }
