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
import {
    Bot, Save, Sparkles, MessageSquare, Send, Loader2, User,
    Zap, Brain, AlertCircle, RotateCcw, Eye, Copy, Check,
    Info, Thermometer, ChevronRight
} from 'lucide-react'
import { PageLoader } from '@/components/ui/page-loader'
import { PageHeader } from '@/components/ui/page-header'
import { cn } from '@/lib/utils'

interface TestMessage {
    role: 'user' | 'assistant'
    content: string
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

export default function AgentsPage() {
    const { clinic } = useAuth()
    const { toast } = useToast()
    const [saving, setSaving] = useState(false)
    const [loading, setLoading] = useState(true)
    const [activeTab, setActiveTab] = useState('general')
    const [hasChanges, setHasChanges] = useState(false)
    const [savedConfig, setSavedConfig] = useState<string>('')
    const [previewTemplate, setPreviewTemplate] = useState<number | null>(null)
    const [copiedVar, setCopiedVar] = useState<string | null>(null)

    const [agentConfig, setAgentConfig] = useState({
        name: 'Assistente SDental',
        temperature: 0.7,
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
            const current = JSON.stringify({
                name: agentConfig.name,
                temperature: agentConfig.temperature,
                systemPrompt: agentConfig.systemPrompt,
                context: agentConfig.context
            })
            setHasChanges(current !== savedConfig)
        }
    }, [agentConfig, savedConfig])

    useEffect(() => {
        fetchConfig()
    }, [])

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

    const getDefaultSystemPrompt = useCallback(() => {
        return `Você é uma assistente virtual da clínica odontológica ${clinic?.name || 'SDental'}.
Seu objetivo é agendar consultas, tirar dúvidas sobre tratamentos e fornecer informações sobre a clínica.
Seja sempre cordial, profissional e empática.
Use emojis ocasionalmente para tornar a conversa mais leve.`
    }, [clinic?.name])

    const getDefaultContext = useCallback(() => {
        const hours = clinic?.business_hours
        let hoursText = 'Horarios nao configurados'
        if (hours) {
            const days = ['Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta', 'Sabado', 'Domingo']
            const activeHours = Object.entries(hours)
                .filter(([_, h]: [string, unknown]) => (h as { active: boolean }).active)
                .map(([day, h]: [string, unknown]) => {
                    const hour = h as { start: string; end: string }
                    return `${days[parseInt(day)]}: ${hour.start} - ${hour.end}`
                })
            if (activeHours.length > 0) {
                hoursText = activeHours.join('\n')
            }
        }

        const services = clinic?.services?.map(s => `- ${s.name} (${s.duration} min)`).join('\n') || 'Servicos nao configurados'

        return `Horarios de funcionamento:\n${hoursText}\n\nServicos oferecidos:\n${services}\n\nTelefone: ${clinic?.phone || 'Nao informado'}`
    }, [clinic])

    const fetchConfig = async () => {
        try {
            const response = await agentsApi.getConfig()
            const config = response.data
            const newConfig = {
                name: config.name || 'Assistente SDental',
                temperature: config.temperature || 0.7,
                systemPrompt: config.system_prompt || getDefaultSystemPrompt(),
                context: config.context || getDefaultContext()
            }
            setAgentConfig(newConfig)
            setSavedConfig(JSON.stringify({
                name: newConfig.name,
                temperature: newConfig.temperature,
                systemPrompt: newConfig.systemPrompt,
                context: newConfig.context
            }))
        } catch (error) {
            console.error('Error fetching agent config:', error)
            const newConfig = {
                ...agentConfig,
                systemPrompt: getDefaultSystemPrompt(),
                context: getDefaultContext()
            }
            setAgentConfig(newConfig)
            setSavedConfig(JSON.stringify({
                name: newConfig.name,
                temperature: newConfig.temperature,
                systemPrompt: newConfig.systemPrompt,
                context: newConfig.context
            }))
        } finally {
            setLoading(false)
        }
    }

