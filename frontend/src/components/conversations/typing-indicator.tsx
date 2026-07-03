'use client'

import { User } from '@phosphor-icons/react'

export function TypingIndicator() {
  return (
    <div className="flex gap-2 items-end animate-in fade-in duration-150">
      <div className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center bg-muted text-muted-foreground">
        <User className="h-3.5 w-3.5" />
      </div>
      <div className="rounded-2xl rounded-bl-sm bg-muted px-3.5 py-3 flex items-center gap-1">
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce" />
      </div>
    </div>
  )
}
