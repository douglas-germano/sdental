'use client'

import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, label, ...props }, ref) => {
    return (
      <div className="relative">
        <select
          className={cn(
            'flex h-11 w-full items-center justify-between rounded-xl border border-input bg-background px-4 py-2 text-sm ring-offset-background transition-all duration-200',
            'placeholder:text-muted-foreground/60',
            'hover:border-primary/50',
            'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:border-primary',
            'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-input',
            'appearance-none cursor-pointer',
            className
          )}
          ref={ref}
          {...props}
        >
          {children}
        </select>
        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none transition-transform duration-200" />
      </div>
    )
  }
)
Select.displayName = 'Select'

const SelectOption = React.forwardRef<
  HTMLOptionElement,
  React.OptionHTMLAttributes<HTMLOptionElement>
>(({ className, ...props }, ref) => (
  <option ref={ref} className={cn('', className)} {...props} />
))
SelectOption.displayName = 'SelectOption'

export { Select, SelectOption }
