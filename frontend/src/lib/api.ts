import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'
import type { PipelineStage } from '@/types'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
})

// Request interceptor to add auth token
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('access_token')
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`
      }
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Response interceptor to handle token refresh
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean }

    // If error is 401 and we haven't retried yet
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true

      try {
        const refreshToken = localStorage.getItem('refresh_token')
        if (refreshToken) {
          const response = await axios.post(`${API_URL}/auth/refresh`, {}, {
            headers: {
              Authorization: `Bearer ${refreshToken}`
            }
          })

          const { access_token } = response.data
          localStorage.setItem('access_token', access_token)

          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${access_token}`
          }

          return api(originalRequest)
        }
      } catch {
        // Refresh failed, clear tokens and redirect to login
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        if (typeof window !== 'undefined') {
          window.location.href = '/login'
        }
      }
    }

    return Promise.reject(error)
  }
)

// Auth API
export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),

  register: (data: { name: string; email: string; phone: string; password: string }) =>
    api.post('/auth/register', data),

  me: () => api.get('/auth/me'),

  refresh: () => api.post('/auth/refresh'),

  logout: () => api.post('/auth/logout'),

  forgotPassword: (email: string) =>
    api.post('/auth/forgot-password', { email }),

  resetPassword: (token: string, password: string) =>
    api.post('/auth/reset-password', { token, password })
}

// Clinics API
export const clinicsApi = {
  getProfile: () => api.get('/clinics/profile'),

  updateProfile: (data: {
    name?: string; phone?: string; slug?: string; agent_enabled?: boolean;
    proactive_outreach_enabled?: boolean; noshow_recovery_enabled?: boolean;
    waitlist_enabled?: boolean; recall_enabled?: boolean; recall_inactive_days?: number;
    funnel_automation_enabled?: boolean; weekly_report_enabled?: boolean;
  }) =>
    api.put('/clinics/profile', data),

  createEvolutionInstance: () => api.post('/clinics/evolution/instance', {}),

  getEvolutionStatus: () => api.get('/clinics/evolution/status'),

  getEvolutionQrCode: () => api.get('/clinics/evolution/qrcode'),

  updateBusinessHours: (business_hours: Record<string, unknown>) =>
    api.put('/clinics/business-hours', { business_hours }),

  updateServices: (services: Array<{ name: string; duration: number; price?: number; instructions?: string }>) =>
    api.put('/clinics/services', { services })
}

interface PatientAddressFields {
  address_zip_code?: string
  address_street?: string
  address_number?: string
  address_complement?: string
  address_neighborhood?: string
  address_city?: string
  address_state?: string
}

// Patients API
export const patientsApi = {
  list: (params?: { page?: number; per_page?: number; search?: string }) =>
    api.get('/patients', { params }),

  get: (id: string) => api.get(`/patients/${id}`),

  create: (data: { name: string; phone: string; email?: string; notes?: string; pipeline_stage_id?: string } & PatientAddressFields) =>
    api.post('/patients', data),

  update: (id: string, data: { name?: string; phone?: string; email?: string; notes?: string } & PatientAddressFields) =>
    api.put(`/patients/${id}`, data),

  delete: (id: string) => api.delete(`/patients/${id}`),

  exportData: (id: string) => api.get(`/patients/${id}/export`),

  eraseData: (id: string) => api.post(`/patients/${id}/erase`, { confirm: true })
}

// Appointments API
export const appointmentsApi = {
  list: (params?: {
    page?: number
    per_page?: number
    status?: string
    date_from?: string
    date_to?: string
    service?: string
    professional_id?: string
  }) => api.get('/appointments', { params }),

  upcoming: () => api.get('/appointments/upcoming'),

  availability: (date: string, service?: string, professional_id?: string) =>
    api.get('/appointments/availability', { params: { date, service, professional_id } }),

  get: (id: string) => api.get(`/appointments/${id}`),

  create: (data: {
    patient_id: string
    service_name: string
    scheduled_datetime: string
    duration_minutes?: number
    notes?: string
    professional_id?: string
  }) => api.post('/appointments', data),

  update: (id: string, data: {
    status?: string
    notes?: string
    scheduled_datetime?: string
    professional_id?: string
  }) => api.put(`/appointments/${id}`, data),

  delete: (id: string) => api.delete(`/appointments/${id}`)
}

