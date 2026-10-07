export interface AgentSettings {
  tone: 'balanced' | 'direct' | 'warm' | 'formal'
  show_prices: boolean
  address: string
  insurance: string
  payment_methods: string
  cancellation_policy: string
  faq: string
  handoff_rules: string
}
export interface AgentAutomation {
  proactive_outreach_enabled: boolean
  noshow_recovery_enabled: boolean
  waitlist_enabled: boolean
  recall_enabled: boolean
  recall_inactive_days: number
  funnel_automation_enabled: boolean
  weekly_report_enabled: boolean
}
export interface AgentDraft {
  name: string
  system_prompt: string
  context: string
  temperature: number
  settings: AgentSettings
  automation: AgentAutomation
}
export interface AgentConfig extends AgentDraft {
  agent_enabled: boolean
  ai_configured: boolean
}
export const draftOf = (config: AgentConfig): AgentDraft => ({
  name: config.name,
  system_prompt: config.system_prompt,
  context: config.context,
  temperature: config.temperature,
  settings: { ...config.settings },
  automation: { ...config.automation },
})
