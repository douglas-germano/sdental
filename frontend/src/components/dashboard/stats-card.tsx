'use client'

import { useEffect, useRef, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { LucideIcon } from 'lucide-react'

interface StatsCardProps {
    title: string
    value: string | number
    icon: LucideIcon
    description?: React.ReactNode
    loading?: boolean
    variant?: 'default' | 'success' | 'warning' | 'destructive' | 'accent' | 'primary'
    className?: string
    delay?: number
}

function AnimatedCounter({ value, duration = 800 }: { value: number; duration?: number }) {
    const [display, setDisplay] = useState(0)
    const startTime = useRef<number | null>(null)
    const rafId = useRef<number | null>(null)

    useEffect(() => {
        if (value === 0) {
            setDisplay(0)
            return
        }

        const animate = (timestamp: number) => {
            if (!startTime.current) startTime.current = timestamp
            const progress = Math.min((timestamp - startTime.current) / duration, 1)

            // Ease-out cubic
            const eased = 1 - Math.pow(1 - progress, 3)
            setDisplay(Math.round(eased * value))

            if (progress < 1) {
                rafId.current = requestAnimationFrame(animate)
            }
        }

        startTime.current = null
        rafId.current = requestAnimationFrame(animate)

        return () => {
            if (rafId.current) cancelAnimationFrame(rafId.current)
        }
    }, [value, duration])

    return <>{display.toLocaleString('pt-BR')}</>
}

export function StatsCard({
    title,
    value,
    icon: Icon,
    description,
    loading = false,
    variant = 'default',
    className,
    delay = 0,
}: StatsCardProps) {
    const iconStyles = {
        default: 'bg-primary/[0.08] text-primary',
        success: 'bg-success/[0.08] text-success',
        warning: 'bg-warning/[0.08] text-warning',
        destructive: 'bg-destructive/[0.08] text-destructive',
        accent: 'bg-accent/[0.08] text-accent',
        primary: 'bg-primary/[0.08] text-primary',
    }

    const iconColor = iconStyles[variant] || iconStyles.default

    if (loading) {
        return (
            <Card className={cn('overflow-hidden', className)}>
                <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-4">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-10 w-10 rounded-xl" />
                    </div>
                    <Skeleton className="h-9 w-16 mb-2" />
                    <Skeleton className="h-3.5 w-28" />
                </CardContent>
            </Card>
        )
    }

    const isNumeric = typeof value === 'number'

    return (
        <Card
            hover
            className={cn("animate-fade-in-up overflow-hidden", className)}
            style={{ animationDelay: `${delay}ms` }}
        >
            <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                    <p className="text-sm font-medium text-muted-foreground">
                        {title}
                    </p>
                    <div className={cn(
                        "h-10 w-10 rounded-xl flex items-center justify-center transition-colors",
                        iconColor
                    )}>
                        <Icon className="h-5 w-5" />
                    </div>
                </div>
                <div className="text-3xl font-bold tracking-tight text-foreground tabular-nums">
                    {isNumeric ? <AnimatedCounter value={value} /> : value}
                </div>
                {description && (
                    <div className="text-xs text-muted-foreground mt-2">
                        {description}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
