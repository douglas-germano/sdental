'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '@/app/providers'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { useToast } from '@/components/ui/toast'
import { agentsApi } from '@/lib/api'
import { Robot as Bot, FloppyDisk as Save, Sparkle as Sparkles, Chat as MessageSquare, PaperPlaneTilt as Send, CircleNotch as Loader2, User, Lightning as Zap, Brain, WarningCircle as AlertCircle, ArrowCounterClockwise as RotateCcw, Check, CheckCircle, Info, Thermometer, CaretDown as ChevronDown, SlidersHorizontal } from '@phosphor-icons/react'
import { PageLoader } from '@/components/ui/page-loader'
import { PageHeader } from '@/components/ui/page-header'
import { cn } from '@/lib/utils'

interface TestMessage {
    role: 'user' | 'assistant'
    content: string
}

interface AgentDraft {
    name: string
    temperature: number
    systemPrompt: string
    context: string
}

const PROMPT_TEMPLATES = [
    {
        name: 'Equilibrado',
        icon: Bot,
        description: 'Tom cordial e profissional. Ideal para a maioria das clinicas.',
        content: `Você é uma assistente virtual da clínica odontológica {clinic_name}.
Seu objetivo é agendar consultas, tirar dúvidas sobre tratamentos e fornecer informações sobre a clínica.
Seja sempre cordial, profissional e empática.
Use emojis ocasionalmente para tornar a conversa mais leve.`
    },
    {
        name: 'Acolhedor',
        icon: Sparkles,
        description: 'Linguagem calorosa com emojis. Otimo para publico jovem.',
        content: `Oi! Sou a assistente virtual da {clinic_name} 😊
Estou aqui para te ajudar a marcar consultas e tirar dúvidas com muito carinho!
Pode contar comigo para o que precisar.
Use bastante emojis e uma linguagem bem acolhedora!`
    },
    {
        name: 'Formal',
        icon: Brain,
        description: 'Comunicacao direta sem emojis. Para publico corporativo.',
        content: `Você é uma assistente virtual da {clinic_name}.
Atue com formalidade e profissionalismo estrito.
Foque em eficiência e clareza no agendamento.
Não utilize emojis ou gírias.`
    },
    {
        name: 'Vendas',
        icon: Zap,
        description: 'Foco em converter contatos em agendamentos.',
        content: `Você é uma consultora de agendamentos da {clinic_name}.
Seu objetivo principal é converter contatos em agendamentos confirmados.
Seja persuasiva, destaque a qualidade dos nossos serviços e a importância da saúde bucal.
Sempre ofereça opções de horários e tente fechar o agendamento rapidamente.`
    }
]

const PROMPT_VARIABLES = [
    { code: '{clinic_name}', label: 'Nome da Clinica', example: 'Clinica SDental' },
    { code: '{services}', label: 'Lista de Servicos', example: 'Limpeza, Clareamento...' },
    { code: '{business_hours}', label: 'Horarios', example: 'Seg-Sex: 8h-18h' },
    { code: '{current_datetime}', label: 'Data/Hora Atual', example: '25/03/2026 14:30' },
    { code: '{context_info}', label: 'Contexto do Paciente', example: 'Ultimo atendimento...' }
]

const QUICK_TEST_MESSAGES = [
    'Oi, quero agendar uma consulta',
    'Quais horarios disponiveis?',
    'Quanto custa uma limpeza?',
    'Preciso cancelar minha consulta',
    'Voces atendem no sabado?',
]

