'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { clinicsApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { WifiHigh as Wifi, DeviceMobile as Smartphone, QrCode, CheckCircle as CheckCircle2, ArrowsClockwise as RefreshCw, CircleNotch as Loader2, ChatCircle as MessageCircle, ShieldCheck, CaretRight as ChevronRight } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

type WizardStep = 'intro' | 'connecting' | 'qrcode' | 'connected'

const STATUS_POLL_INTERVAL_MS = 3000

export function WhatsappConnectionWizard() {
  const [step, setStep] = useState<WizardStep>('intro')
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [qrExpiresIn, setQrExpiresIn] = useState(30)
  const [secondsLeft, setSecondsLeft] = useState(30)
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshingQr, setRefreshingQr] = useState(false)

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const clearTimers = () => {
    if (pollRef.current) clearInterval(pollRef.current)
    if (countdownRef.current) clearInterval(countdownRef.current)
    pollRef.current = null
    countdownRef.current = null
  }

  const checkInitialStatus = useCallback(async () => {
    try {
      const { data } = await clinicsApi.getEvolutionStatus()
      if (data.connected) {
        setPhoneNumber(data.phone_number || null)
        setStep('connected')
      }
    } catch {
      // Stay on intro - clinic likely has no instance yet
    }
  }, [])

  useEffect(() => {
    checkInitialStatus()
    return clearTimers
  }, [checkInitialStatus])

  const fetchQrCode = useCallback(async () => {
    setError(null)
    setRefreshingQr(true)
    try {
      const { data } = await clinicsApi.getEvolutionQrCode()
      if (data.qrcode) {
        setQrCode(data.qrcode)
        const ttl = data.expires_in || 30
        setQrExpiresIn(ttl)
        setSecondsLeft(ttl)
        setStep('qrcode')
      } else {
        setError('Nao foi possivel gerar o QR code. Tente novamente.')
      }
    } catch {
      setError('Nao foi possivel gerar o QR code. Tente novamente.')
    } finally {
      setRefreshingQr(false)
    }
  }, [])

  const handleStartConnection = async () => {
    setError(null)
    setStep('connecting')
    try {
      await clinicsApi.createEvolutionInstance()
      await fetchQrCode()
    } catch {
      setError('Erro ao iniciar conexao. Tente novamente.')
      setStep('intro')
    }
  }

  const handleReconnect = () => {
    clearTimers()
    setPhoneNumber(null)
    setQrCode(null)
    setStep('intro')
  }

  // While showing the QR code: poll connection status, and count down to auto-refresh
  useEffect(() => {
    if (step !== 'qrcode') return

    pollRef.current = setInterval(async () => {
      try {
        const { data } = await clinicsApi.getEvolutionStatus()
        if (data.connected) {
          clearTimers()
          setPhoneNumber(data.phone_number || null)
          setQrCode(null)
          setStep('connected')
        }
      } catch {
        // Ignore transient polling errors
      }
    }, STATUS_POLL_INTERVAL_MS)

    countdownRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          fetchQrCode()
          return qrExpiresIn
        }
        return prev - 1
      })
    }, 1000)

    return clearTimers
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  const progressPct = Math.max(0, Math.min(100, (secondsLeft / qrExpiresIn) * 100))

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-destructive/8 text-destructive p-3 rounded-lg text-sm border border-destructive/10">
          {error}
        </div>
      )}

      {/* Step indicator */}
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-2">
        {(['intro', 'qrcode', 'connected'] as const).map((s, i) => {
          const active = (s === 'intro' && ['intro', 'connecting'].includes(step)) ||
            (s === 'qrcode' && step === 'qrcode') ||
            (s === 'connected' && step === 'connected')
          const done = (s === 'intro' && ['qrcode', 'connected'].includes(step)) ||
            (s === 'qrcode' && step === 'connected')
          return (
            <div key={s} className="flex items-center gap-2">
              <div className={cn(
                'w-6 h-6 rounded-full flex items-center justify-center border text-[11px]',
                active && 'bg-primary text-primary-foreground border-primary',
                done && !active && 'bg-primary/15 text-primary border-primary/30',
                !active && !done && 'border-border text-muted-foreground'
              )}>
                {done && !active ? <CheckCircle2 className="w-3.5 h-3.5" /> : i + 1}
              </div>
              <span className={cn(active && 'text-foreground')}>
                {s === 'intro' ? 'Iniciar' : s === 'qrcode' ? 'Escanear' : 'Conectado'}
              </span>
              {i < 2 && <ChevronRight className="w-3.5 h-3.5 opacity-40" />}
            </div>
          )
        })}
      </div>

      {/* Step: intro */}
      {step === 'intro' && (
        <div className="rounded-2xl border border-border/60 bg-card p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <MessageCircle className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-foreground">Conecte o WhatsApp da sua clinica</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Voce vai escanear um QR code com o celular que usa o WhatsApp da clinica. A partir dai, o assistente de IA podera responder pacientes automaticamente.
              </p>
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-3 mt-5">
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-muted/40">
              <Smartphone className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <span className="text-xs text-muted-foreground">Tenha o celular com WhatsApp da clinica em maos</span>
            </div>
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-muted/40">
              <QrCode className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <span className="text-xs text-muted-foreground">O QR code expira rapido e se renova sozinho</span>
            </div>
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-muted/40">
              <ShieldCheck className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <span className="text-xs text-muted-foreground">A conexao usa o WhatsApp Web oficial do seu numero</span>
            </div>
          </div>

          <Button
            variant="gradient"
            onClick={handleStartConnection}
            className="gap-2 mt-5"
          >
            <Wifi className="h-4 w-4" />
            Iniciar conexao
          </Button>
        </div>
      )}

      {/* Step: connecting */}
      {step === 'connecting' && (
        <div className="rounded-2xl border border-border/60 bg-card p-10 flex flex-col items-center justify-center text-center">
          <Loader2 className="h-8 w-8 text-primary animate-spin mb-4" />
          <p className="font-medium text-foreground">Preparando a conexao...</p>
          <p className="text-sm text-muted-foreground mt-1">Isso leva apenas alguns segundos</p>
        </div>
      )}

      {/* Step: qrcode */}
      {step === 'qrcode' && qrCode && (
        <div className="rounded-2xl border border-border/60 bg-card p-6 flex flex-col items-center">
          <h3 className="font-semibold text-foreground mb-1">Escaneie o QR Code</h3>
          <p className="text-sm text-muted-foreground text-center max-w-sm mb-4">
            No WhatsApp do celular, va em <strong>Aparelhos conectados</strong> {'>'} <strong>Conectar aparelho</strong> e aponte a camera para o codigo abaixo.
          </p>

          <div className="relative bg-white p-4 rounded-2xl border border-border/60 shadow-soft">
            <img
              src={qrCode.startsWith('data:image') ? qrCode : `data:image/png;base64,${qrCode}`}
              alt="WhatsApp QR Code"
              className="w-56 h-56"
            />
            {refreshingQr && (
              <div className="absolute inset-4 bg-white/80 flex items-center justify-center rounded-xl">
                <Loader2 className="h-6 w-6 text-primary animate-spin" />
              </div>
            )}
          </div>

          <div className="w-56 h-1.5 rounded-full bg-muted mt-4 overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-1000 ease-linear"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {secondsLeft > 0 ? `Codigo se renova em ${secondsLeft}s` : 'Renovando codigo...'}
          </p>

          <div className="flex items-center gap-2 mt-4 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Aguardando leitura do codigo...
          </div>

          <Button variant="ghost" size="sm" className="mt-4" onClick={handleReconnect}>
            Cancelar
          </Button>
        </div>
      )}

      {/* Step: connected */}
      {step === 'connected' && (
        <div className="rounded-2xl border border-success/30 bg-success/5 p-6 flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-full bg-success/15 flex items-center justify-center mb-3">
            <CheckCircle2 className="h-7 w-7 text-success" />
          </div>
          <h3 className="font-semibold text-foreground">WhatsApp conectado!</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {phoneNumber
              ? `Numero conectado: +${phoneNumber}`
              : 'Sua clinica ja pode receber e responder mensagens.'}
          </p>
          <Button variant="outline" size="sm" className="gap-2 mt-4" onClick={handleReconnect}>
            <RefreshCw className="h-3.5 w-3.5" />
            Reconectar / trocar numero
          </Button>
        </div>
      )}
    </div>
  )
}
