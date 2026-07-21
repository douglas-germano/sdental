'use client'

import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { CircleNotch as Loader2 } from '@phosphor-icons/react'

import { cn } from '@/lib/utils'

/*
 * HIG push-button system: 8px continuous-curve rectangles, medium weight
 * (never bold - emphasis comes from fill, not stroke), press dims via opacity.
 * The `pill` prop remains for editorial/content CTAs.
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-button text-sm font-medium ring-offset-background transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:opacity-85',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground hover:bg-primary/90',
        gradient:
          'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline:
          'border border-input bg-card hover:bg-muted/60 text-foreground shadow-soft',
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
          'bg-success text-success-foreground hover:bg-success/90',
        warning:
          'bg-warning text-warning-foreground hover:bg-warning/90',
      },
      size: {
        default: 'h-9 px-3.5 py-2',
        sm: 'h-8 px-3 text-sm',
        lg: 'h-11 px-5 text-base',
        xl: 'h-12 px-7 text-base',
        icon: 'h-9 w-9 rounded-full',
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
