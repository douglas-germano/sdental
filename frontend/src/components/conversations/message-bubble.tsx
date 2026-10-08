'use client'

import { useEffect, useState } from 'react'
import { Message } from '@/types'
import { cn } from '@/lib/utils'
import api, { resolveMediaUrl } from '@/lib/api'
import { Robot as Bot, User, Check, Checks as CheckCheck, Clock, Warning as AlertTriangle, FileText, DownloadSimple as Download, DeviceMobile as Phone, Headset } from '@phosphor-icons/react'
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

function MessageMedia({ message, conversationId }: { message: Message; conversationId: string }) {
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [failed, setFailed] = useState(false)
  const [recovery, setRecovery] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [documentLoading, setDocumentLoading] = useState(false)
  const mediaUrl = message.media_url
  const recoveryUrl = message.id ? `/api/media/conversations/${encodeURIComponent(conversationId)}/${encodeURIComponent(message.id)}` : undefined
  // WhatsApp CDN links contain encrypted bytes, not browser-readable media.
  const encrypted = mediaUrl ? /^https?:\/\/(?:[^/]+\.)?whatsapp\.net\//i.test(mediaUrl) || /\.enc(?:\?|$)/i.test(mediaUrl) : false
  const selectedUrl = recovery || encrypted || !mediaUrl ? recoveryUrl : mediaUrl
  const resolved = resolveMediaUrl(selectedUrl)
  const mediaSrc = resolved && attempt ? `${resolved}${resolved.includes('?') ? '&' : '?'}retry=${attempt}` : resolved
  const label = ({ image: 'Imagem', sticker: 'Figurinha', audio: 'Áudio', video: 'Vídeo', document: 'Documento' } as Record<string, string>)[message.type || ''] || 'Anexo'

  useEffect(() => { setFailed(false); setRecovery(false); setAttempt(0) }, [message.id, mediaUrl])

  function onError() {
    if (!recovery && selectedUrl !== recoveryUrl && recoveryUrl) setRecovery(true)
    else setFailed(true)
  }

  if (!message.type || message.type === 'text') return null
  if (failed || !mediaSrc) return <div className="rounded-lg border border-border bg-background/60 p-3 mb-1 max-w-[260px]">
    <p className="text-sm font-medium">{label} indisponível</p>
    <p className="text-xs text-muted-foreground mt-1">Não foi possível carregar o anexo. Se ele expirou no WhatsApp, peça o reenvio.</p>
    {mediaSrc && <button type="button" className="text-xs font-semibold text-primary min-h-11 underline" onClick={() => { setFailed(false); setAttempt(a => a + 1) }}>Tentar novamente</button>}
  </div>

  if (message.type === 'image' || message.type === 'sticker') {
    const sticker = message.type === 'sticker' || message.media_mimetype === 'image/webp'
    return <>
      <button type="button" aria-label={`Ampliar ${label.toLowerCase()}`} onClick={() => setLightboxOpen(true)} className="block rounded-lg overflow-hidden mb-1 max-w-[260px] hover:opacity-90 transition-opacity">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={mediaSrc} onError={onError} alt={message.caption || label} loading="lazy" className={cn('h-auto object-contain', sticker ? 'max-w-[160px] max-h-[160px]' : 'max-w-full max-h-[260px]')} />
      </button>
      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent aria-label={label} className="sm:max-w-2xl p-2 bg-card border-0 shadow-none">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mediaSrc} onError={onError} alt={message.caption || label} className="max-w-full max-h-[80vh] mx-auto object-contain rounded-lg" />
        </DialogContent>
      </Dialog>
    </>
  }
  if (message.type === 'audio') return <audio key={mediaSrc} controls preload="none" src={mediaSrc} onError={onError} aria-label="Áudio recebido" className="max-w-full w-[260px] h-10 mb-1">Seu navegador não suporta áudio.</audio>
  if (message.type === 'video') return <video key={mediaSrc} controls playsInline preload="metadata" src={mediaSrc} onError={onError} aria-label="Vídeo recebido" className="max-w-full w-[260px] max-h-[320px] rounded-lg mb-1">Seu navegador não suporta vídeo.</video>
  if (message.type === 'document') return <button type="button" disabled={documentLoading} onClick={async () => {
    setDocumentLoading(true)
    try {
      const blob = selectedUrl?.startsWith('/api/')
        ? (await api.get<Blob>(selectedUrl.slice(4), { responseType: 'blob' })).data
        : await fetch(mediaSrc).then(response => { if (!response.ok) throw new Error('Documento indisponível'); return response.blob() })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'documento'
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch { onError() }
    finally { setDocumentLoading(false) }
  }} className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-background/60 px-3 py-3 mb-1 max-w-[260px] hover:bg-background transition-colors disabled:opacity-60">
    <FileText className="h-5 w-5 text-primary shrink-0" /><span className="text-xs font-medium truncate flex-1">{documentLoading ? 'Carregando documento…' : 'Baixar documento'}</span><Download className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
  </button>
  return <p className="text-sm">{label}</p>
}

export function MessageBubble({ message, conversationId }: { message: Message; conversationId: string }) {
  const outgoing = message.role === 'assistant'
  const hasMedia = message.type && message.type !== 'text'
  const textContent = hasMedia ? message.caption : message.content
  const fromDashboard = message.sent_via === 'dashboard'
  const fromPhone = message.sent_via === 'whatsapp_app'

  const OutgoingIcon = fromDashboard || fromPhone ? Headset : Bot

  return (
    <div className={cn('flex gap-2 items-end', outgoing ? 'flex-row-reverse' : 'flex-row')}>
      <div
        className={cn(
          'shrink-0 w-7 h-7 rounded-full flex items-center justify-center',
          outgoing ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
        )}
        title={outgoing ? (fromDashboard ? 'Equipe (painel)' : fromPhone ? 'Equipe (celular)' : 'Assistente IA') : 'Paciente'}
      >
        {outgoing ? <OutgoingIcon className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
      </div>
      <div
        className={cn(
          'max-w-[75%] sm:max-w-[65%] rounded-2xl px-3 py-2',
          outgoing
            ? 'bg-primary/15 border border-primary/10 rounded-br-sm'
            : 'bg-muted rounded-bl-sm'
        )}
      >
        <MessageMedia message={message} conversationId={conversationId} />
        {textContent && (
          <p className="whitespace-pre-wrap text-sm leading-relaxed break-words">{textContent}</p>
        )}
        <div className={cn('flex items-center gap-1 mt-1', outgoing ? 'justify-end' : 'justify-start')}>
          {fromPhone && (
            <span
              className="flex items-center gap-0.5 text-2xs text-muted-foreground/80"
              title="Enviado diretamente pelo WhatsApp, fora da plataforma"
            >
              <Phone className="h-2.5 w-2.5" /> WhatsApp
            </span>
          )}
          {fromDashboard && (
            <span
              className="flex items-center gap-0.5 text-2xs text-muted-foreground/80"
              title="Enviado manualmente pela equipe, por este painel"
            >
              <Headset className="h-2.5 w-2.5" /> Equipe
            </span>
          )}
          <span className="text-2xs text-muted-foreground">
            {new Date(message.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </span>
          {outgoing && <MessageStatusTicks status={message.status} />}
        </div>
      </div>
    </div>
  )
}
