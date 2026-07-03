'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { authApi } from '@/lib/api'
import { resetPasswordSchema, type ResetPasswordForm } from '@/lib/validations'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Lock, Sparkle as Sparkles, ArrowRight, CheckCircle as CheckCircle2, ArrowLeft } from '@phosphor-icons/react'

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordForm>({
    resolver: zodResolver(resetPasswordSchema),
  })

  const onSubmit = async (data: ResetPasswordForm) => {
    if (!token) {
      setError('Link invalido ou incompleto. Solicite uma nova redefinicao de senha.')
      return
    }

    setError('')
    setLoading(true)

    try {
      await authApi.resetPassword(token, data.password)
      setDone(true)
      setTimeout(() => router.push('/login'), 2500)
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } }
      setError(error.response?.data?.error || 'Nao foi possivel redefinir sua senha. O link pode ter expirado.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-semibold">SDental</span>
        </div>

        <Card className="border-border/40 shadow-soft-md">
          {done ? (
            <CardHeader className="space-y-3 pb-4 items-center text-center">
              <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6 text-success" />
              </div>
              <CardTitle className="text-xl font-semibold">Senha redefinida!</CardTitle>
              <CardDescription className="text-sm">
                Redirecionando para o login...
              </CardDescription>
            </CardHeader>
          ) : !token ? (
            <>
              <CardHeader className="space-y-1 pb-4">
                <CardTitle className="text-xl font-semibold text-center">Link invalido</CardTitle>
                <CardDescription className="text-center text-sm">
                  Este link de redefinicao de senha e invalido ou esta incompleto.
                </CardDescription>
              </CardHeader>
              <CardFooter className="pt-2">
                <Link href="/esqueci-senha" className="w-full">
                  <Button className="w-full h-11">Solicitar novo link</Button>
                </Link>
              </CardFooter>
            </>
          ) : (
            <>
              <CardHeader className="space-y-1 pb-4">
                <CardTitle className="text-xl font-semibold text-center">Redefinir senha</CardTitle>
                <CardDescription className="text-center text-sm">
                  Escolha uma nova senha para sua conta
                </CardDescription>
              </CardHeader>
              <form onSubmit={handleSubmit(onSubmit)}>
                <CardContent className="space-y-4">
                  {error && (
                    <div className="bg-destructive/8 text-destructive p-3 rounded-lg text-sm flex items-center gap-2 border border-destructive/10">
                      {error}
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-sm">Nova senha</Label>
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
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword" className="text-sm">Confirmar nova senha</Label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                      <Input
                        id="confirmPassword"
                        type="password"
                        placeholder="********"
                        {...register('confirmPassword')}
                        className="pl-10"
                      />
                    </div>
                    {errors.confirmPassword && <p className="text-sm text-destructive mt-1">{errors.confirmPassword.message}</p>}
                  </div>
                </CardContent>
                <CardFooter className="flex flex-col space-y-4 pt-2">
                  <Button type="submit" className="w-full h-11" loading={loading}>
                    {loading ? 'Salvando...' : (
                      <>
                        Redefinir senha
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </Button>
                  <Link href="/login" className="text-sm text-center text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-1.5">
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Voltar para o login
                  </Link>
                </CardFooter>
              </form>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  )
}
