'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import { PaperPlaneTilt as Send, Paperclip, Microphone as Mic, Square, X, Image as ImageIcon, FileText, CircleNotch as Loader2, MusicNote as Music } from '@phosphor-icons/react'

export interface MediaPayload {
  media_type: 'image' | 'audio' | 'document'
  data: string
  mimetype: string
  filename?: string
  caption?: string
}

interface ChatComposerProps {
  onSendText: (text: string) => Promise<void>
  onSendMedia: (payload: MediaPayload) => Promise<void>
  disabled?: boolean
}

interface PendingAttachment {
  mediaType: 'image' | 'audio' | 'document'
  mimetype: string
  filename?: string
  base64: string
  previewUrl: string
}

const MAX_FILE_BYTES = 8 * 1024 * 1024

function mediaTypeFromMime(mime: string): 'image' | 'audio' | 'document' {
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('audio/')) return 'audio'
  return 'document'
}

function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(',')[1] || '')
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export function ChatComposer({ onSendText, onSendMedia, disabled }: ChatComposerProps) {
  const { toast } = useToast()
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [attachment, setAttachment] = useState<PendingAttachment | null>(null)
  const [recording, setRecording] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [micSupported, setMicSupported] = useState(false)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordedChunksRef = useRef<Blob[]>([])
  const recordingTimerRef = useRef<ReturnType<typeof setInterval>>()
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    setMicSupported(
      typeof navigator !== 'undefined' &&
      !!navigator.mediaDevices?.getUserMedia &&
      typeof window.MediaRecorder !== 'undefined'
    )
  }, [])

  useEffect(() => {
    if (!textareaRef.current) return
    textareaRef.current.style.height = 'auto'
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`
  }, [text])

  useEffect(() => {
    return () => {
      clearInterval(recordingTimerRef.current)
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    if (file.size > MAX_FILE_BYTES) {
      toast({ title: 'Arquivo muito grande', description: 'O tamanho maximo e 8MB.', variant: 'error' })
      return
    }

    try {
      const base64 = await fileToBase64(file)
      setAttachment({
        mediaType: mediaTypeFromMime(file.type),
        mimetype: file.type || 'application/octet-stream',
        filename: file.name,
        base64,
        previewUrl: URL.createObjectURL(file)
      })
    } catch {
      toast({ title: 'Nao foi possivel ler o arquivo', variant: 'error' })
    }
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const recorder = new MediaRecorder(stream)
      recordedChunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data)
      }

      recorder.onstop = async () => {
        const blob = new Blob(recordedChunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        stream.getTracks().forEach((t) => t.stop())
        clearInterval(recordingTimerRef.current)

        if (blob.size > MAX_FILE_BYTES) {
          toast({ title: 'Gravacao muito longa', description: 'O tamanho maximo e 8MB.', variant: 'error' })
          return
        }

        const base64 = await fileToBase64(blob)
        setAttachment({
          mediaType: 'audio',
          mimetype: blob.type,
          filename: 'audio.webm',
          base64,
          previewUrl: URL.createObjectURL(blob)
        })
      }

      mediaRecorderRef.current = recorder
      recorder.start()
      setRecording(true)
      setRecordingSeconds(0)
      recordingTimerRef.current = setInterval(() => setRecordingSeconds((s) => s + 1), 1000)
    } catch {
      toast({ title: 'Nao foi possivel acessar o microfone', variant: 'error' })
    }
  }

  const stopRecording = () => {
    mediaRecorderRef.current?.stop()
    setRecording(false)
  }

  const removeAttachment = () => {
    if (attachment) URL.revokeObjectURL(attachment.previewUrl)
    setAttachment(null)
  }

  const handleSend = async () => {
    if (sending) return

    if (attachment) {
      setSending(true)
      try {
        await onSendMedia({
          media_type: attachment.mediaType,
          data: attachment.base64,
          mimetype: attachment.mimetype,
          filename: attachment.filename,
          caption: text.trim() || undefined
        })
        removeAttachment()
        setText('')
      } catch {
        toast({ title: 'Erro ao enviar arquivo', variant: 'error' })
      } finally {
        setSending(false)
      }
      return
    }

    const trimmed = text.trim()
    if (!trimmed) return

    setSending(true)
    try {
      await onSendText(trimmed)
      setText('')
    } catch {
      toast({ title: 'Erro ao enviar mensagem', description: 'Verifique se o WhatsApp esta conectado.', variant: 'error' })
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const formatSeconds = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  return (
    <div className="border-t border-border shrink-0 bg-card">
      {attachment && (
        <div className="flex items-center gap-3 px-4 pt-3">
          <div className="relative">
            {attachment.mediaType === 'image' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={attachment.previewUrl} alt="preview" className="h-14 w-14 rounded-lg object-cover border border-border" />
            ) : (
              <div className="h-14 w-14 rounded-lg border border-border bg-muted flex items-center justify-center">
                {attachment.mediaType === 'audio' ? <Music className="h-5 w-5 text-muted-foreground" /> : <FileText className="h-5 w-5 text-muted-foreground" />}
              </div>
            )}
            <button
              onClick={removeAttachment}
              className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground truncate flex-1">{attachment.filename || 'Anexo'}</p>
        </div>
      )}

      <div className="flex items-end gap-2 p-3">
        {recording ? (
          <div className="flex-1 flex items-center gap-3 h-10 px-4 rounded-full bg-destructive/10 text-destructive">
            <span className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
            <span className="text-sm font-medium">Gravando {formatSeconds(recordingSeconds)}</span>
          </div>
        ) : (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,audio/*,.pdf,.doc,.docx,.txt"
              className="hidden"
              onChange={handleFilePick}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0 rounded-full"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || sending}
              title="Anexar arquivo"
            >
              <Paperclip className="h-5 w-5" />
            </Button>

            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={attachment ? 'Adicionar legenda...' : 'Digite uma mensagem...'}
              rows={1}
              disabled={disabled || sending}
              className={cn(
                'flex-1 resize-none rounded-2xl border border-input bg-background px-4 py-2.5 text-sm',
                'placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25 focus-visible:border-primary',
                'max-h-[120px] scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent'
              )}
            />
          </>
        )}

        {!recording && !text.trim() && !attachment && micSupported ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0 rounded-full"
            onClick={startRecording}
            disabled={disabled}
            title="Gravar audio"
          >
            <Mic className="h-5 w-5" />
          </Button>
        ) : recording ? (
          <Button
            type="button"
            variant="destructive"
            size="icon"
            className="shrink-0 rounded-full"
            onClick={stopRecording}
            title="Parar gravacao"
          >
            <Square className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            type="button"
            size="icon"
            className="shrink-0 rounded-full"
            onClick={handleSend}
            disabled={disabled || sending || (!text.trim() && !attachment)}
            title="Enviar"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        )}
      </div>
    </div>
  )
}
