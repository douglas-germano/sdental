import type { Metadata } from 'next'
import { Plus_Jakarta_Sans } from 'next/font/google'
import './globals.css'
import { AuthProvider } from './providers'
import { ToastProvider } from '@/components/ui/toast'
import { TooltipProvider } from '@/components/ui/tooltip'

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
})

export const metadata: Metadata = {
  title: 'SDental - Sistema de Agendamento',
  description: 'Plataforma de chatbot para clinicas com agendamento automatizado via WhatsApp',
  icons: {
    icon: '/icon.png',
    apple: '/apple-icon.png',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <body className={`${plusJakarta.variable} font-sans`} suppressHydrationWarning>
        <AuthProvider>
          <ToastProvider>
            <TooltipProvider>
              {children}
            </TooltipProvider>
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
