'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/app/providers'
import { Button } from '@/components/ui/button'
import { SquaresFour as LayoutDashboard, CalendarBlank as Calendar, CalendarDots, Users, Chat as MessageSquare, Gear as Settings, SignOut as LogOut, List as Menu, X, Robot as Bot, CaretLineLeft as PanelLeftClose, CaretLineRight as PanelLeft, Stethoscope, Columns, Sparkle, CurrencyDollar, ChartBar } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Pipeline', href: '/pipeline', icon: Columns },
  { name: 'Agendamentos', href: '/appointments', icon: Calendar },
  { name: 'Calendario', href: '/calendar', icon: CalendarDots },
  { name: 'Pacientes', href: '/patients', icon: Users },
  { name: 'Profissionais', href: '/professionals', icon: Stethoscope },
  { name: 'Financeiro', href: '/financial', icon: CurrencyDollar },
  { name: 'Conversas', href: '/conversations', icon: MessageSquare },
  { name: 'Agentes', href: '/agents', icon: Bot },
  { name: 'Analytics', href: '/analytics', icon: ChartBar },
  { name: 'Assistente IA', href: '/assistant', icon: Sparkle },
  { name: 'Configuracoes', href: '/settings', icon: Settings },
]

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { clinic, isLoading, logout } = useAuth()
  const pathname = usePathname()
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('sidebar-collapsed')
    if (saved !== null) {
      setSidebarCollapsed(JSON.parse(saved))
    }
  }, [])

  const toggleSidebarCollapse = () => {
    const newValue = !sidebarCollapsed
    setSidebarCollapsed(newValue)
    localStorage.setItem('sidebar-collapsed', JSON.stringify(newValue))
  }

  useEffect(() => {
    if (!isLoading && !clinic) {
      router.push('/login')
    } else if (!isLoading && clinic && !clinic.active) {
      // Session still valid but the subscription is pending/late/canceled -
      // every dashboard API call would 403, so send them to the billing screen.
      router.push('/assinatura-pendente')
    }
  }, [clinic, isLoading, router])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-[3px] border-primary/20 border-t-primary animate-spin" />
          <p className="text-muted-foreground text-sm">Carregando...</p>
        </div>
      </div>
    )
  }

  if (!clinic || !clinic.active) {
    return null
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 bg-card border-r border-border/60 transform transition-all duration-300 ease-out-expo',
          'lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
          sidebarCollapsed ? 'lg:w-[72px]' : 'lg:w-60',
          'w-60'
        )}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className={cn(
            'flex items-center h-16 px-4 border-b border-border/40 justify-between',
            sidebarCollapsed && 'lg:px-3 lg:justify-center'
          )}>
            <Link href="/" className={cn(
              'flex items-center gap-2.5 group',
              sidebarCollapsed && 'lg:gap-0'
            )}>
              <div className="shrink-0 rounded-full overflow-hidden ring-1 ring-border">
                <Image
                  src="/icon.png"
                  alt="SDental Logo"
                  width={32}
                  height={32}
                  className="w-8 h-8"
                />
              </div>
              <span className={cn(
                'text-base font-extrabold uppercase tracking-tight text-foreground transition-all duration-300',
                sidebarCollapsed ? 'lg:hidden' : 'lg:block'
              )}>
                SDental
              </span>
            </Link>

            {/* Mobile close button */}
            <button
              className="lg:hidden p-1.5 hover:bg-muted rounded-lg transition-colors"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="h-5 w-5 text-muted-foreground" />
            </button>

            {/* Desktop toggle collapse button */}
            <button
              onClick={toggleSidebarCollapse}
              className={cn(
                "hidden lg:flex p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-200",
                sidebarCollapsed && 'lg:hidden'
              )}
              title={sidebarCollapsed ? 'Expandir menu' : 'Recolher menu'}
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </div>

          {/* Expand button when collapsed */}
          {sidebarCollapsed && (
            <button
              onClick={toggleSidebarCollapse}
              className="hidden lg:flex items-center justify-center p-2 mx-3 mt-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-200"
              title="Expandir menu"
            >
              <PanelLeft className="h-4 w-4" />
            </button>
          )}

          {/* Navigation */}
          <nav className={cn(
            'flex-1 py-3 space-y-0.5 overflow-y-auto',
            sidebarCollapsed ? 'lg:px-3' : 'px-3'
          )}>
            {navigation.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    'relative flex items-center gap-3 text-sm font-medium rounded-button transition-colors duration-150',
                    sidebarCollapsed ? 'lg:px-0 lg:py-2.5 lg:justify-center px-3 py-2.5' : 'px-3 py-2.5',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  )}
                  onClick={() => setSidebarOpen(false)}
                  title={sidebarCollapsed ? item.name : undefined}
                >
                  <item.icon className={cn(
                    'h-5 w-5 shrink-0 transition-colors',
                    isActive ? 'text-primary-foreground' : 'text-muted-foreground'
                  )} />
                  <span className={cn(
                    'transition-all duration-300',
                    sidebarCollapsed ? 'lg:hidden' : 'lg:block'
                  )}>
                    {item.name}
                  </span>
                </Link>
              )
            })}
          </nav>

          {/* User section */}
          <div className={cn(
            'p-3 border-t border-border/40',
            sidebarCollapsed ? 'lg:px-3' : ''
          )}>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'w-full text-muted-foreground hover:text-foreground',
                sidebarCollapsed ? 'lg:px-0 lg:justify-center justify-start' : 'justify-start'
              )}
              onClick={logout}
              title={sidebarCollapsed ? 'Sair' : undefined}
            >
              <LogOut className={cn('h-4 w-4', sidebarCollapsed ? '' : 'mr-2')} />
              <span className={cn(
                sidebarCollapsed ? 'lg:hidden' : 'lg:block'
              )}>
                Sair
              </span>
            </Button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className={cn(
        'min-h-screen flex flex-col transition-all duration-300',
        sidebarCollapsed ? 'lg:pl-[72px]' : 'lg:pl-60'
      )}>
        {/* Mobile menu button - floating. Raised on /conversations, which has
            no page padding on mobile and docks a composer at the very bottom. */}
        <button
          className={cn(
            'lg:hidden fixed left-4 z-40 p-3 bg-card border border-border/60 rounded-card hover:bg-muted transition-colors duration-200',
            pathname.startsWith('/conversations') || pathname.startsWith('/assistant') ? 'bottom-20' : 'bottom-4'
          )}
          onClick={() => setSidebarOpen(true)}
        >
          <Menu className="h-5 w-5 text-foreground" />
        </button>

        {/* Page content */}
        <main className={cn(
          'flex-1',
          pathname === '/pipeline' || pathname.startsWith('/conversations') || pathname.startsWith('/assistant') ? 'p-0 lg:p-4' : 'p-4 lg:p-8'
        )}>
          <div className={cn(
            "h-full w-full mx-auto",
            pathname === '/pipeline' || pathname.startsWith('/conversations') || pathname.startsWith('/assistant') ? 'max-w-none' : 'max-w-[1400px]'
          )}>
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
