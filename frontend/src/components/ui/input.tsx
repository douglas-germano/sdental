import * as React from 'react'

import { cn } from '@/lib/utils'

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-11 w-full rounded-field border border-input bg-card px-3 py-2 text-sm ring-offset-background transition-colors duration-150',
          'file:border-0 file:bg-transparent file:text-sm file:font-medium',
          'placeholder:text-muted-foreground',
          'hover:border-foreground/40',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25 focus-visible:border-primary',
          'aria-[invalid=true]:border-destructive aria-[invalid=true]:bg-destructive/5',
          'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-input',
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = 'Input'

export { Input }
