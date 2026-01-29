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
  { name: 'Agendamentos', href: '/appointments', icon: Calendar },
  { name: 'Pacientes', href: '/patients', icon: Users },
  { name: 'Profissionais', href: '/professionals', icon: Stethoscope },
  { name: 'Pipeline', href: '/pipeline', icon: Columns },
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
    <div className="min-h-screen bg-muted/30">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden animate-fade-in"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar - Clean white design */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 bg-background border-r border-border transform transition-all duration-300 ease-out',
          'lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
          sidebarCollapsed ? 'lg:w-20' : 'lg:w-64',
          'w-64'
        )}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className={cn(
            'flex items-center h-16 px-4 border-b border-border',
            sidebarCollapsed ? 'lg:justify-center lg:px-2' : 'justify-between'
          )}>
            <Link href="/" className="flex items-center gap-3 group">
              <div className="shrink-0 transition-transform hover:scale-105 duration-200">
                <Image
                  src="/icon.png"
                  alt="SDental Logo"
                  width={36}
                  height={36}
                  className="w-9 h-9 rounded-lg shadow-sm group-hover:shadow-md"
                />
              </div>
              <span className={cn(
                'text-lg font-semibold text-foreground transition-all duration-300',
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
          </div>

          {/* Clinic status - visible when expanded */}
          <div className={cn(
            'px-4 py-3 border-b border-border/50 transition-all duration-300',
            sidebarCollapsed ? 'lg:hidden' : 'block'
          )}>
            <div className="flex items-center gap-2 text-sm">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-muted-foreground font-medium">{clinic.name}</span>
            </div>
          </div>

          {/* Toggle collapse button - Desktop only */}
          <div className="hidden lg:flex justify-end px-2 py-2">
            <button
              onClick={toggleSidebarCollapse}
              className={cn(
                'p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-200',
                sidebarCollapsed && 'mx-auto'
              )}
              title={sidebarCollapsed ? 'Expandir menu' : 'Recolher menu'}
            >
              {sidebarCollapsed ? (
                <PanelLeft className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </button>
          </div>

          {/* Navigation */}
          <nav className={cn(
            'flex-1 py-2 space-y-1 overflow-y-auto',
            sidebarCollapsed ? 'lg:px-2' : 'px-3'
          )}>
            {navigation.map((item, index) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 text-sm font-medium rounded-lg transition-all duration-200',
                    'animate-slide-in-left',
                    sidebarCollapsed ? 'lg:px-0 lg:py-2.5 lg:justify-center px-3 py-2.5' : 'px-3 py-2.5',
                    isActive
                      ? 'bg-primary text-white shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  )}
                  style={{ animationDelay: `${index * 50}ms` }}
                  onClick={() => setSidebarOpen(false)}
                  title={sidebarCollapsed ? item.name : undefined}
                >
                  <item.icon className={cn(
                    'h-4 w-4 transition-transform flex-shrink-0',
                    isActive && 'scale-105'
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
            'p-3 border-t border-border/60',
            sidebarCollapsed ? 'lg:px-2' : ''
          )}>
            {/* User info - hidden when collapsed */}
            <div className={cn(
              'mb-3 px-1 transition-all duration-300',
              sidebarCollapsed ? 'lg:hidden' : 'block'
            )}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm flex-shrink-0">
                  {clinic.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{clinic.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{clinic.email}</p>
                </div>
              </div>
            </div>

            {/* Mini avatar when collapsed */}
            <div className={cn(
              'hidden mb-3 justify-center',
              sidebarCollapsed && 'lg:flex'
            )}>
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
                {clinic.name.charAt(0).toUpperCase()}
              </div>
            </div>

            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'w-full text-muted-foreground hover:text-foreground hover:bg-muted',
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
        sidebarCollapsed ? 'lg:pl-20' : 'lg:pl-64'
      )}>
        {/* Mobile menu button - floating */}
        <button
          className="lg:hidden fixed top-4 left-4 z-40 p-3 bg-background border border-border rounded-lg shadow-lg hover:bg-muted transition-colors"
          onClick={() => setSidebarOpen(true)}
        >
          <Menu className="h-5 w-5 text-foreground" />
        </button>

        {/* Page content */}
        <main className="flex-1 p-4 lg:p-6 animate-fade-in-up">
          <div className="h-full w-full max-w-[1600px] mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
