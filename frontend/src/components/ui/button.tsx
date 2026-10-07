'use client'

import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { CircleNotch as Loader2 } from '@phosphor-icons/react'

import { cn } from '@/lib/utils'

/* Tiered greens, pill actions and a restrained press interaction. */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-button text-sm font-semibold ring-offset-background transition-[background-color,color,border-color,transform,box-shadow] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-95 motion-reduce:active:scale-100',
  {
    variants: {
      variant: {
        default:
          'border border-transparent bg-primary text-primary-foreground hover:bg-primary-shade hover:shadow-soft',
        gradient:
          'border border-transparent bg-primary text-primary-foreground hover:bg-primary-shade hover:shadow-soft',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline:
          'border border-primary/65 bg-transparent text-primary hover:bg-primary/5',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/70',
        ghost:
          'hover:bg-muted text-muted-foreground hover:text-foreground',
        link:
          'text-accent underline-offset-4 hover:underline',
        contentGhost:
          'bg-primary/5 text-primary hover:bg-primary/10 rounded-pill',
        glass:
          'bg-white/10 text-white hover:bg-white/20 rounded-glass-pill',
        success:
          'bg-success text-success-foreground hover:bg-success/90',
        warning:
          'bg-warning text-warning-foreground hover:bg-warning/90',
      },
      size: {
        default: 'h-11 px-5 py-2',
        sm: 'h-9 max-md:min-h-11 px-4 text-sm',
        lg: 'h-11 px-5 text-base',
        xl: 'h-12 px-7 text-base',
        icon: 'h-11 w-11 rounded-full',
        'icon-sm': 'h-8 w-8 max-md:h-11 max-md:w-11 rounded-full',
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
  /** Kept for compatibility; all actions now use the pill shape. */
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
