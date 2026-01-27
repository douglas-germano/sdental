import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
    const variants = {
        default: 'bg-primary/5 text-primary',
        success: 'bg-success/10 text-success',
        warning: 'bg-warning/10 text-warning',
        destructive: 'bg-destructive/10 text-destructive',
        accent: 'bg-accent/10 text-accent',
        primary: 'bg-primary/10 text-primary',
    }

    const iconColor = variants[variant] || variants.default

    if (loading) {
        return (
            <Card className={cn('overflow-hidden', className)}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <Skeleton className="h-4 w-[100px]" />
                    <Skeleton className="h-10 w-10 rounded-xl" />
                </CardHeader>
                <CardContent>
                    <Skeleton className="h-8 w-[60px] mb-2" />
                    <Skeleton className="h-3 w-[120px]" />
                </CardContent>
            </Card>
        )
    }

    return (
        <Card
            hover
            className={cn("animate-fade-in-up transition-all duration-300", className)}
            style={{ animationDelay: `${delay}ms` }}
        >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                    {title}
                </CardTitle>
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center transition-colors", iconColor)}>
                    <Icon className="h-5 w-5" />
                </div>
            </CardHeader>
            <CardContent>
                <div className="text-3xl font-bold tracking-tight">
                    {value}
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
