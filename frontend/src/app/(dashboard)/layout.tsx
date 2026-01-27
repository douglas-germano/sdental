'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/app/providers'
import { Button } from '@/components/ui/button'
import {
  LayoutDashboard,
  Calendar,
  Users,
  MessageSquare,
  Settings,
  LogOut,
  Menu,
  X,
  Bot,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  PanelLeftClose,
  PanelLeft
} from 'lucide-react'
import { cn } from '@/lib/utils'

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Agendamentos', href: '/appointments', icon: Calendar },
  { name: 'Pacientes', href: '/patients', icon: Users },
  { name: 'Conversas', href: '/conversations', icon: MessageSquare },
  { name: 'Agentes', href: '/agents', icon: Bot },
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

  // Persistir estado da sidebar no localStorage
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
    }
  }, [clinic, isLoading, router])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-subtle">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-12 h-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
          </div>
          <p className="text-muted-foreground text-sm animate-pulse">Carregando...</p>
        </div>
      </div>
    )
  }

  if (!clinic) {
    return null
  }

  return (
    <div className="min-h-screen bg-gradient-subtle">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden animate-fade-in"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 bg-gradient-dark transform transition-all duration-300 ease-out',
          // Mobile: sempre escondido por padrão, aparece com sidebarOpen
          'lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
          // Desktop: largura varia conforme collapsed
          sidebarCollapsed ? 'lg:w-20' : 'lg:w-72',
          // Mobile sempre tem largura total
          'w-72'
        )}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className={cn(
            'flex items-center h-20 px-4 border-b border-white/10',
            sidebarCollapsed ? 'lg:justify-center lg:px-2' : 'justify-between px-6'
          )}>
            <Link href="/" className="flex items-center gap-3 group">
              <div className="w-10 h-10 rounded-xl bg-gradient-primary flex items-center justify-center shadow-glow group-hover:shadow-glow-lg transition-shadow flex-shrink-0">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <span className={cn(
                'text-xl font-bold text-white transition-all duration-300',
                sidebarCollapsed ? 'lg:hidden' : 'lg:block'
              )}>
                SDental
              </span>
            </Link>

            {/* Mobile close button */}
            <button
              className="lg:hidden text-white/70 hover:text-white transition-colors"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Toggle collapse button - Desktop only */}
          <div className="hidden lg:flex justify-end px-2 py-2 border-b border-white/5">
            <button
              onClick={toggleSidebarCollapse}
              className={cn(
                'p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-all duration-200',
                sidebarCollapsed && 'mx-auto'
              )}
              title={sidebarCollapsed ? 'Expandir menu' : 'Recolher menu'}
            >
              {sidebarCollapsed ? (
                <PanelLeft className="h-5 w-5" />
              ) : (
                <PanelLeftClose className="h-5 w-5" />
              )}
            </button>
          </div>

          {/* Navigation */}
          <nav className={cn(
            'flex-1 py-4 space-y-1 overflow-y-auto',
            sidebarCollapsed ? 'lg:px-2' : 'px-3'
          )}>
            {navigation.map((item, index) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 text-sm font-medium rounded-xl transition-all duration-200',
                    'animate-slide-in-left',
                    // Padding diferente quando colapsado
                    sidebarCollapsed ? 'lg:px-0 lg:py-3 lg:justify-center px-4 py-3' : 'px-4 py-3',
                    isActive
                      ? 'bg-gradient-primary text-white shadow-glow'
                      : 'text-white/70 hover:text-white hover:bg-white/10'
                  )}
                  style={{ animationDelay: `${index * 50}ms` }}
                  onClick={() => setSidebarOpen(false)}
                  title={sidebarCollapsed ? item.name : undefined}
                >
                  <item.icon className={cn(
                    'h-5 w-5 transition-transform flex-shrink-0',
                    isActive && 'scale-110'
                  )} />
                  <span className={cn(
                    'transition-all duration-300',
                    sidebarCollapsed ? 'lg:hidden' : 'lg:block'
                  )}>
                    {item.name}
                  </span>
                  {isActive && !sidebarCollapsed && (
                    <div className="ml-auto w-2 h-2 rounded-full bg-white animate-pulse lg:block hidden" />
                  )}
                </Link>
              )
            })}
          </nav>

          {/* User section */}
          <div className={cn(
            'p-3 border-t border-white/10',
            sidebarCollapsed ? 'lg:px-2' : 'p-4'
          )}>
            {/* User info - esconde quando colapsado */}
            <div className={cn(
              'mb-3 px-2 transition-all duration-300',
              sidebarCollapsed ? 'lg:hidden' : 'block'
            )}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-primary flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
                  {clinic.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{clinic.name}</p>
                  <p className="text-xs text-white/50 truncate">{clinic.email}</p>
                </div>
              </div>
            </div>

            {/* Avatar mini quando colapsado */}
            <div className={cn(
              'hidden mb-3 justify-center',
              sidebarCollapsed && 'lg:flex'
            )}>
              <div className="w-10 h-10 rounded-xl bg-gradient-primary flex items-center justify-center text-white font-semibold text-sm">
                {clinic.name.charAt(0).toUpperCase()}
              </div>
            </div>

            <Button
              variant="ghost"
              className={cn(
                'w-full text-white/70 hover:text-white hover:bg-white/10',
                sidebarCollapsed ? 'lg:px-0 lg:justify-center justify-start' : 'justify-start'
              )}
              onClick={logout}
              title={sidebarCollapsed ? 'Sair' : undefined}
            >
              <LogOut className={cn('h-4 w-4', sidebarCollapsed ? '' : 'mr-3')} />
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
        sidebarCollapsed ? 'lg:pl-20' : 'lg:pl-72'
      )}>
        {/* Top bar - compacto */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-border/40 bg-background/95 backdrop-blur-sm px-4 lg:px-6">
          <button
            className="lg:hidden p-2 -ml-2 hover:bg-accent rounded-lg transition-colors"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5 text-muted-foreground" />
          </button>

          <div className="flex-1" />

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="hidden sm:inline">{clinic.name}</span>
          </div>
        </header>

        {/* Page content - ocupa todo espaço disponível */}
        <main className="flex-1 p-4 lg:p-6 animate-fade-in-up">
          <div className="h-full w-full max-w-[1600px] mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
