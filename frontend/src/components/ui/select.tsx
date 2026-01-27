'use client'

import * as React from 'react'
import { ChevronDown } from 'lucide-react'
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
            // Base styles
            'flex h-11 w-full items-center justify-between rounded-xl border bg-background px-4 py-2 pr-10 text-sm ring-offset-background transition-all duration-200',
            // Placeholder
            'text-foreground',
            '[&>option[value=""]]:text-muted-foreground',
            // Hover
            'hover:border-primary/50',
            // Focus
            'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:border-primary',
            // Disabled
            'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-input',
            // Appearance
            'appearance-none cursor-pointer',
            // Border based on error state
            error ? 'border-destructive focus:ring-destructive/30' : 'border-input',
            className
          )}
          ref={ref}
          {...props}
        >
          {children}
        </select>
        <ChevronDown className={cn(
          'absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none transition-all duration-200',
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
