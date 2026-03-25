'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
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
  PanelLeftClose,
  PanelLeft,
  Stethoscope,
  Columns
} from 'lucide-react'
import { cn } from '@/lib/utils'

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Pipeline', href: '/pipeline', icon: Columns },
  { name: 'Agendamentos', href: '/appointments', icon: Calendar },
  { name: 'Pacientes', href: '/patients', icon: Users },
  { name: 'Profissionais', href: '/professionals', icon: Stethoscope },
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
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-[3px] border-primary/20 border-t-primary animate-spin" />
          <p className="text-muted-foreground text-sm">Carregando...</p>
        </div>
      </div>
    )
  }

  if (!clinic) {
    return null
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 lg:hidden animate-fade-in"
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
              <div className="shrink-0 transition-transform hover:scale-105 duration-200">
                <Image
                  src="/icon.png"
                  alt="SDental Logo"
                  width={32}
                  height={32}
                  className="w-8 h-8 rounded-lg"
                />
              </div>
              <span className={cn(
                'text-base font-semibold text-foreground transition-all duration-300',
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
                    'relative flex items-center gap-3 text-[13px] font-medium rounded-lg transition-all duration-150',
                    sidebarCollapsed ? 'lg:px-0 lg:py-2.5 lg:justify-center px-3 py-2' : 'px-3 py-2',
                    isActive
                      ? 'bg-primary/8 text-primary font-semibold'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  )}
                  onClick={() => setSidebarOpen(false)}
                  title={sidebarCollapsed ? item.name : undefined}
                >
                  {/* Active indicator bar */}
                  {isActive && !sidebarCollapsed && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-primary rounded-r-full" />
                  )}
                  <item.icon className={cn(
                    'h-[18px] w-[18px] shrink-0 transition-colors',
                    isActive ? 'text-primary' : 'text-muted-foreground'
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
            {/* Clinic status */}
            <div className={cn(
              'mb-2 px-1 transition-all duration-300',
              sidebarCollapsed ? 'lg:hidden' : 'block'
            )}>
              <div className="flex items-center gap-2 text-sm">
                <div className="w-2 h-2 rounded-full bg-success animate-pulse-soft" />
                <span className="text-muted-foreground text-xs font-medium truncate">{clinic.name}</span>
              </div>
            </div>

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
        {/* Mobile menu button - floating */}
        <button
          className="lg:hidden fixed bottom-4 left-4 z-40 p-3 bg-card border border-border/60 rounded-xl shadow-soft-md hover:shadow-soft-lg hover:bg-muted transition-all duration-200"
          onClick={() => setSidebarOpen(true)}
        >
          <Menu className="h-5 w-5 text-foreground" />
        </button>

        {/* Page content */}
        <main className="flex-1 p-4 lg:p-8 animate-fade-in">
          <div className={cn(
            "h-full w-full mx-auto",
            pathname === '/pipeline' ? 'max-w-none' : 'max-w-[1400px]'
          )}>
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
