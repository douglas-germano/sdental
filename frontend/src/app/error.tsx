'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="flex flex-col items-center text-center max-w-sm">
        <div className="h-14 w-14 rounded-xl bg-destructive/10 border border-destructive/15 flex items-center justify-center mb-5">
          <AlertTriangle className="h-6 w-6 text-destructive" />
        </div>
        <p className="text-kicker mb-2">Algo deu errado</p>
        <h1 className="text-xl font-semibold text-foreground mb-2">
          Ocorreu um erro inesperado
        </h1>
        <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
          Tente novamente. Se o problema persistir, volte ao início.
        </p>
        <div className="flex items-center gap-3">
          <Link href="/" className={buttonVariants({ variant: 'outline' })}>
            Voltar ao início
          </Link>
          <Button onClick={reset}>Tentar novamente</Button>
        </div>
      </div>
    </div>
  )
}
