'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Clinic } from '@/types'
import { authApi } from '@/lib/api'
import { setTokens, clearTokens, getAccessToken, setStoredClinic, getStoredClinic } from '@/lib/auth'

interface AuthContextType {
  clinic: Clinic | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (data: { name: string; email: string; phone: string; password: string }) => Promise<void>
  logout: () => void
  refreshClinic: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [clinic, setClinic] = useState<Clinic | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const initAuth = async () => {
      const token = getAccessToken()
      if (token) {
        try {
          const stored = getStoredClinic()
          if (stored) {
            setClinic(stored)
          }
          const response = await authApi.me()
          setClinic(response.data)
          setStoredClinic(response.data)
        } catch {
          clearTokens()
        }
      }
      setIsLoading(false)
    }

    initAuth()
  }, [])

  const login = async (email: string, password: string) => {
    const response = await authApi.login(email, password)
    const { clinic: clinicData, access_token, refresh_token } = response.data
    setTokens(access_token, refresh_token)
    setStoredClinic(clinicData)
    setClinic(clinicData)
    router.push('/')
  }

  const register = async (data: { name: string; email: string; phone: string; password: string }) => {
    const response = await authApi.register(data)
    const { clinic: clinicData, access_token, refresh_token } = response.data
    setTokens(access_token, refresh_token)
    setStoredClinic(clinicData)
    setClinic(clinicData)
    router.push('/')
  }

  const logout = () => {
    clearTokens()
    setClinic(null)
    router.push('/login')
  }

  const refreshClinic = async () => {
    try {
      const response = await authApi.me()
      setClinic(response.data)
      setStoredClinic(response.data)
    } catch {
      // Ignore errors
    }
  }

  return (
    <AuthContext.Provider value={{ clinic, isLoading, login, register, logout, refreshClinic }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
