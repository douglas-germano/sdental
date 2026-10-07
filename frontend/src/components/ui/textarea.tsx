import * as React from 'react'

import { cn } from '@/lib/utils'

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          'flex min-h-[100px] w-full rounded-field border border-input bg-card px-3 py-2.5 text-sm ring-offset-background transition-colors duration-150',
          'placeholder:text-muted-foreground',
          'hover:border-foreground/40',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25 focus-visible:border-primary',
          'aria-[invalid=true]:border-destructive aria-[invalid=true]:bg-destructive/5',
          'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-input',
          'resize-none',
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Textarea.displayName = 'Textarea'

export { Textarea }
