import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 border px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        /* Outlined Red Pill - inline article/list metadata */
        default:
          'rounded-sm border-primary bg-background/80 text-foreground/80',
        /* Filled Neutral Pill - quieter tags */
        secondary:
          'rounded-badge-pill border-transparent bg-secondary text-secondary-foreground normal-case',
        destructive:
          'rounded-sm border-destructive bg-destructive/10 text-destructive',
        outline:
          'rounded-sm text-foreground border-border normal-case',
        success:
          'rounded-sm border-success bg-success/10 text-success',
        warning:
          'rounded-sm border-warning bg-warning/10 text-warning',
        info:
          'rounded-sm border-accent bg-accent/10 text-accent',
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
          variant === 'info' && 'bg-accent',
          variant === 'default' && 'bg-primary',
          (!variant || variant === 'secondary' || variant === 'outline') && 'bg-muted-foreground',
        )} />
      )}
      {children}
    </div>
  )
}

export { Badge, badgeVariants }
