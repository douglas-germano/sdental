import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { Icon as LucideIcon } from '@phosphor-icons/react'

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
                <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2.5">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-8 w-8 rounded-lg" />
                    </div>
                    <Skeleton className="h-7 w-16 mb-1.5" />
                    <Skeleton className="h-3.5 w-28" />
                </CardContent>
            </Card>
        )
    }

    const isNumeric = typeof value === 'number'

    return (
        <Card
            hover
            className={cn("overflow-hidden", className)}
        >
            <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2.5">
                    <p className="text-sm font-medium text-muted-foreground">
                        {title}
                    </p>
                    <div className={cn(
                        "h-8 w-8 rounded-lg flex items-center justify-center transition-colors",
                        iconColor
                    )}>
                        <Icon className="h-4 w-4" />
                    </div>
                </div>
                <div className="text-2xl font-bold tracking-tight text-foreground tabular-nums">
                    {isNumeric ? value.toLocaleString('pt-BR') : value}
                </div>
                {description && (
                    <div className="text-xs text-muted-foreground mt-1">
                        {description}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