// Professionals API
export const professionalsApi = {
  list: (params?: { active?: boolean }) =>
    api.get('/professionals', { params }),

  get: (id: string) => api.get(`/professionals/${id}`),

  create: (data: {
    name: string
    email?: string
    phone?: string
    specialty?: string
    color?: string
    business_hours?: Record<string, unknown>
  }) => api.post('/professionals', data),

  update: (id: string, data: {
    name?: string
    email?: string
    phone?: string
    specialty?: string
    color?: string
    active?: boolean
    is_default?: boolean
    business_hours?: Record<string, unknown>
  }) => api.put(`/professionals/${id}`, data),

  delete: (id: string) => api.delete(`/professionals/${id}`),

  appointments: (id: string, params?: { date_from?: string; date_to?: string; include_past?: boolean }) =>
    api.get(`/professionals/${id}/appointments`, { params })
}

// Conversations API
export const conversationsApi = {
  list: (params?: { page?: number; per_page?: number; status?: string; needs_attention?: boolean; search?: string }) =>
    api.get('/conversations', { params }),

  get: (id: string) => api.get(`/conversations/${id}`),

  transfer: (id: string, reason: string) =>
    api.post(`/conversations/${id}/transfer`, { reason }),

  resolve: (id: string) => api.put(`/conversations/${id}/resolve`),

  reactivate: (id: string) => api.put(`/conversations/${id}/reactivate`),

  linkPatient: (id: string, data: { name: string; phone?: string; email?: string; notes?: string }) =>
    api.post(`/conversations/${id}/link-patient`, data),

  sendMessage: (id: string, message: string) =>
    api.post(`/conversations/${id}/send-message`, { message }),

  sendMedia: (id: string, data: { media_type: 'image' | 'audio' | 'document'; data: string; mimetype: string; filename?: string; caption?: string }) =>
    api.post(`/conversations/${id}/send-media`, data),

  syncHistory: (id: string) =>
    api.post(`/conversations/${id}/sync-history`),

  syncAllHistory: () =>
    api.post('/conversations/sync-all-history'),

  /**
   * URL for the SSE realtime stream. EventSource can't set an Authorization
   * header, so the access token is passed as a query param instead.
   */
  streamUrl: () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null
    return `${API_URL}/conversations/stream${token ? `?token=${encodeURIComponent(token)}` : ''}`
  }
}

// Analytics API
export const analyticsApi = {
  overview: () => api.get('/analytics/overview'),

  appointmentsByPeriod: (period: 'day' | 'week' | 'month', days?: number) =>
    api.get('/analytics/appointments-by-period', { params: { period, days } }),

  conversionRate: (days?: number) =>
    api.get('/analytics/conversion-rate', { params: { days } }),

  servicesSummary: (days?: number) =>
    api.get('/analytics/services-summary', { params: { days } }),

  ask: (question: string, days?: number) =>
    api.post('/analytics/ask', { question }, { params: days ? { days } : undefined }),

  agentActions: (params?: { limit?: number; type?: string }) =>
    api.get('/analytics/agent-actions', { params })
}

// Agents API
export const agentsApi = {
  getConfig: () => api.get('/agents/config'),

  updateConfig: (data: {
    name?: string
    system_prompt?: string
    temperature?: number
    context?: string
  }) => api.put('/agents/config', data),

  testMessage: (message: string) =>
    api.post('/agents/test', { message })
}

// Pipeline API
export const pipelineApi = {
  getBoard: (params?: { limit?: number; offset?: number }) =>
    api.get('/pipeline/board', { params }),

  getStages: () => api.get('/pipeline/stages'),

  updateStages: (stages: Array<Partial<Pick<PipelineStage, 'id' | 'name' | 'color' | 'order' | 'description' | 'is_default'>>>) =>
    api.post('/pipeline/stages', stages),

  movePatient: (patientId: string, stageId: string) =>
    api.put('/pipeline/move', { patient_id: patientId, stage_id: stageId }),

  getPatientHistory: (patientId: string) =>
    api.get(`/pipeline/patients/${patientId}/history`)
}

// Billing API (Kiwify subscription status)
export const billingApi = {
  getStatus: () => api.get('/billing/status')
}

// Internal AI assistant API (dashboard copilot for the clinic owner/staff -
// separate from the WhatsApp patient-facing agent)
export const assistantApi = {
  getMessages: () => api.get('/assistant/messages'),

  sendMessage: (message: string) => api.post('/assistant/messages', { message }),

  clearMessages: () => api.delete('/assistant/messages'),

  listMemories: () => api.get('/assistant/memories'),

  createMemory: (content: string) => api.post('/assistant/memories', { content }),

  updateMemory: (id: string, content: string) => api.patch(`/assistant/memories/${id}`, { content }),

  deleteMemory: (id: string) => api.delete(`/assistant/memories/${id}`)
}

