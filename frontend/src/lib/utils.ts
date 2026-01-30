import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })
}

export function formatDateTime(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function formatTime(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function formatPhone(phone: string): string {
  // Remove country code if present
  let cleaned = phone.replace(/\D/g, '')
  if (cleaned.startsWith('55') && cleaned.length > 11) {
    cleaned = cleaned.slice(2)
  }

  // Format as (XX) XXXXX-XXXX or (XX) XXXX-XXXX
  if (cleaned.length === 11) {
    return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`
  } else if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 6)}-${cleaned.slice(6)}`
  }

  return phone
}

/**
 * Formata input de telefone enquanto o usuário digita
 * Ex: "11999999999" -> "(11) 99999-9999"
 */
export function formatPhoneInput(value: string): string {
  const digits = value.replace(/\D/g, '')
  if (digits.length <= 2) return digits
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  if (digits.length <= 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`
}

/**
 * Normaliza telefone para envio à API
 * Remove caracteres não numéricos e adiciona código do Brasil (55) se necessário
 * Ex: "(11) 99999-9999" -> "5511999999999"
 */
export function normalizePhoneForApi(phone: string): string {
  const digits = phone.replace(/\D/g, '')

  // Se já tem 12-13 dígitos (com código do país), retorna como está
  if (digits.length >= 12 && digits.length <= 13) {
    return digits
  }

  // Se tem 10-11 dígitos (sem código do país), adiciona 55
  if (digits.length >= 10 && digits.length <= 11) {
    return `55${digits}`
  }

  return digits
}

/**
 * Valida se o telefone tem o formato correto para envio à API
 * Aceita 10-11 dígitos (sem código) ou 12-13 dígitos (com código 55)
 */
export function validatePhoneForApi(phone: string): { valid: boolean; digits: number } {
  const digits = phone.replace(/\D/g, '')
  const valid = digits.length >= 10 && digits.length <= 13
  return { valid, digits: digits.length }
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    pending: 'bg-warning/10 text-warning border-warning/20',
    confirmed: 'bg-success/10 text-success border-success/20',
    cancelled: 'bg-destructive/10 text-destructive border-destructive/20',
    completed: 'bg-primary/10 text-primary border-primary/20',
    no_show: 'bg-muted text-muted-foreground border-border',
    active: 'bg-success/10 text-success border-success/20',
    transferred_to_human: 'bg-accent/10 text-accent border-accent/20'
  }
  return colors[status] || 'bg-muted text-muted-foreground border-border'
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: 'Pendente',
    confirmed: 'Confirmado',
    cancelled: 'Cancelado',
    completed: 'Concluído',
    no_show: 'Não compareceu',
    active: 'Ativa',
    transferred_to_human: 'Atendimento Humano'
  }
  return labels[status] || status
}

export function getDayName(dayIndex: number): string {
  const days = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']
  return days[dayIndex] || ''
}

/**
 * Formata uma data como tempo relativo (ex: "há 2 horas", "há 5 minutos")
 * @param dateString - Data em formato ISO ou string válida
 * @returns String formatada em português com tempo relativo
 */
export function formatRelativeTime(dateString: string): string {
  try {
    return formatDistanceToNow(new Date(dateString), {
      addSuffix: true,
      locale: ptBR
    })
  } catch {
    return dateString
  }
}

/**
 * Verifica se o usuário prefere animações reduzidas
 * @returns true se prefers-reduced-motion está ativado
 */
export function shouldReduceMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Retorna a classe de animação se motion não estiver reduzido
 * @param animationClass - Classe Tailwind de animação
 * @returns Classe de animação ou string vazia
 */
export function getAnimationClass(animationClass: string): string {
  return shouldReduceMotion() ? '' : animationClass
}
