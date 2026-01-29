'use client'

import { useState, useEffect } from 'react'
import { Check, Loader2, AlertCircle, WifiOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'

type SyncStatus = 'synced' | 'syncing' | 'error' | 'offline'

interface SyncIndicatorProps {
  status?: SyncStatus
  lastSyncTime?: Date
  className?: string
}

/**
 * Indicador de status de sincronização
 * Mostra se os dados estão sincronizados, sincronizando, com erro ou offline
 */
export function SyncIndicator({
  status: externalStatus,
  lastSyncTime,
  className
}: SyncIndicatorProps) {
  const [status, setStatus] = useState<SyncStatus>(externalStatus || 'synced')
  const [isOnline, setIsOnline] = useState(true)

  // Detectar status online/offline
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
      if (status === 'offline') setStatus('synced')
    }

    const handleOffline = () => {
      setIsOnline(false)
      setStatus('offline')
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Check initial status
    setIsOnline(navigator.onLine)
    if (!navigator.onLine) setStatus('offline')

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Use external status if provided
  useEffect(() => {
    if (externalStatus && isOnline) {
      setStatus(externalStatus)
    }
  }, [externalStatus, isOnline])

  const getStatusConfig = () => {
    switch (status) {
      case 'synced':
        return {
          icon: Check,
          text: 'Sincronizado',
          color: 'text-success',
          bgColor: 'bg-success/10',
        }
      case 'syncing':
        return {
          icon: Loader2,
          text: 'Sincronizando...',
          color: 'text-primary',
          bgColor: 'bg-primary/10',
          animate: true,
        }
      case 'error':
        return {
          icon: AlertCircle,
          text: 'Erro na sincronização',
          color: 'text-destructive',
          bgColor: 'bg-destructive/10',
        }
      case 'offline':
        return {
          icon: WifiOff,
          text: 'Offline',
          color: 'text-muted-foreground',
          bgColor: 'bg-muted',
        }
    }
  }

  const config = getStatusConfig()
  const Icon = config.icon

  const getTooltipContent = () => {
    if (status === 'offline') {
      return 'Sem conexão com a internet'
    }
    if (status === 'error') {
      return 'Erro ao sincronizar dados. Tente novamente.'
    }
    if (lastSyncTime) {
      const now = new Date()
      const diff = Math.floor((now.getTime() - lastSyncTime.getTime()) / 1000)

      if (diff < 60) return `Sincronizado há ${diff} segundos`
      if (diff < 3600) return `Sincronizado há ${Math.floor(diff / 60)} minutos`
      return `Sincronizado há ${Math.floor(diff / 3600)} horas`
    }
    return config.text
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200',
            config.bgColor,
            config.color,
            'cursor-help',
            className
          )}
        >
          <Icon
            className={cn(
              'h-3.5 w-3.5',
              config.animate && 'animate-spin'
            )}
          />
          <span className="hidden sm:inline">{config.text}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        {getTooltipContent()}
      </TooltipContent>
    </Tooltip>
  )
}
