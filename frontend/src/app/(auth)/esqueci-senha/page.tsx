'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { authApi } from '@/lib/api'
import { forgotPasswordSchema, type ForgotPasswordForm } from '@/lib/validations'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Mail, Sparkles, ArrowLeft, MailCheck } from 'lucide-react'

export default function ForgotPasswordPage() {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordForm>({
    resolver: zodResolver(forgotPasswordSchema),
  })

  const onSubmit = async (data: ForgotPasswordForm) => {
    setError('')
    setLoading(true)

    try {
      await authApi.forgotPassword(data.email)
      setSent(true)
    } catch {
      setError('Nao foi possivel processar sua solicitacao. Tente novamente.')
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
          {sent ? (
            <>
              <CardHeader className="space-y-3 pb-4 items-center text-center">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <MailCheck className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="text-xl font-semibold">Verifique seu e-mail</CardTitle>
                <CardDescription className="text-sm">
                  Se o e-mail informado estiver cadastrado, voce recebera um link para redefinir sua senha em instantes.
                </CardDescription>
              </CardHeader>
              <CardFooter className="pt-2">
                <Link href="/login" className="w-full">
                  <Button variant="outline" className="w-full h-11">
                    <ArrowLeft className="h-4 w-4" />
                    Voltar para o login
                  </Button>
                </Link>
              </CardFooter>
            </>
          ) : (
            <>
              <CardHeader className="space-y-1 pb-4">
                <CardTitle className="text-xl font-semibold text-center">Esqueceu sua senha?</CardTitle>
                <CardDescription className="text-center text-sm">
                  Informe seu e-mail e enviaremos um link para redefinir sua senha
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
                </CardContent>
                <CardFooter className="flex flex-col space-y-4 pt-2">
                  <Button type="submit" className="w-full h-11" loading={loading}>
                    {loading ? 'Enviando...' : 'Enviar link de redefinicao'}
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
