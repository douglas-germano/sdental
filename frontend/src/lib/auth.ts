'use client'

import { Clinic } from '@/types'

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('access_token')
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('refresh_token')
}

export function setTokens(accessToken: string, refreshToken: string): void {
  if (typeof window === 'undefined') return
  localStorage.setItem('access_token', accessToken)
  localStorage.setItem('refresh_token', refreshToken)
}

export function clearTokens(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem('access_token')
  localStorage.removeItem('refresh_token')
  localStorage.removeItem('clinic')
}

export function getStoredClinic(): Clinic | null {
  if (typeof window === 'undefined') return null
  const stored = localStorage.getItem('clinic')
  if (!stored) return null
  try {
    return JSON.parse(stored)
  } catch {
    return null
  }
}

export function setStoredClinic(clinic: Clinic): void {
  if (typeof window === 'undefined') return
  localStorage.setItem('clinic', JSON.stringify(clinic))
}

export function isAuthenticated(): boolean {
  return !!getAccessToken()
}
