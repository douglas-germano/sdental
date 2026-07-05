'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/app/providers'
import { billingApi } from '@/lib/api'
import { SubscriptionInactiveCard } from '@/components/billing/subscription-inactive-card'
import { Button } from '@/components/ui/button'
import { PageLoader } from '@/components/ui/page-loader'
import type { BillingStatus } from '@/types'

export default function SubscriptionPendingPage() {
  const { clinic, isLoading, logout } = useAuth()
  const router = useRouter()
  const [status, setStatus] = useState<BillingStatus | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const fetchStatus = useCallback(async () => {
    setRefreshing(true)
    try {
      const res = await billingApi.getStatus()
      setStatus(res.data)
      if (res.data.active) {
        router.push('/')
      }
    } catch {
      setStatus(null)
    } finally {
      setRefreshing(false)
    }
  }, [router])

  useEffect(() => {
    if (!isLoading && !clinic) {
      router.push('/login')
      return
    }
    if (clinic) {
      fetchStatus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinic, isLoading])

  if (isLoading || !clinic || (!status && refreshing)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <PageLoader size="lg" message="Carregando..." />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <SubscriptionInactiveCard
        subscriptionStatus={status?.subscription_status ?? 'pending_payment'}
        checkoutUrl={status?.checkout_url ?? null}
        onRefresh={fetchStatus}
        refreshing={refreshing}
        footer={
          <Button variant="ghost" className="w-full" onClick={logout}>
            Sair
          </Button>
        }
      />
    </div>
  )
}
