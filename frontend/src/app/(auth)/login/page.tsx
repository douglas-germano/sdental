'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAuth } from '@/app/providers'
import { loginSchema, type LoginForm } from '@/lib/validations'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { EnvelopeSimple as Mail, Lock, ChatCircleDots, ArrowRight, CheckCircle as CheckCircle2 } from '@phosphor-icons/react'
import { SubscriptionInactiveCard } from '@/components/billing/subscription-inactive-card'
import type { SubscriptionStatus } from '@/types'
import type { SubscriptionInactiveError } from '@/app/providers'

export default function LoginPage() {
  const { login } = useAuth()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [subscriptionError, setSubscriptionError] = useState<SubscriptionInactiveError | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  })

  const onSubmit = async (data: LoginForm) => {
    setError('')
    setSubscriptionError(null)
    setLoading(true)

    try {
      await login(data.email, data.password)
    } catch (err: unknown) {
      const error = err as { response?: { data?: Partial<SubscriptionInactiveError> & { error?: string } } }
      const responseData = error.response?.data
      if (responseData?.error_code === 'SUBSCRIPTION_INACTIVE') {
        setSubscriptionError(responseData as SubscriptionInactiveError)
      } else {
        setError(responseData?.error || 'Erro ao fazer login')
      }
    } finally {
      setLoading(false)
    }
  }

  if (subscriptionError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <SubscriptionInactiveCard
          subscriptionStatus={subscriptionError.subscription_status as SubscriptionStatus}
          checkoutUrl={subscriptionError.checkout_url}
          footer={
            <Button variant="ghost" className="w-full" onClick={() => setSubscriptionError(null)}>
              Voltar
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex">
      {/* Left side - Charcoal institutional panel */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-charcoal text-charcoal-foreground">
        <div className="relative z-10 flex flex-col justify-center px-12 xl:px-16">
          <div className="flex items-center gap-3 mb-10">
            <div className="w-11 h-11 rounded-full bg-primary flex items-center justify-center">
              <ChatCircleDots className="h-5 w-5 text-white" weight="fill" />
            </div>
            <span className="text-xl font-bold uppercase tracking-tight text-white">SDental</span>
          </div>

          <h1 className="text-4xl xl:text-5xl font-bold text-white mb-5 leading-[1.02]">
            Gerencie sua clinica<br />de forma inteligente
          </h1>

          <p className="text-base text-white/60 mb-10 max-w-sm leading-relaxed">
            Automatize agendamentos, gerencie pacientes e otimize o atendimento com inteligencia artificial.
          </p>

          <div className="space-y-3.5">
            {[
              'Agendamento automatico via WhatsApp',
              'Gestao completa de pacientes',
              'Relatorios e analises detalhadas'
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3 text-white/80">
                <CheckCircle2 className="w-5 h-5 text-primary shrink-0" weight="fill" />
                <span className="text-sm font-medium">{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 h-2 bg-primary" aria-hidden="true" />
      </div>

      {/* Right side - Login form */}
      <div className="flex-1 flex items-center justify-center p-6 bg-background">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center justify-center gap-2.5 mb-8">
            <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
              <ChatCircleDots className="h-5 w-5 text-white" weight="fill" />
            </div>
            <span className="text-xl font-bold uppercase">SDental</span>
          </div>

          <Card>
            <CardHeader className="space-y-1 pb-4">
              <CardTitle className="text-xl text-center">Bem-vindo de volta</CardTitle>
              <CardDescription className="text-center text-sm">
                Entre na sua conta para acessar o painel
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleSubmit(onSubmit)}>
              <CardContent className="space-y-4">
                {error && (
                  <div className="bg-destructive/8 text-destructive p-3 rounded-button text-sm flex items-center gap-2 border border-destructive/20">
                    <AlertIcon />
                    {error}
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="clinica@exemplo.com"
                      {...register('email')}
                      className="pl-10"
                    />
                  </div>
                  {errors.email && <p className="text-sm text-destructive mt-1">{errors.email.message}</p>}
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-sm">Senha</Label>
                    <Link href="/esqueci-senha" className="text-xs text-accent hover:underline font-medium">
                      Esqueci minha senha
                    </Link>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                    <Input
                      id="password"
                      type="password"
                      placeholder="********"
                      {...register('password')}
                      className="pl-10"
                    />
                  </div>
                  {errors.password && <p className="text-sm text-destructive mt-1">{errors.password.message}</p>}
                </div>
              </CardContent>
              <CardFooter className="flex flex-col space-y-4 pt-2">
                <Button
                  type="submit"
                  className="w-full h-11"
                  loading={loading}
                >
                  {loading ? 'Entrando...' : (
                    <>
                      Entrar
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
                <p className="text-sm text-center text-muted-foreground">
                  Ainda nao tem uma conta?{' '}
                  <Link href="/register" className="text-accent hover:underline font-medium">
                    Cadastre-se
                  </Link>
                </p>
              </CardFooter>
            </form>
          </Card>
        </div>
      </div>
    </div>
  )
}

function AlertIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
    </svg>
  )
}
