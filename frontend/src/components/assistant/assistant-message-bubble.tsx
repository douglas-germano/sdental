'use client'

import { AssistantMessage } from '@/types'
import { cn } from '@/lib/utils'
import { Sparkle, User } from '@phosphor-icons/react'

export function AssistantMessageBubble({ message }: { message: AssistantMessage }) {
  const isAssistant = message.role === 'assistant'

  return (
    <div className={cn('flex gap-2 items-end', isAssistant ? 'flex-row' : 'flex-row-reverse')}>
      <div
        className={cn(
          'shrink-0 w-7 h-7 rounded-full flex items-center justify-center',
          isAssistant ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
        )}
      >
        {isAssistant ? <Sparkle className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
      </div>
      <div
        className={cn(
          'max-w-[80%] sm:max-w-[70%] rounded-2xl px-3.5 py-2.5',
          isAssistant ? 'bg-muted rounded-bl-sm' : 'bg-primary/10 rounded-br-sm'
        )}
      >
        <p className="whitespace-pre-wrap text-sm leading-relaxed break-words">{message.content}</p>
        <div className={cn('mt-1', isAssistant ? 'text-left' : 'text-right')}>
          <span className="text-[10px] text-muted-foreground">
            {new Date(message.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>
    </div>
  )
}