const TEMPERATURE_LABELS: Record<string, { label: string; description: string; color: string }> = {
    '0': { label: 'Muito preciso', description: 'Respostas sempre iguais e previsiveis', color: 'text-blue-500' },
    '0.1': { label: 'Preciso', description: 'Minima variacao entre respostas', color: 'text-blue-500' },
    '0.2': { label: 'Conservador', description: 'Respostas consistentes com leve variacao', color: 'text-blue-400' },
    '0.3': { label: 'Equilibrado-baixo', description: 'Bom para FAQs e respostas padrao', color: 'text-cyan-500' },
    '0.4': { label: 'Moderado', description: 'Respostas naturais mas consistentes', color: 'text-teal-500' },
    '0.5': { label: 'Balanceado', description: 'Equilibrio entre precisao e naturalidade', color: 'text-emerald-500' },
    '0.6': { label: 'Natural', description: 'Conversas mais fluidas e humanas', color: 'text-green-500' },
    '0.7': { label: 'Recomendado', description: 'Melhor para atendimento ao cliente', color: 'text-primary' },
    '0.8': { label: 'Criativo', description: 'Respostas mais variadas e expressivas', color: 'text-orange-500' },
    '0.9': { label: 'Muito criativo', description: 'Alta variacao, pode ser imprevisivel', color: 'text-orange-600' },
    '1': { label: 'Maximo', description: 'Maximo de criatividade, menos previsivel', color: 'text-red-500' },
}

const DEFAULT_TEMPERATURE = 0.7

