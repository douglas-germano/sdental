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
  has_openrouter_key?: boolean
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
  break_start?: string
  break_end?: string
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
  pipeline_stage?: PipelineStage
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
  /** Set to 'whatsapp_app' for messages sent directly from the linked phone
   *  (not through this platform) - e.g. staff replying manually. Omitted for
   *  normal bot/dashboard-sent messages. */
  sent_via?: 'whatsapp_app'
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

export interface FinancialSummary {
  period_days: number
  realized_revenue: number
  realized_count: number
  forecast_revenue: number
  forecast_count: number
  lost_revenue: number
  lost_count: number
}

export interface RevenueTimeseriesPoint {
  period: string
  realized: number
  forecast: number
}

export interface RevenueBreakdownItem {
  name: string
  realized: number
  forecast: number
  count: number
}

export interface PaginatedResponse<T> {
  items?: T[]
  total: number
  pages: number
  current_page: number
}

export type PaymentMethod = 'cash' | 'pix' | 'credit_card' | 'debit_card' | 'bank_transfer' | 'health_insurance' | 'other'
export type PaymentStatus = 'pending' | 'partial' | 'paid' | 'refunded' | 'cancelled'

export interface Payment {
  id: string
  clinic_id: string
  patient_id: string
  patient_name: string | null
  appointment_id: string | null
  amount: number
  paid_amount: number
  method: PaymentMethod
  status: PaymentStatus
  due_date: string | null
  paid_at: string | null
  installment_group_id: string | null
  installment_number: number
  installment_total: number
  notes: string | null
  created_at: string
  updated_at: string
}

export type ExpenseCategory = 'rent' | 'supplies' | 'salaries' | 'marketing' | 'equipment' | 'taxes' | 'utilities' | 'other'
export type ExpenseStatus = 'pending' | 'paid' | 'cancelled'

export interface Expense {
  id: string
  clinic_id: string
  professional_id: string | null
  professional_name: string | null
  category: ExpenseCategory
  description: string
  amount: number
  status: ExpenseStatus
  due_date: string | null
  paid_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface CommissionRule {
  id: string
  clinic_id: string
  professional_id: string | null
  professional_name: string | null
  service_name: string | null
  percentage: number | null
  fixed_amount: number | null
  active: boolean
  created_at: string
  updated_at: string
}

export interface CommissionSummaryItem {
  professional_id: string
  professional_name: string
  earned_period: number
  earned_total: number
  paid_total: number
  balance: number
}

export interface CommissionPayout {
  id: string
  clinic_id: string
  professional_id: string
  professional_name: string | null
  period_start: string
  period_end: string
  amount: number
  paid_at: string
  notes: string | null
  created_at: string
}

export interface FinancialGoal {
  id: string
  clinic_id: string
  period: string
  target_amount: number
  notes: string | null
  created_at: string
  updated_at: string
}

export interface GoalProgress {
  period: string
  target_amount: number | null
  realized_revenue: number
  progress_pct: number | null
  has_goal: boolean
}

export interface CashFlow {
  period_days: number
  cash_in: number
  cash_out: number
  net_cash_flow: number
  payments_count: number
  expenses_count: number
  payouts_count: number
}

export interface ReceivablesPayablesItem {
  total: number
  overdue_total: number
  overdue_count: number
  upcoming_total: number
  upcoming_count: number
  items: (Payment | Expense)[]
}

export interface AuthResponse {
  message: string
  clinic: Clinic
  access_token: string
  refresh_token: string
}