    const handleSave = async () => {
        setSaving(true)
        try {
            await agentsApi.updateConfig({
                name: agentConfig.name,
                system_prompt: agentConfig.systemPrompt,
                temperature: agentConfig.temperature,
                context: agentConfig.context
            })
            const newSaved = JSON.stringify({
                name: agentConfig.name,
                temperature: agentConfig.temperature,
                systemPrompt: agentConfig.systemPrompt,
                context: agentConfig.context
            })
            setSavedConfig(newSaved)
            setHasChanges(false)
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
            const response = await agentsApi.testMessage(userMessage)
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

    const handleApplyTemplate = (index: number) => {
        const template = PROMPT_TEMPLATES[index]
        setAgentConfig(prev => ({ ...prev, systemPrompt: template.content }))
        setPreviewTemplate(null)
        toast({
            title: `Modelo "${template.name}" aplicado`,
            description: 'Voce pode editar o prompt a vontade.',
        })
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
        const newContext = getDefaultContext()
        setAgentConfig(prev => ({ ...prev, context: newContext }))
        toast({
            title: 'Contexto atualizado',
            description: 'Dados recarregados das configuracoes da clinica.',
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
                                <div className="h-10 w-10 rounded-xl bg-gradient-primary flex items-center justify-center shadow-soft">
                                    <Bot className="h-5 w-5 text-white" />
                                </div>
                                <div>
                                    <CardTitle className="text-base">Identidade do Agente</CardTitle>
                                    <CardDescription>Como o agente se apresenta aos pacientes</CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-5">
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

                            {/* Temperature - Custom Slider */}
                            <div className="space-y-3 p-5 rounded-xl bg-muted/30 border border-border/50">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Thermometer className="h-4 w-4 text-muted-foreground" />
                                        <Label className="mb-0">Criatividade</Label>
                                    </div>
                                    <Badge variant={agentConfig.temperature === 0.7 ? 'default' : 'outline'} className="text-xs">
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
                        </CardContent>
                    </Card>

                    {/* Prompt Templates */}
                    <Card className="border-border/60">
                        <CardHeader className="pb-4">
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-soft">
                                    <Sparkles className="h-5 w-5 text-white" />
                                </div>
                                <div>
                                    <CardTitle className="text-base">Modelo de Personalidade</CardTitle>
                                    <CardDescription>Escolha um ponto de partida ou escreva do zero</CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-5">
                            {/* Template Cards */}
                            <div className="grid gap-3 sm:grid-cols-2">
                                {PROMPT_TEMPLATES.map((template, i) => {
                                    const Icon = template.icon
                                    const isActive = previewTemplate === i
                                    return (
                                        <button
                                            key={template.name}
                                            onClick={() => setPreviewTemplate(isActive ? null : i)}
                                            className={cn(
                                                "text-left p-4 rounded-xl border transition-all duration-200 group",
                                                isActive
                                                    ? "border-primary/30 bg-primary/[0.04] shadow-soft"
                                                    : "border-border/50 hover:border-border hover:bg-muted/30"
                                            )}
                                        >
                                            <div className="flex items-start gap-3">
                                                <div className={cn(
                                                    "h-8 w-8 rounded-lg flex items-center justify-center shrink-0 transition-colors",
                                                    isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                                                )}>
                                                    <Icon className="h-4 w-4" />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="font-medium text-sm text-foreground">{template.name}</p>
                                                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{template.description}</p>
                                                </div>
                                                <ChevronRight className={cn(
                                                    "h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform mt-0.5",
                                                    isActive && "rotate-90 text-primary"
                                                )} />
                                            </div>
                                        </button>
                                    )
                                })}
                            </div>

                            {/* Template Preview */}
                            {previewTemplate !== null && (
                                <div className="rounded-xl border border-primary/20 bg-primary/[0.02] p-4 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Eye className="h-4 w-4 text-primary" />
                                            <span className="text-sm font-medium text-primary">Preview: {PROMPT_TEMPLATES[previewTemplate].name}</span>
                                        </div>
                                        <Button
                                            size="sm"
                                            onClick={() => handleApplyTemplate(previewTemplate)}
                                            className="gap-1.5"
                                        >
                                            <Check className="h-3 w-3" />
                                            Usar este modelo
                                        </Button>
                                    </div>
                                    <pre className="text-xs text-muted-foreground bg-muted/40 rounded-lg p-3 whitespace-pre-wrap font-mono leading-relaxed max-h-40 overflow-auto scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
                                        {PROMPT_TEMPLATES[previewTemplate].content}
                                    </pre>
                                </div>
                            )}

                            {/* Prompt Editor */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="prompt">Prompt do Sistema</Label>
                                    <span className={cn(
                                        "text-xs tabular-nums",
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
                                    placeholder="Descreva como o agente deve se comportar..."
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
                </TabsContent>

                {/* ======================== TAB: CONHECIMENTO ======================== */}
                <TabsContent value="knowledge" className="space-y-6">
                    <Card className="border-border/60">
                        <CardHeader className="pb-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-soft">
                                        <Brain className="h-5 w-5 text-white" />
                                    </div>
                                    <div>
                                        <CardTitle className="text-base">Base de Conhecimento</CardTitle>
                                        <CardDescription>Informacoes que o agente usa para responder</CardDescription>
                                    </div>
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleRefreshContext}
                                    className="gap-2"
                                >
                                    <RotateCcw className="h-3.5 w-3.5" />
                                    Sincronizar
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-5">
                            {/* Info banner */}
                            <div className="flex gap-3 p-4 rounded-xl bg-primary/[0.04] border border-primary/10">
                                <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                                <div className="text-xs text-muted-foreground leading-relaxed">
                                    <p className="font-medium text-foreground mb-1">Como funciona?</p>
                                    O agente consulta estas informacoes durante as conversas para dar respostas precisas sobre horarios, servicos e politicas da clinica. Clique em &quot;Sincronizar&quot; para atualizar com os dados atuais.
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="context">Contexto da Clinica</Label>
                                    <span className={cn(
                                        "text-xs tabular-nums",
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
                                    placeholder="Adicione informacoes sobre horarios, localizacao, procedimentos..."
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
                                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-soft">
                                        <MessageSquare className="h-5 w-5 text-white" />
                                    </div>
                                    <div>
                                        <CardTitle className="text-base">Testar Agente</CardTitle>
                                        <CardDescription>Simule uma conversa para validar as respostas</CardDescription>
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
                                            <div className="h-14 w-14 rounded-2xl bg-muted/50 border border-border/40 flex items-center justify-center mb-4">
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
                                                            ? 'bg-gradient-primary text-white'
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
                                                            ? 'bg-gradient-primary text-white rounded-tr-md'
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

                            {/* Tips */}
                            {hasChanges && (
                                <div className="flex items-center gap-2 mt-3 text-xs text-warning">
                                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                                    Salve as alteracoes antes de testar para usar a configuracao mais recente.
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    )
}
