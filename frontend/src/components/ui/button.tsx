'use client'

import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { CircleNotch as Loader2 } from '@phosphor-icons/react'

import { cn } from '@/lib/utils'

/*
 * Two-tier button system: sharp 2px rectangles for form/utility actions,
 * fully-rounded pills for editorial/content CTAs. Both are "primary" -
 * the choice is contextual (see the `pill` prop), never hierarchical.
 * The system is flat: no shadows, no gradients, opacity-only active state.
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-button text-sm font-bold tracking-[0.01em] ring-offset-background transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:opacity-90',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground border border-primary hover:bg-primary/90',
        gradient:
          'bg-primary text-primary-foreground border border-primary hover:bg-primary/90',
        destructive:
          'bg-destructive text-destructive-foreground border border-destructive hover:bg-destructive/90',
        outline:
          'border border-foreground/70 bg-background hover:bg-muted/60 text-foreground',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/70',
        ghost:
          'hover:bg-muted text-muted-foreground hover:text-foreground',
        link:
          'text-accent underline-offset-4 hover:underline',
        contentGhost:
          'bg-black/5 text-primary hover:bg-black/10 rounded-pill',
        glass:
          'bg-white/10 text-white hover:bg-white/20 rounded-glass-pill',
        success:
          'bg-success text-success-foreground border border-success hover:bg-success/90',
        warning:
          'bg-warning text-warning-foreground border border-warning hover:bg-warning/90',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 px-3 text-xs',
        lg: 'h-11 px-6 text-base',
        xl: 'h-14 px-8 text-lg',
        icon: 'h-10 w-10 rounded-full',
        'icon-sm': 'h-8 w-8 rounded-full',
        'icon-lg': 'h-11 w-11 rounded-full',
      },
      pill: {
        true: 'rounded-pill',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
      pill: false,
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  loading?: boolean
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
  /** Editorial/content CTA shape - fully-rounded 60px pill instead of the 2px form rectangle */
  pill?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, pill, asChild = false, loading = false, leftIcon, rightIcon, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, pill, className }))}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            {children}
          </>
        ) : (
          <>
            {leftIcon && <span className="shrink-0">{leftIcon}</span>}
            {children}
            {rightIcon && <span className="shrink-0">{rightIcon}</span>}
          </>
        )}
      </Comp>
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
