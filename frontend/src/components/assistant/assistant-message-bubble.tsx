'use client'

import { useState } from 'react'
import { AssistantMessage } from '@/types'
import { cn } from '@/lib/utils'
import { Sparkle, Copy, Check } from '@phosphor-icons/react'
import { MarkdownContent } from './markdown-content'

export function AssistantMessageBubble({ message }: { message: AssistantMessage }) {
  const isAssistant = message.role === 'assistant'
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard access denied - fail silently, copy is a nicety, not critical.
    }
  }

  if (!isAssistant) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] sm:max-w-[65%] rounded-2xl rounded-br-sm bg-muted px-4 py-2.5">
          <p className="whitespace-pre-wrap text-sm leading-relaxed break-words">{message.content}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="group flex gap-3 items-start">
      <div className="shrink-0 w-7 h-7 mt-0.5 rounded-full bg-primary/10 text-primary flex items-center justify-center">
        <Sparkle className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <MarkdownContent content={message.content} />
        <button
          type="button"
          onClick={handleCopy}
          className={cn(
            'mt-1.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground/70 hover:text-foreground transition-colors opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
            copied && 'opacity-100'
          )}
        >
          {copied ? (
            <>
              <Check className="h-3 w-3" /> Copiado
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" /> Copiar
            </>
          )}
        </button>
      </div>
    </div>
  )
}
