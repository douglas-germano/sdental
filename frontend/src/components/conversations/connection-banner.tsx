'use client'

import Link from 'next/link'
import { WifiSlash as WifiOff } from '@phosphor-icons/react'
import { useConversations } from './conversations-provider'

/**
 * Full-width alert shown while the clinic's WhatsApp instance is
 * disconnected - the bot is not receiving messages until it reconnects.
 */
export function ConnectionBanner() {
  const { whatsappState } = useConversations()

  if (whatsappState !== 'close') return null

  return (
    <div className="flex items-center gap-2.5 bg-destructive text-destructive-foreground px-4 py-2 text-xs font-semibold shrink-0">
      <WifiOff className="h-4 w-4 shrink-0" />
      <span className="flex-1">
        WhatsApp desconectado — o assistente não está recebendo mensagens dos pacientes.
      </span>
      <Link
        href="/settings"
        className="underline underline-offset-2 whitespace-nowrap hover:opacity-80"
      >
        Reconectar
      </Link>
    </div>
  )
}
