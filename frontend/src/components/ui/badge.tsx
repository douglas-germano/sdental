import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-0.5 text-xs font-medium tracking-wide transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default:
          'border-primary/15 bg-primary/10 text-primary',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground',
        destructive:
          'border-destructive/15 bg-destructive/10 text-destructive',
        outline:
          'text-foreground border-border',
        success:
          'border-success/15 bg-success/10 text-success',
        warning:
          'border-warning/15 bg-warning/10 text-warning',
        info:
          'border-primary/15 bg-primary/10 text-primary',
      },
      size: {
        default: 'px-2.5 py-0.5 text-xs',
        sm: 'px-2 py-px text-2xs',
        lg: 'px-3 py-1 text-sm',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean
}

function Badge({ className, variant, size, dot, children, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant, size }), className)} {...props}>
      {dot && (
        <span className={cn(
          'h-1.5 w-1.5 rounded-full shrink-0',
          variant === 'success' && 'bg-success',
          variant === 'destructive' && 'bg-destructive',
          variant === 'warning' && 'bg-warning',
          variant === 'info' && 'bg-primary',
          variant === 'default' && 'bg-primary',
          (!variant || variant === 'secondary' || variant === 'outline') && 'bg-muted-foreground',
        )} />
      )}
      {children}
    </div>
  )
}

export { Badge, badgeVariants }
