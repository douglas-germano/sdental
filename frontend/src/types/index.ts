export interface Clinic {
  id: string
  name: string
  email: string
  phone: string
  slug?: string
  booking_enabled?: boolean
  agent_enabled?: boolean
  business_hours: Record<string, BusinessHour>
  services: Service[]
  active: boolean
  subscription_status?: SubscriptionStatus
  subscription_period_end?: string | null
  created_at: string
  updated_at: string
  evolution_api_url?: string
  evolution_instance_name?: string
  has_evolution_key?: boolean
  has_claude_key?: boolean
  // Autonomous / proactive AI
  proactive_outreach_enabled?: boolean
  noshow_recovery_enabled?: boolean
  waitlist_enabled?: boolean
  recall_enabled?: boolean
  recall_inactive_days?: number
  funnel_automation_enabled?: boolean
  weekly_report_enabled?: boolean
}

export type SubscriptionStatus =
  | 'pending_payment'
  | 'active'
  | 'late'
  | 'canceled'
  | 'refunded'
  | 'chargeback'

export interface BillingStatus {
  subscription_status: SubscriptionStatus
  subscription_period_end: string | null
  active: boolean
  checkout_url: string | null
}

export interface AgentAction {
  id: string
  patient_id: string | null
  conversation_id: string | null
  appointment_id: string | null
  action_type: string
  channel: string | null
  status: string
  detail: string | null
  meta: Record<string, unknown>
  created_at: string
}

export interface BusinessHour {
  start: string
  end: string
  active: boolean
}

export interface Service {
  name: string
  duration: number
  price?: number
  instructions?: string
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
  pipeline_stage_id?: string
  appointments?: Appointment[]
  address_zip_code?: string
  address_street?: string
  address_number?: string
  address_complement?: string
  address_neighborhood?: string
  address_city?: string
  address_state?: string
}

export interface PipelineStage {
  id: string
  name: string
  color: string
  order: number
  description?: string
  is_default?: boolean
  patients?: Patient[]
  total_patients?: number
  has_more?: boolean
}

export interface Professional {
  id: string
  clinic_id: string
  name: string
  email?: string
  phone?: string
  specialty?: string
  color?: string
  active: boolean
  is_default: boolean
  business_hours?: Record<string, BusinessHour>
  created_at: string
  updated_at: string
}

export interface Appointment {
  id: string
  clinic_id: string
  patient_id: string
  patient?: Patient
  professional_id?: string
  professional?: Professional
  service_name: string
  scheduled_datetime: string
  duration_minutes: number
  status: AppointmentStatus
  notes?: string
  created_at: string
  updated_at: string
  cancelled_at?: string
  patient_confirmed_at?: string
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
  urgent?: boolean
  last_message_at: string
  created_at: string
  updated_at: string
  transfers?: BotTransfer[]
}

export type ConversationStatus =
  | 'active'
  | 'transferred_to_human'
  | 'completed'

export type MessageStatus = 'sent' | 'delivered' | 'read' | 'failed'
export type MessageType = 'text' | 'image' | 'audio' | 'document'

export interface Message {
  id?: string
  evolution_id?: string | null
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  status?: MessageStatus
  type?: MessageType
  media_url?: string
  media_mimetype?: string
  caption?: string
}

export interface BotTransfer {
  id: string
  conversation_id: string
  reason: string
  urgent?: boolean
  transferred_at: string
  resolved: boolean
  resolved_at?: string
}

export interface AvailabilitySlot {
  start_time: string
  end_time: string
  datetime: string
  professional_id?: string
  professional_name?: string
  available_professionals?: Array<{ id: string; name: string }>
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

export interface AssistantMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

export interface AssistantConversation {
  id: string
  clinic_id: string
  messages: AssistantMessage[]
  last_message_at: string | null
}

export interface AssistantMemory {
  id: string
  clinic_id: string
  content: string
  created_at: string
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