export default function AgentsPage() {
    const { clinic } = useAuth()
    const { toast } = useToast()
    const [saving, setSaving] = useState(false)
    const [applyingTemplate, setApplyingTemplate] = useState<number | null>(null)
    const [loading, setLoading] = useState(true)
    const [activeTab, setActiveTab] = useState('general')
    const [hasChanges, setHasChanges] = useState(false)
    const [savedConfig, setSavedConfig] = useState<string>('')
    // Whatever's actually live on WhatsApp right now has no custom prompt or
    // knowledge saved - the agent is running entirely on smart defaults.
    // Tracks the persisted state, not the draft, so it doesn't flicker while typing.
    const [usingDefaults, setUsingDefaults] = useState(true)
    const [previewTemplate, setPreviewTemplate] = useState<number | null>(null)
    const [copiedVar, setCopiedVar] = useState<string | null>(null)
    const [showAdvanced, setShowAdvanced] = useState(false)

    const [agentConfig, setAgentConfig] = useState<AgentDraft>({
        name: 'Assistente SDental',
        temperature: DEFAULT_TEMPERATURE,
        systemPrompt: '',
        context: ''
    })

    // Test chat state
    const [testMessages, setTestMessages] = useState<TestMessage[]>([])
    const [testInput, setTestInput] = useState('')
    const [sendingTest, setSendingTest] = useState(false)
    const messagesEndRef = useRef<HTMLDivElement>(null)

    // Track unsaved changes
    useEffect(() => {
        if (savedConfig) {
            setHasChanges(JSON.stringify(agentConfig) !== savedConfig)
        }
    }, [agentConfig, savedConfig])

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [testMessages])

    // Warn before leaving with unsaved changes
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (hasChanges) {
                e.preventDefault()
            }
        }
        window.addEventListener('beforeunload', handleBeforeUnload)
        return () => window.removeEventListener('beforeunload', handleBeforeUnload)
    }, [hasChanges])

    // Example text only - never written into agentConfig automatically. An
    // empty prompt is a real, valid state (the backend already has a good
    // default), so we don't fabricate content the clinic never asked for.
    const getExampleSystemPrompt = useCallback(() => {
        return `Você é uma assistente virtual da clínica odontológica ${clinic?.name || 'SDental'}.
Seu objetivo é agendar consultas, tirar dúvidas sobre tratamentos e fornecer informações sobre a clínica.
Seja sempre cordial, profissional e empática.`
    }, [clinic?.name])

    const getContextScaffold = useCallback(() => {
        // Horarios de funcionamento e servicos ja sao montados dinamicamente
        // a partir do banco de dados a cada mensagem (ver _format_business_hours
        // e _format_services no backend) - nao devem ser duplicados aqui como
        // texto fixo, ou esse texto fica desatualizado assim que o gestor
        // mudar os horarios em Configuracoes.
        return `Telefone: ${clinic?.phone || 'Nao informado'}

Adicione aqui outras informacoes que o agente deve saber e que nao vem automaticamente do sistema: endereco, ponto de referencia, estacionamento, formas de pagamento aceitas, convenios/planos atendidos, politica de cancelamento, etc.

Horarios de funcionamento e servicos oferecidos ja sao enviados automaticamente e atualizados em tempo real a partir de Configuracoes - nao e necessario repeti-los aqui.`
    }, [clinic])

    const fetchConfig = useCallback(async () => {
        try {
            const response = await agentsApi.getConfig()
            const config = response.data
            const loaded: AgentDraft = {
                name: config.name || 'Assistente SDental',
                temperature: config.temperature ?? DEFAULT_TEMPERATURE,
                // Empty stays empty: it means "no customization saved yet",
                // not "let's pre-fill the box with generated text".
                systemPrompt: config.system_prompt || '',
                context: config.context || ''
            }
            setAgentConfig(loaded)
            setSavedConfig(JSON.stringify(loaded))
            setUsingDefaults(!loaded.systemPrompt.trim() && !loaded.context.trim())
        } catch (error) {
            console.error('Error fetching agent config:', error)
            toast({
                title: 'Erro ao carregar configuração',
                description: 'Não foi possível carregar as configurações do agente.',
                variant: 'error',
            })
        } finally {
            setLoading(false)
        }
    }, [toast])

    useEffect(() => {
        fetchConfig()
    }, [fetchConfig])

    // Shared by the manual "Salvar" button and by one-click template
    // application - both just persist a draft, they only differ in which
    // fields change and which UI shows a spinner while it happens.
    const persistConfig = useCallback(async (patch: Partial<AgentDraft> = {}) => {
        const next: AgentDraft = { ...agentConfig, ...patch }
        await agentsApi.updateConfig({
            name: next.name,
            system_prompt: next.systemPrompt,
            temperature: next.temperature,
            context: next.context
        })
        setAgentConfig(next)
        setSavedConfig(JSON.stringify(next))
        setHasChanges(false)
        setUsingDefaults(!next.systemPrompt.trim() && !next.context.trim())
        return next
    }, [agentConfig])

    const handleSave = async () => {
        setSaving(true)
        try {
            await persistConfig()
            toast({
                title: 'Configuracoes salvas',
                description: 'O agente foi atualizado com sucesso.',
                variant: 'success',
            })
        } catch (error) {
            console.error('Error saving config:', error)
            toast({
                title: 'Erro ao salvar',
                description: 'Nao foi possivel salvar as configuracoes.',
                variant: 'error',
            })
        } finally {
            setSaving(false)
        }
    }

    const handleSendTestMessage = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!testInput.trim() || sendingTest) return

        const userMessage = testInput.trim()
        setTestInput('')
        setTestMessages(prev => [...prev, { role: 'user', content: userMessage }])
        setSendingTest(true)

        try {
            // Always the live draft, saved or not - what you see in the
            // fields above is exactly what gets tested.
            const response = await agentsApi.testMessage(userMessage, {
                systemPrompt: agentConfig.systemPrompt,
                context: agentConfig.context,
                temperature: agentConfig.temperature,
            })
            setTestMessages(prev => [...prev, { role: 'assistant', content: response.data.response }])
        } catch (error) {
            console.error('Error testing message:', error)
            setTestMessages(prev => [...prev, {
                role: 'assistant',
                content: 'Desculpe, nao foi possivel processar sua mensagem. Verifique se a API esta configurada corretamente.'
            }])
        } finally {
            setSendingTest(false)
        }
    }

    const handleQuickMessage = (message: string) => {
        setTestInput(message)
    }

    const clearTestChat = () => {
        setTestMessages([])
    }

    const handleApplyTemplate = async (index: number) => {
        const template = PROMPT_TEMPLATES[index]
        setApplyingTemplate(index)
        try {
            await persistConfig({ systemPrompt: template.content })
            setPreviewTemplate(null)
            toast({
                title: `Modelo "${template.name}" aplicado`,
                description: 'Já está ativo e no ar - você pode ajustar o texto abaixo quando quiser.',
                variant: 'success',
            })
        } catch (error) {
            console.error('Error applying template:', error)
            toast({
                title: 'Erro ao aplicar modelo',
                description: 'Nao foi possivel salvar o modelo escolhido.',
                variant: 'error',
            })
        } finally {
            setApplyingTemplate(null)
        }
    }

    const handleInsertVariable = (variable: string) => {
        const textarea = document.getElementById('prompt') as HTMLTextAreaElement
        if (textarea) {
            const start = textarea.selectionStart
            const end = textarea.selectionEnd
            const text = agentConfig.systemPrompt
            const newText = text.substring(0, start) + variable + text.substring(end)
            setAgentConfig(prev => ({ ...prev, systemPrompt: newText }))
            setTimeout(() => {
                textarea.focus()
                textarea.setSelectionRange(start + variable.length, start + variable.length)
            }, 0)
        } else {
            setAgentConfig(prev => ({
                ...prev,
                systemPrompt: prev.systemPrompt + variable
            }))
        }

        setCopiedVar(variable)
        setTimeout(() => setCopiedVar(null), 1500)
    }

    const handleRefreshContext = () => {
        const newContext = getContextScaffold()
        setAgentConfig(prev => ({ ...prev, context: newContext }))
        toast({
            title: 'Modelo de texto inserido',
            description: 'Edite e salve quando estiver pronto.',
        })
    }

    const tempKey = agentConfig.temperature.toFixed(1)
    const tempInfo = TEMPERATURE_LABELS[tempKey] || TEMPERATURE_LABELS['0.7']
    const promptLength = agentConfig.systemPrompt.length
    const contextLength = agentConfig.context.length

    if (loading) {
        return <PageLoader />
    }

    return (
        <div className="space-y-6">
            {/* Header with status and save */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <PageHeader title="Agentes IA" description="Configure o comportamento da sua assistente virtual" />
                <div className="flex items-center gap-3 shrink-0">
                    {/* Agent status */}
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-card border border-border/60">
                        <div className="w-2 h-2 rounded-full bg-success" />
                        <span className="text-xs font-medium text-muted-foreground">Agente ativo</span>
                    </div>

                    {/* Save button */}
                    <Button
                        variant={hasChanges ? 'gradient' : 'outline'}
                        onClick={handleSave}
                        disabled={saving || !hasChanges}
                        className="gap-2"
                    >
                        {saving ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Save className="h-4 w-4" />
                        )}
                        {saving ? 'Salvando...' : hasChanges ? 'Salvar alteracoes' : 'Salvo'}
                    </Button>
                </div>
            </div>

            {/* Already-working reassurance: shown whenever nothing persisted
                differs from the built-in defaults, so the owner never feels
                pressured to fill this page out before the bot is "ready". */}
            {usingDefaults && (
                <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-success/[0.06] border border-success/20">
                    <CheckCircle className="h-5 w-5 text-success shrink-0 mt-0.5" />
                    <div className="text-sm">
                        <p className="font-medium text-foreground">Seu assistente já está no ar</p>
                        <p className="text-muted-foreground mt-0.5">
                            Ele está respondendo pacientes com uma configuração padrão testada. Tudo abaixo é opcional -
                            personalize só se quiser um tom diferente ou adicionar informações extras.
                        </p>
                    </div>
                </div>
            )}

            {/* Unsaved changes banner */}
            {hasChanges && (
                <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-warning/[0.08] border border-warning/20 text-warning text-sm font-medium">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    Voce tem alteracoes nao salvas
                </div>
            )}

            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
                <TabsList className="grid w-full max-w-md grid-cols-3">
                    <TabsTrigger value="general" className="gap-2">
                        <Bot className="h-4 w-4" />
                        Personalidade
                    </TabsTrigger>
                    <TabsTrigger value="knowledge" className="gap-2">
                        <Brain className="h-4 w-4" />
                        Conhecimento
                    </TabsTrigger>
                    <TabsTrigger value="test" className="gap-2">
                        <MessageSquare className="h-4 w-4" />
                        Testar
                    </TabsTrigger>
                </TabsList>

                {/* ======================== TAB: PERSONALIDADE ======================== */}
                <TabsContent value="general" className="space-y-6">
                    {/* Agent Identity */}
                    <Card className="border-border/60">
                        <CardHeader className="pb-4">
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center shadow-soft">
                                    <Bot className="h-5 w-5 text-white" />
                                </div>
                                <div>
                                    <CardTitle className="text-base">Identidade do Agente</CardTitle>
                                    <CardDescription>Como o agente se apresenta aos pacientes</CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-2">
                                <Label htmlFor="name">Nome do Agente</Label>
                                <div className="relative">
                                    <Bot className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                                    <Input
                                        id="name"
                                        value={agentConfig.name}
                                        onChange={(e) => setAgentConfig(prev => ({ ...prev, name: e.target.value }))}
                                        className="pl-11"
                                        placeholder="Ex: Assistente da Clinica"
                                    />
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Este nome aparece no inicio das conversas com pacientes.
                                </p>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Prompt Templates */}
                    <Card className="border-border/60">
                        <CardHeader className="pb-4">
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-card bg-primary/10 flex items-center justify-center">
                                    <Sparkles className="h-5 w-5 text-primary" />
                                </div>
                                <div>
                                    <CardTitle className="text-base">Modelo de Personalidade</CardTitle>
                                    <CardDescription>Um clique aplica e já salva - ajuste o texto depois, se quiser</CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-5">
                            {/* Template Cards */}
                            <div className="grid gap-3 sm:grid-cols-2">
                                {PROMPT_TEMPLATES.map((template, i) => {
                                    const Icon = template.icon
                                    const isPreviewing = previewTemplate === i
                                    const isApplying = applyingTemplate === i
                                    const isActiveTemplate = agentConfig.systemPrompt === template.content
                                    return (
                                        <div
                                            key={template.name}
                                            className={cn(
                                                "text-left p-4 rounded-xl border transition-all duration-200",
                                                isActiveTemplate
                                                    ? "border-success/30 bg-success/[0.04]"
                                                    : "border-border/50 hover:border-border hover:bg-muted/30"
                                            )}
                                        >
                                            <div className="flex items-start gap-3">
                                                <div className={cn(
                                                    "h-8 w-8 rounded-lg flex items-center justify-center shrink-0 transition-colors",
                                                    isActiveTemplate ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
                                                )}>
                                                    <Icon className="h-4 w-4" />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-1.5">
                                                        <p className="font-medium text-sm text-foreground">{template.name}</p>
                                                        {isActiveTemplate && <Check className="h-3.5 w-3.5 text-success shrink-0" />}
                                                    </div>
                                                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{template.description}</p>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2 mt-3">
                                                <Button
                                                    size="sm"
                                                    variant={isActiveTemplate ? 'outline' : 'default'}
                                                    onClick={() => handleApplyTemplate(i)}
                                                    disabled={isApplying || isActiveTemplate}
                                                    className="gap-1.5 h-7 text-xs flex-1"
                                                >
                                                    {isApplying ? (
                                                        <Loader2 className="h-3 w-3 animate-spin" />
                                                    ) : isActiveTemplate ? (
                                                        <Check className="h-3 w-3" />
                                                    ) : null}
                                                    {isApplying ? 'Aplicando...' : isActiveTemplate ? 'Em uso' : 'Usar este modelo'}
                                                </Button>
                                                <button
                                                    onClick={() => setPreviewTemplate(isPreviewing ? null : i)}
                                                    className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 shrink-0"
                                                >
                                                    {isPreviewing ? 'Ocultar' : 'Ver texto'}
                                                </button>
                                            </div>

                                            {isPreviewing && (
                                                <pre className="mt-3 text-xs text-muted-foreground bg-muted/40 rounded-lg p-3 whitespace-pre-wrap font-mono leading-relaxed max-h-40 overflow-auto scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
                                                    {template.content}
                                                </pre>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>

                            {/* Prompt Editor */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <Label htmlFor="prompt">Prompt do Sistema</Label>
                                        {!agentConfig.systemPrompt && (
                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                Vazio = usando o modelo padrão automaticamente. Escreva algo ou escolha um modelo acima para personalizar.
                                            </p>
                                        )}
                                    </div>
                                    <span className={cn(
                                        "text-xs tabular-nums shrink-0",
                                        promptLength > 2000 ? "text-warning" : "text-muted-foreground"
                                    )}>
                                        {promptLength.toLocaleString('pt-BR')} caracteres
                                    </span>
                                </div>

                                <Textarea
                                    id="prompt"
                                    rows={10}
                                    value={agentConfig.systemPrompt}
                                    onChange={(e) => setAgentConfig(prev => ({ ...prev, systemPrompt: e.target.value }))}
                                    className="font-mono text-sm leading-relaxed"
                                    placeholder={getExampleSystemPrompt()}
                                />

                                {/* Variables - Outside textarea */}
                                <div className="flex flex-wrap items-center gap-2 p-3 bg-muted/30 rounded-xl border border-border/40">
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <div className="flex items-center gap-1 text-xs text-muted-foreground cursor-help">
                                                <Info className="h-3.5 w-3.5" />
                                                <span className="font-medium">Variaveis:</span>
                                            </div>
                                        </TooltipTrigger>
                                        <TooltipContent className="max-w-xs">
                                            <p>Clique para inserir no prompt. Estas variaveis sao substituidas automaticamente durante a conversa.</p>
                                        </TooltipContent>
                                    </Tooltip>
                                    {PROMPT_VARIABLES.map((v) => (
                                        <Tooltip key={v.code}>
                                            <TooltipTrigger asChild>
                                                <button
                                                    onClick={() => handleInsertVariable(v.code)}
                                                    className={cn(
                                                        "text-[11px] font-mono px-2.5 py-1 rounded-lg transition-all duration-150",
                                                        copiedVar === v.code
                                                            ? "bg-success/10 text-success"
                                                            : "bg-primary/[0.08] hover:bg-primary/15 text-primary"
                                                    )}
                                                >
                                                    {copiedVar === v.code ? (
                                                        <span className="flex items-center gap-1">
                                                            <Check className="h-3 w-3" />
                                                            Inserido
                                                        </span>
                                                    ) : (
                                                        v.code
                                                    )}
                                                </button>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                <p className="font-medium">{v.label}</p>
                                                <p className="text-muted-foreground">Ex: {v.example}</p>
                                            </TooltipContent>
                                        </Tooltip>
                                    ))}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Advanced settings - collapsed by default. Temperature is
                        an LLM tuning parameter with no obvious business
                        meaning; the recommended default is right for
                        virtually every clinic, so it's hidden instead of
                        competing for attention with the decisions that
                        actually matter. */}
                    <div className="rounded-xl border border-border/50 overflow-hidden">
                        <button
                            onClick={() => setShowAdvanced(v => !v)}
                            className="w-full flex items-center justify-between gap-3 p-4 hover:bg-muted/30 transition-colors"
                        >
                            <div className="flex items-center gap-2.5">
                                <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm font-medium text-foreground">Configuracoes avancadas</span>
                                {agentConfig.temperature !== DEFAULT_TEMPERATURE && (
                                    <Badge variant="outline" className="text-[10px]">Personalizado</Badge>
                                )}
                            </div>
                            <ChevronDown className={cn(
                                "h-4 w-4 text-muted-foreground transition-transform",
                                showAdvanced && "rotate-180"
                            )} />
                        </button>

                        {showAdvanced && (
                            <div className="p-4 pt-0 space-y-3">
                                <div className="p-5 rounded-xl bg-muted/30 border border-border/50 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Thermometer className="h-4 w-4 text-muted-foreground" />
                                            <Label className="mb-0">Criatividade</Label>
                                        </div>
                                        <Badge variant={agentConfig.temperature === DEFAULT_TEMPERATURE ? 'default' : 'outline'} className="text-xs">
                                            {tempInfo.label}
                                        </Badge>
                                    </div>

                                    <div className="space-y-2">
                                        <div className="relative pt-1">
                                            <input
                                                type="range"
                                                min="0"
                                                max="1"
                                                step="0.1"
                                                value={agentConfig.temperature}
                                                onChange={(e) => setAgentConfig(prev => ({ ...prev, temperature: parseFloat(e.target.value) }))}
                                                className="w-full h-2 rounded-full appearance-none cursor-pointer bg-border"
                                                style={{
                                                    background: `linear-gradient(to right, hsl(var(--primary)) 0%, hsl(var(--primary)) ${agentConfig.temperature * 100}%, hsl(var(--border)) ${agentConfig.temperature * 100}%, hsl(var(--border)) 100%)`
                                                }}
                                            />
                                        </div>
                                        <div className="flex justify-between text-[11px] text-muted-foreground px-0.5">
                                            <span>Preciso</span>
                                            <span>Recomendado</span>
                                            <span>Criativo</span>
                                        </div>
                                    </div>

                                    <p className={cn("text-xs", tempInfo.color)}>
                                        {tempInfo.description}
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </TabsContent>

                {/* ======================== TAB: CONHECIMENTO ======================== */}
                <TabsContent value="knowledge" className="space-y-6">
                    <Card className="border-border/60">
                        <CardHeader className="pb-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-card bg-accent/10 flex items-center justify-center">
                                        <Brain className="h-5 w-5 text-accent" />
                                    </div>
                                    <div>
                                        <CardTitle className="text-base">Base de Conhecimento</CardTitle>
                                        <CardDescription>Informacoes extras que o agente usa para responder</CardDescription>
                                    </div>
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleRefreshContext}
                                    className="gap-2"
                                >
                                    <RotateCcw className="h-3.5 w-3.5" />
                                    Inserir modelo
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-5">
                            {/* Info banner */}
                            <div className="flex gap-3 p-4 rounded-xl bg-primary/[0.04] border border-primary/10">
                                <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                                <div className="text-xs text-muted-foreground leading-relaxed">
                                    <p className="font-medium text-foreground mb-1">Como funciona?</p>
                                    Horarios de funcionamento e servicos ja sao enviados automaticamente ao agente, sempre atualizados a partir de Configuracoes - nao precisam ser repetidos aqui. Use este campo para outras informacoes: endereco, estacionamento, formas de pagamento, politica de cancelamento, etc.
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <Label htmlFor="context">Contexto da Clinica</Label>
                                        {!agentConfig.context && (
                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                Vazio por enquanto - nenhuma informação extra é obrigatória para o agente funcionar.
                                            </p>
                                        )}
                                    </div>
                                    <span className={cn(
                                        "text-xs tabular-nums shrink-0",
                                        contextLength > 3000 ? "text-warning" : "text-muted-foreground"
                                    )}>
                                        {contextLength.toLocaleString('pt-BR')} caracteres
                                    </span>
                                </div>
                                <Textarea
                                    id="context"
                                    rows={14}
                                    value={agentConfig.context}
                                    onChange={(e) => setAgentConfig(prev => ({ ...prev, context: e.target.value }))}
                                    className="font-mono text-sm leading-relaxed"
                                    placeholder={getContextScaffold()}
                                />
                                <p className="text-xs text-muted-foreground">
                                    Inclua tudo que o agente precisa saber: endereco, estacionamento, formas de pagamento, politica de cancelamento, etc.
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ======================== TAB: TESTE ======================== */}
                <TabsContent value="test">
                    <Card className="border-border/60">
                        <CardHeader className="pb-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-card bg-success/10 flex items-center justify-center">
                                        <MessageSquare className="h-5 w-5 text-success" />
                                    </div>
                                    <div>
                                        <CardTitle className="text-base">Testar Agente</CardTitle>
                                        <CardDescription>Simule uma conversa - sempre reflete o que está na tela, mesmo sem salvar</CardDescription>
                                    </div>
                                </div>
                                {testMessages.length > 0 && (
                                    <Button variant="outline" size="sm" onClick={clearTestChat} className="gap-1.5">
                                        <RotateCcw className="h-3.5 w-3.5" />
                                        Limpar
                                    </Button>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="border border-border/60 rounded-2xl flex flex-col bg-muted/20 overflow-hidden" style={{ height: 'min(500px, 60vh)' }}>
                                {/* Messages */}
                                <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
                                    {testMessages.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center h-full text-center px-4">
                                            <div className="h-14 w-14 rounded-card bg-muted/50 border border-border/40 flex items-center justify-center mb-4">
                                                <Bot className="h-7 w-7 text-muted-foreground/40" />
                                            </div>
                                            <p className="font-medium text-foreground mb-1">Teste seu agente</p>
                                            <p className="text-sm text-muted-foreground mb-5 max-w-[240px]">
                                                Envie uma mensagem ou use uma sugestao abaixo
                                            </p>

                                            {/* Quick test messages */}
                                            <div className="flex flex-wrap gap-2 justify-center max-w-sm">
                                                {QUICK_TEST_MESSAGES.map((msg) => (
                                                    <button
                                                        key={msg}
                                                        onClick={() => handleQuickMessage(msg)}
                                                        className="text-xs px-3 py-1.5 rounded-full bg-primary/[0.06] hover:bg-primary/[0.12] text-primary border border-primary/10 transition-colors"
                                                    >
                                                        {msg}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ) : (
                                        testMessages.map((msg, index) => (
                                            <div
                                                key={index}
                                                className={cn(
                                                    "flex items-start gap-3",
                                                    msg.role === 'user' && 'flex-row-reverse'
                                                )}
                                            >
                                                <div
                                                    className={cn(
                                                        "h-8 w-8 rounded-full flex items-center justify-center shrink-0",
                                                        msg.role === 'user'
                                                            ? 'bg-primary text-white'
                                                            : 'bg-muted border border-border/40'
                                                    )}
                                                >
                                                    {msg.role === 'user' ? (
                                                        <User className="h-3.5 w-3.5" />
                                                    ) : (
                                                        <Bot className="h-3.5 w-3.5" />
                                                    )}
                                                </div>
                                                <div
                                                    className={cn(
                                                        "max-w-[75%] rounded-2xl px-4 py-2.5",
                                                        msg.role === 'user'
                                                            ? 'bg-primary text-white rounded-tr-md'
                                                            : 'bg-background border border-border/60 rounded-tl-md'
                                                    )}
                                                >
                                                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                    {sendingTest && (
                                        <div className="flex items-start gap-3">
                                            <div className="h-8 w-8 rounded-full bg-muted border border-border/40 flex items-center justify-center">
                                                <Bot className="h-3.5 w-3.5" />
                                            </div>
                                            <div className="bg-background border border-border/60 rounded-2xl rounded-tl-md px-4 py-2.5">
                                                <div className="flex items-center gap-1.5">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-pulse" />
                                                    <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-pulse" style={{ animationDelay: '150ms' }} />
                                                    <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-pulse" style={{ animationDelay: '300ms' }} />
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                    <div ref={messagesEndRef} />
                                </div>

                                {/* Quick replies when chat is active */}
                                {testMessages.length > 0 && !sendingTest && (
                                    <div className="px-4 py-2 border-t border-border/30 flex gap-2 overflow-x-auto scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
                                        {['Obrigado!', 'Pode ser amanha?', 'Qual o valor?', 'Aceita convenio?'].map((msg) => (
                                            <button
                                                key={msg}
                                                onClick={() => handleQuickMessage(msg)}
                                                className="text-[11px] px-2.5 py-1 rounded-full bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/40 transition-colors whitespace-nowrap shrink-0"
                                            >
                                                {msg}
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {/* Input */}
                                <form onSubmit={handleSendTestMessage} className="border-t border-border/60 p-3 flex gap-2 bg-background">
                                    <Input
                                        value={testInput}
                                        onChange={(e) => setTestInput(e.target.value)}
                                        placeholder="Digite sua mensagem..."
                                        disabled={sendingTest}
                                        className="rounded-xl h-10"
                                    />
                                    <Button
                                        type="submit"
                                        variant="gradient"
                                        disabled={sendingTest || !testInput.trim()}
                                        size="icon"
                                        className="rounded-xl h-10 w-10 shrink-0"
                                    >
                                        <Send className="h-4 w-4" />
                                    </Button>
                                </form>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    )
}
