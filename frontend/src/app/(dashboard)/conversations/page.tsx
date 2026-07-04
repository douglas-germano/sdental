'use client'

import { Chat as MessageSquare } from '@phosphor-icons/react'

export default function ConversationsPage() {
  return (
    <div className="hidden lg:flex flex-1 flex-col items-center justify-center text-center px-6 bg-muted/20">
      <div className="h-16 w-16 rounded-card bg-muted/60 border border-border flex items-center justify-center mb-4">
        <MessageSquare className="h-7 w-7 text-muted-foreground/50" />
      </div>
      <h2 className="text-base font-semibold text-foreground mb-1">Selecione uma conversa</h2>
      <p className="text-sm text-muted-foreground max-w-[280px]">
        Escolha uma conversa na lista ao lado para ver as mensagens.
      </p>
    </div>
  )
}
