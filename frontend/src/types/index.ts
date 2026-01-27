export interface Clinic {
  id: string
  name: string
  email: string
  phone: string
  slug?: string
  booking_enabled?: boolean
  business_hours: Record<string, BusinessHour>
  services: Service[]
  active: boolean
  created_at: string
  updated_at: string
  evolution_api_url?: string
  evolution_instance_name?: string
  has_evolution_key?: boolean
  has_claude_key?: boolean
}

export interface BusinessHour {
  start: string
  end: string
  active: boolean
}

export interface Service {
  name: string
  duration: number
}

export interface Patient {
  id: string
  clinic_id: string
  name: string
  phone: string
  email?: string
  notes?: string
  created_at: string
  updated_at: string
  appointments?: Appointment[]
}

export interface Appointment {
  id: string
  clinic_id: string
  patient_id: string
  patient?: Patient
  service_name: string
  scheduled_datetime: string
  duration_minutes: number
  status: AppointmentStatus
  notes?: string
  created_at: string
  updated_at: string
  cancelled_at?: string
}

export type AppointmentStatus =
  | 'pending'
  | 'confirmed'
  | 'cancelled'
  | 'completed'
  | 'no_show'

export interface Conversation {
  id: string
  clinic_id: string
  patient_id?: string
  patient?: Patient
  phone_number: string
  messages?: Message[]
  context?: Record<string, unknown>
  status: ConversationStatus
  last_message_at: string
  created_at: string
  updated_at: string
  transfers?: BotTransfer[]
}

export type ConversationStatus =
  | 'active'
  | 'transferred_to_human'
  | 'completed'

export interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

export interface BotTransfer {
  id: string
  conversation_id: string
  reason: string
  transferred_at: string
  resolved: boolean
  resolved_at?: string
}

export interface AvailabilitySlot {
  start_time: string
  end_time: string
  datetime: string
}

export interface AnalyticsOverview {
  appointments: {
    this_month: number
    completed: number
    cancelled: number
    no_shows: number
    upcoming: number
  }
  patients: {
    total: number
    new_this_month: number
  }
  conversations: {
    active: number
    needs_attention: number
  }
}

export interface PaginatedResponse<T> {
  items?: T[]
  total: number
  pages: number
  current_page: number
}

export interface AuthResponse {
  message: string
  clinic: Clinic
  access_token: string
  refresh_token: string
}