// Financial API (revenue forecast, derived from booked appointments, plus
// real payments/expenses/commissions/goals - see backend financial_service.py)
export const financialApi = {
  getSummary: (days = 30) => api.get('/financial/summary', { params: { days } }),

  getTimeseries: (params?: { past_days?: number; future_days?: number; group_by?: 'day' | 'week' | 'month' }) =>
    api.get('/financial/timeseries', { params }),

  getBreakdown: (params?: { days?: number; by?: 'service' | 'professional' }) =>
    api.get('/financial/breakdown', { params }),

  // Cash flow & goals
  getCashFlow: (days = 30) => api.get('/financial/cash-flow', { params: { days } }),

  getReceivables: (days = 30) => api.get('/financial/receivables', { params: { days } }),

  getPayables: (days = 30) => api.get('/financial/payables', { params: { days } }),

  getGoals: (period?: string) => api.get('/financial/goals', { params: period ? { period } : undefined }),

  setGoal: (data: { period: string; target_amount: number; notes?: string }) =>
    api.post('/financial/goals', data),

  // Payments
  listPayments: (params?: { status?: string; patient_id?: string; appointment_id?: string; page?: number; per_page?: number }) =>
    api.get('/financial/payments', { params }),

  createPayment: (data: {
    patient_id: string; amount: number; method?: string; appointment_id?: string | null
    due_date?: string | null; installments?: number; notes?: string
  }) => api.post('/financial/payments', data),

  updatePayment: (id: string, data: { method?: string; due_date?: string | null; notes?: string }) =>
    api.put(`/financial/payments/${id}`, data),

  registerPayment: (id: string, data: { paid_amount: number; method?: string; paid_at?: string }) =>
    api.post(`/financial/payments/${id}/register`, data),

  cancelPayment: (id: string) => api.delete(`/financial/payments/${id}`),

  // Expenses
  listExpenses: (params?: { status?: string; category?: string; page?: number; per_page?: number }) =>
    api.get('/financial/expenses', { params }),

  createExpense: (data: {
    description: string; amount: number; category?: string; due_date?: string | null
    professional_id?: string | null; notes?: string; repeat_months?: number
  }) => api.post('/financial/expenses', data),

  updateExpense: (id: string, data: Partial<{
    description: string; amount: number; category: string; due_date: string | null
    professional_id: string | null; notes: string
  }>) => api.put(`/financial/expenses/${id}`, data),

  payExpense: (id: string) => api.post(`/financial/expenses/${id}/pay`),

  deleteExpense: (id: string) => api.delete(`/financial/expenses/${id}`),

  // Commission rules & payouts
  listCommissionRules: () => api.get('/financial/commission-rules'),

  createCommissionRule: (data: {
    professional_id?: string | null; service_name?: string | null
    percentage?: number | null; fixed_amount?: number | null
  }) => api.post('/financial/commission-rules', data),

  updateCommissionRule: (id: string, data: Partial<{
    professional_id: string | null; service_name: string | null
    percentage: number | null; fixed_amount: number | null; active: boolean
  }>) => api.put(`/financial/commission-rules/${id}`, data),

  deleteCommissionRule: (id: string) => api.delete(`/financial/commission-rules/${id}`),

  getCommissions: (days = 30) => api.get('/financial/commissions', { params: { days } }),

  listCommissionPayouts: (professionalId?: string) =>
    api.get('/financial/commission-payouts', { params: professionalId ? { professional_id: professionalId } : undefined }),

  createCommissionPayout: (data: {
    professional_id: string; period_start: string; period_end: string; amount: number; notes?: string
  }) => api.post('/financial/commission-payouts', data)
}

// Public booking API (no auth required - used by the public /agendar/[slug] page)
export const publicApi = {
  getClinic: (slug: string) => api.get(`/public/clinic/${slug}`),

  getCalendar: (slug: string) => api.get(`/public/clinic/${slug}/calendar`),

  getAvailability: (slug: string, date: string, service?: string, professionalId?: string) =>
    api.get(`/public/clinic/${slug}/availability`, {
      params: { date, service, professional_id: professionalId }
    }),

  book: (slug: string, data: {
    service: string
    date: string
    time: string
    name: string
    phone: string
    email?: string
    notes?: string
    professional_id?: string
    consent: boolean
  }) => api.post(`/public/clinic/${slug}/book`, data)
}

export default api
