import Link from 'next/link'
import { FileQuestion } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="flex flex-col items-center text-center max-w-sm">
        <div className="h-14 w-14 rounded-xl bg-muted/60 border border-border flex items-center justify-center mb-5">
          <FileQuestion className="h-6 w-6 text-muted-foreground/60" />
        </div>
        <p className="text-kicker mb-2">Erro 404</p>
        <h1 className="text-xl font-semibold text-foreground mb-2">
          Página não encontrada
        </h1>
        <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
          O endereço que você tentou acessar não existe ou foi movido.
        </p>
        <Link href="/" className={buttonVariants({ variant: 'default' })}>
          Voltar ao início
        </Link>
      </div>
    </div>
  )
}
