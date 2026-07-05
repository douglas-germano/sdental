import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CreditCard, Warning, ArrowSquareOut } from '@phosphor-icons/react'
import type { SubscriptionStatus } from '@/types'

const STATUS_COPY: Record<SubscriptionStatus, { title: string; description: string }> = {
  pending_payment: {
    title: 'Finalize seu pagamento',
    description: 'Sua clínica foi cadastrada, mas o acesso só é liberado após a confirmação do pagamento pela Kiwify.',
  },
  active: {
    title: 'Assinatura ativa',
    description: 'Sua assinatura está em dia.',
  },
  late: {
    title: 'Pagamento atrasado',
    description: 'Identificamos um atraso no pagamento da sua assinatura. Regularize para evitar a suspensão do acesso.',
  },
  canceled: {
    title: 'Assinatura cancelada',
    description: 'Sua assinatura foi cancelada. Assine novamente para voltar a usar o SDental.',
  },
  refunded: {
    title: 'Pagamento reembolsado',
    description: 'O pagamento da sua assinatura foi reembolsado e o acesso foi suspenso.',
  },
  chargeback: {
    title: 'Pagamento contestado',
    description: 'O pagamento da sua assinatura foi contestado (chargeback) e o acesso foi suspenso.',
  },
}

interface Props {
  subscriptionStatus: SubscriptionStatus
  checkoutUrl: string | null
  onRefresh?: () => void
  refreshing?: boolean
  footer?: React.ReactNode
}

export function SubscriptionInactiveCard({ subscriptionStatus, checkoutUrl, onRefresh, refreshing, footer }: Props) {
  const copy = STATUS_COPY[subscriptionStatus] ?? STATUS_COPY.pending_payment

  return (
    <Card className="max-w-md w-full">
      <CardHeader className="space-y-3 text-center">
        <div className="h-14 w-14 rounded-full bg-warning/10 flex items-center justify-center mx-auto">
          <Warning className="h-7 w-7 text-warning" />
        </div>
        <CardTitle>{copy.title}</CardTitle>
        <CardDescription>{copy.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {checkoutUrl && (
          <Button asChild className="w-full gap-2">
            <a href={checkoutUrl} target="_blank" rel="noopener noreferrer">
              <CreditCard className="h-4 w-4" />
              Ir para o pagamento
              <ArrowSquareOut className="h-4 w-4" />
            </a>
          </Button>
        )}
        {onRefresh && (
          <Button variant="outline" className="w-full" onClick={onRefresh} disabled={refreshing}>
            {refreshing ? 'Verificando...' : 'Já paguei, verificar novamente'}
          </Button>
        )}
        {footer}
      </CardContent>
    </Card>
  )
}
