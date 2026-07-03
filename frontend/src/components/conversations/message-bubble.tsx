'use client'

import { useState } from 'react'
import { Message } from '@/types'
import { cn } from '@/lib/utils'
import { Bot, User, Check, CheckCheck, Clock, AlertTriangle, FileText, Download } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'

function MessageStatusTicks({ status }: { status?: string }) {
  if (status === 'failed') {
    return <AlertTriangle className="h-3 w-3 text-destructive" />
  }
  if (status === 'read') {
    return <CheckCheck className="h-3.5 w-3.5 text-sky-500" />
  }
  if (status === 'delivered') {
    return <CheckCheck className="h-3.5 w-3.5 text-muted-foreground/70" />
  }
  if (status === 'sent') {
    return <Check className="h-3.5 w-3.5 text-muted-foreground/70" />
  }
  return <Clock className="h-3 w-3 text-muted-foreground/50" />
}

function MessageMedia({ message }: { message: Message }) {
  const [lightboxOpen, setLightboxOpen] = useState(false)

  if (message.type === 'image' && message.media_url) {
    return (
      <>
        <button
          type="button"
          onClick={() => setLightboxOpen(true)}
          className="block rounded-lg overflow-hidden mb-1 max-w-[260px] hover:opacity-90 transition-opacity"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={message.media_url} alt={message.caption || 'Imagem'} className="w-full h-auto max-h-[260px] object-cover" />
        </button>
        <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
          <DialogContent className="sm:max-w-2xl p-2 bg-transparent border-0 shadow-none">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={message.media_url} alt={message.caption || 'Imagem'} className="w-full h-auto rounded-lg" />
          </DialogContent>
        </Dialog>
      </>
    )
  }

  if (message.type === 'audio' && message.media_url) {
    return (
      <audio controls src={message.media_url} className="max-w-[260px] h-10 mb-1">
        Seu navegador nao suporta audio.
      </audio>
    )
  }

  if (message.type === 'document' && message.media_url) {
    return (
      <a
        href={message.media_url}
        download
        className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-background/60 px-3 py-2 mb-1 max-w-[260px] hover:bg-background transition-colors"
      >
        <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
          <FileText className="h-4 w-4 text-primary" />
        </div>
        <span className="text-xs font-medium truncate flex-1">Documento</span>
        <Download className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      </a>
    )
  }

  return null
}

export function MessageBubble({ message }: { message: Message }) {
  const outgoing = message.role === 'assistant'
  const hasMedia = message.type && message.type !== 'text'
  const textContent = hasMedia ? message.caption : message.content

  return (
    <div className={cn('flex gap-2 items-end', outgoing ? 'flex-row-reverse' : 'flex-row')}>
      <div
        className={cn(
          'shrink-0 w-7 h-7 rounded-full flex items-center justify-center',
          outgoing ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
        )}
      >
        {outgoing ? <Bot className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
      </div>
      <div
        className={cn(
          'max-w-[75%] sm:max-w-[65%] rounded-2xl px-3 py-2',
          outgoing ? 'bg-primary/10 rounded-br-sm' : 'bg-muted rounded-bl-sm'
        )}
      >
        <MessageMedia message={message} />
        {textContent && (
          <p className="whitespace-pre-wrap text-sm leading-relaxed break-words">{textContent}</p>
        )}
        <div className={cn('flex items-center gap-1 mt-1', outgoing ? 'justify-end' : 'justify-start')}>
          <span className="text-[10px] text-muted-foreground">
            {new Date(message.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </span>
          {outgoing && <MessageStatusTicks status={message.status} />}
        </div>
      </div>
    </div>
  )
}
