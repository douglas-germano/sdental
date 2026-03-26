'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAuth } from '@/app/providers'
import { registerSchema, type RegisterForm } from '@/lib/validations'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Building2, Mail, Phone, Lock, Sparkles, ArrowRight } from 'lucide-react'

export default function RegisterPage() {
  const { register: registerUser } = useAuth()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
  })

  const onSubmit = async (data: RegisterForm) => {
    setError('')
    setLoading(true)

    try {
      await registerUser({
        name: data.name,
        email: data.email,
        phone: data.phone,
        password: data.password,
      })
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } }
      setError(error.response?.data?.error || 'Erro ao cadastrar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden" style={{ background: 'linear-gradient(160deg, hsl(238 76% 55%) 0%, hsl(262 83% 50%) 50%, hsl(280 70% 45%) 100%)' }}>
        {/* Layered decorative elements */}
        <div className="absolute inset-0">
          <div className="absolute -top-1/3 -right-1/4 w-2/3 h-2/3 bg-white/[0.07] rounded-full blur-[100px]" />
          <div className="absolute -bottom-1/4 -left-1/4 w-1/2 h-1/2 bg-black/15 rounded-full blur-[80px]" />
          <div className="absolute inset-0 opacity-[0.04]" style={{
            backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)',
            backgroundSize: '32px 32px'
          }} />
          <div className="absolute top-[12%] left-[8%] w-20 h-20 border border-white/10 rounded-2xl rotate-12" />
          <div className="absolute bottom-[15%] right-[10%] w-14 h-14 border border-white/[0.08] rounded-xl -rotate-6" />
        </div>

        <div className="relative z-10 flex flex-col justify-center px-12 xl:px-16">
          <div className="flex items-center gap-3 mb-10">
            <div className="w-11 h-11 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center border border-white/20 shadow-lg shadow-black/10">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold text-white tracking-tight">SDental</span>
          </div>

          <h1 className="text-3xl xl:text-[2.5rem] font-bold text-white mb-5 leading-[1.15] tracking-tight">
            Comece sua jornada<br />digital
          </h1>

          <p className="text-base text-white/60 mb-10 max-w-sm leading-relaxed">
            Cadastre sua clinica e tenha acesso a todas as ferramentas para modernizar seu atendimento.
          </p>

          <div className="grid grid-cols-2 gap-3">
            {[
              { value: '+500', label: 'Clinicas ativas' },
              { value: '50k+', label: 'Agendamentos/mes' },
              { value: '98%', label: 'Satisfacao' },
              { value: '24/7', label: 'Atendimento IA' }
            ].map((stat, i) => (
              <div key={i} className="p-4 rounded-xl bg-white/[0.08] border border-white/10 backdrop-blur-sm hover:bg-white/[0.12] transition-colors">
                <div className="text-2xl font-bold text-white mb-0.5 tracking-tight">{stat.value}</div>
                <div className="text-xs text-white/50 font-medium">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right side - Register form */}
      <div className="flex-1 flex items-center justify-center p-6 bg-background">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center justify-center gap-2.5 mb-6">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-semibold">SDental</span>
          </div>

          <Card className="border-border/40 shadow-soft-md">
            <CardHeader className="space-y-1 pb-4">
              <CardTitle className="text-xl font-semibold text-center">Criar Conta</CardTitle>
              <CardDescription className="text-center text-sm">
                Cadastre sua clinica para comecar a usar o SDental
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleSubmit(onSubmit)}>
              <CardContent className="space-y-4">
                {error && (
                  <div className="bg-destructive/8 text-destructive p-3 rounded-lg text-sm flex items-center gap-2 border border-destructive/10">
                    <AlertIcon />
                    {error}
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-sm">Nome da Clinica</Label>
                  <div className="relative">
                    <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                    <Input
                      id="name"
                      type="text"
                      placeholder="Clinica Exemplo"
                      {...register('name')}
                      className="pl-10"
                    />
                  </div>
                  {errors.name && <p className="text-sm text-destructive mt-1">{errors.name.message}</p>}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-sm">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                      <Input
                        id="email"
                        type="email"
                        placeholder="email@exemplo.com"
                        {...register('email')}
                        className="pl-10"
                      />
                    </div>
                    {errors.email && <p className="text-sm text-destructive mt-1">{errors.email.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone" className="text-sm">Telefone</Label>
                    <div className="relative">
                      <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                      <Input
                        id="phone"
                        type="tel"
                        placeholder="(11) 99999-9999"
                        {...register('phone')}
                        className="pl-10"
                      />
                    </div>
                    {errors.phone && <p className="text-sm text-destructive mt-1">{errors.phone.message}</p>}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-sm">Senha</Label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                      <Input
                        id="password"
                        type="password"
                        placeholder="Min. 8 caracteres"
                        {...register('password')}
                        className="pl-10"
                      />
                    </div>
                    {errors.password && <p className="text-sm text-destructive mt-1">{errors.password.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword" className="text-sm">Confirmar</Label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                      <Input
                        id="confirmPassword"
                        type="password"
                        placeholder="Repita a senha"
                        {...register('confirmPassword')}
                        className="pl-10"
                      />
                    </div>
                    {errors.confirmPassword && <p className="text-sm text-destructive mt-1">{errors.confirmPassword.message}</p>}
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex flex-col space-y-4 pt-2">
                <Button
                  type="submit"
                  className="w-full h-11"
                  loading={loading}
                >
                  {loading ? 'Cadastrando...' : (
                    <>
                      Cadastrar
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
                <p className="text-sm text-center text-muted-foreground">
                  Ja tem uma conta?{' '}
                  <Link href="/login" className="text-primary hover:underline font-medium">
                    Faca login
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
