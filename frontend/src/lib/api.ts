import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'

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

  refresh: () => api.post('/auth/refresh')
}

// Clinics API
export const clinicsApi = {
  getProfile: () => api.get('/clinics/profile'),

  updateProfile: (data: { name?: string; phone?: string; slug?: string; agent_enabled?: boolean }) =>
    api.put('/clinics/profile', data),

  createEvolutionInstance: () => api.post('/clinics/evolution/instance', {}),

  getEvolutionStatus: () => api.get('/clinics/evolution/status'),

  getEvolutionQrCode: () => api.get('/clinics/evolution/qrcode'),

  updateBusinessHours: (business_hours: Record<string, unknown>) =>
    api.put('/clinics/business-hours', { business_hours }),

  updateServices: (services: Array<{ name: string; duration: number }>) =>
    api.put('/clinics/services', { services })
}

// Patients API
export const patientsApi = {
  list: (params?: { page?: number; per_page?: number; search?: string }) =>
    api.get('/patients', { params }),

  get: (id: string) => api.get(`/patients/${id}`),

  create: (data: { name: string; phone: string; email?: string; notes?: string; pipeline_stage_id?: string }) =>
    api.post('/patients', data),

  update: (id: string, data: { name?: string; phone?: string; email?: string; notes?: string }) =>
    api.put(`/patients/${id}`, data),

  delete: (id: string) => api.delete(`/patients/${id}`)
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
  list: (params?: { page?: number; per_page?: number; status?: string; needs_attention?: boolean }) =>
    api.get('/conversations', { params }),

  get: (id: string) => api.get(`/conversations/${id}`),

  transfer: (id: string, reason: string) =>
    api.post(`/conversations/${id}/transfer`, { reason }),

  resolve: (id: string) => api.put(`/conversations/${id}/resolve`),

  reactivate: (id: string) => api.put(`/conversations/${id}/reactivate`),

  linkPatient: (id: string, data: { name: string; phone?: string; email?: string; notes?: string }) =>
    api.post(`/conversations/${id}/link-patient`, data)
}

// Analytics API
export const analyticsApi = {
  overview: () => api.get('/analytics/overview'),

  appointmentsByPeriod: (period: 'day' | 'week' | 'month', days?: number) =>
    api.get('/analytics/appointments-by-period', { params: { period, days } }),

  conversionRate: (days?: number) =>
    api.get('/analytics/conversion-rate', { params: { days } }),

  servicesSummary: (days?: number) =>
    api.get('/analytics/services-summary', { params: { days } })
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

  updateStages: (stages: any[]) => api.post('/pipeline/stages', stages),

  movePatient: (patientId: string, stageId: string) =>
    api.put('/pipeline/move', { patient_id: patientId, stage_id: stageId }),

  getPatientHistory: (patientId: string) =>
    api.get(`/pipeline/patients/${patientId}/history`)
}

export default api
