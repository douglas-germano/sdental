'use client'

import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/app/providers'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/components/ui/toast'
import { agentsApi } from '@/lib/api'
import { Bot, Save, Sparkles, MessageSquare, Send, Loader2, User } from 'lucide-react'

interface TestMessage {
    role: 'user' | 'assistant'
    content: string
}

export default function AgentsPage() {
    const { clinic } = useAuth()
    const { toast } = useToast()
    const [saving, setSaving] = useState(false)
    const [loading, setLoading] = useState(true)
    const [activeTab, setActiveTab] = useState('general')

    const [agentConfig, setAgentConfig] = useState({
        name: 'Assistente SDental',
        model: 'claude-3-haiku-20240307',
        temperature: 0.7,
        systemPrompt: '',
        context: ''
    })

    // Test chat state
    const [testMessages, setTestMessages] = useState<TestMessage[]>([])
    const [testInput, setTestInput] = useState('')
    const [sendingTest, setSendingTest] = useState(false)
    const messagesEndRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        fetchConfig()
    }, [])

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [testMessages])

    const fetchConfig = async () => {
        try {
            const response = await agentsApi.getConfig()
            const config = response.data
            setAgentConfig({
                name: config.name || 'Assistente SDental',
                model: config.model || 'claude-3-haiku-20240307',
                temperature: config.temperature || 0.7,
                systemPrompt: config.system_prompt || getDefaultSystemPrompt(),
                context: config.context || getDefaultContext()
            })
        } catch (error) {
            console.error('Error fetching agent config:', error)
            // Use defaults if API fails
            setAgentConfig({
                ...agentConfig,
                systemPrompt: getDefaultSystemPrompt(),
                context: getDefaultContext()
            })
        } finally {
            setLoading(false)
        }
    }

    const getDefaultSystemPrompt = () => `Você é uma assistente virtual da clínica odontológica ${clinic?.name || 'SDental'}.
Seu objetivo é agendar consultas, tirar dúvidas sobre tratamentos e fornecer informações sobre a clínica.
Seja sempre cordial, profissional e empática.
Use emojis ocasionalmente para tornar a conversa mais leve.`

    const getDefaultContext = () => {
        const hours = clinic?.business_hours
        let hoursText = 'Horários não configurados'
        if (hours) {
            const days = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']
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

        const services = clinic?.services?.map(s => `- ${s.name} (${s.duration} min)`).join('\n') || 'Serviços não configurados'

        return `Horários de funcionamento:
${hoursText}

Serviços oferecidos:
${services}

Telefone: ${clinic?.phone || 'Não informado'}`
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
            toast({
                title: 'Sucesso',
                description: 'Configurações salvas com sucesso!',
                variant: 'success',
            })
        } catch (error) {
            console.error('Error saving config:', error)
            toast({
                title: 'Erro',
                description: 'Não foi possível salvar as configurações.',
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
                content: 'Desculpe, não foi possível processar sua mensagem. Verifique se a API está configurada corretamente.'
            }])
        } finally {
            setSendingTest(false)
        }
    }

    const clearTestChat = () => {
        setTestMessages([])
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        )
    }

    return (
        <div className="space-y-6 animate-fade-in">
            <div>
                <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-primary to-violet-500 bg-clip-text text-transparent">
                    Agentes IA
                </h1>
                <p className="text-muted-foreground">
                    Personalize o comportamento e conhecimento da sua assistente virtual
                </p>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
                <TabsList className="grid w-full max-w-md grid-cols-3">
                    <TabsTrigger value="general" className="gap-2">
                        <Bot className="h-4 w-4" />
                        Geral
                    </TabsTrigger>
                    <TabsTrigger value="knowledge" className="gap-2">
                        <Sparkles className="h-4 w-4" />
                        Conhecimento
                    </TabsTrigger>
                    <TabsTrigger value="test" className="gap-2">
                        <MessageSquare className="h-4 w-4" />
                        Teste
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="general" className="space-y-4">
                    <Card className="border-border/50">
                        <CardHeader>
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-xl bg-gradient-primary flex items-center justify-center">
                                    <Bot className="h-5 w-5 text-white" />
                                </div>
                                <div>
                                    <CardTitle>Configurações Gerais</CardTitle>
                                    <CardDescription>
                                        Defina a identidade e parâmetros do modelo
                                    </CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="name">Nome do Agente</Label>
                                    <div className="relative">
                                        <Bot className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            id="name"
                                            value={agentConfig.name}
                                            onChange={(e) => setAgentConfig({ ...agentConfig, name: e.target.value })}
                                            className="pl-11"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="model">Modelo IA</Label>
                                    <Input
                                        id="model"
                                        value={agentConfig.model}
                                        disabled
                                        className="bg-muted/30"
                                    />
                                    <p className="text-xs text-muted-foreground">O modelo é gerenciado pelo sistema.</p>
                                </div>
                            </div>

                            <div className="space-y-3 bg-muted/30 p-4 rounded-xl border border-border/50">
                                <Label htmlFor="temperature">Criatividade (Temperatura): <span className="text-primary font-semibold">{agentConfig.temperature}</span></Label>
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.1"
                                    value={agentConfig.temperature}
                                    onChange={(e) => setAgentConfig({ ...agentConfig, temperature: parseFloat(e.target.value) })}
                                    className="w-full h-2 bg-muted rounded-full appearance-none cursor-pointer accent-primary"
                                />
                                <div className="flex justify-between text-xs text-muted-foreground">
                                    <span>Preciso</span>
                                    <span>Criativo</span>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="prompt">Prompt do Sistema</Label>
                                <Textarea
                                    id="prompt"
                                    rows={10}
                                    value={agentConfig.systemPrompt}
                                    onChange={(e) => setAgentConfig({ ...agentConfig, systemPrompt: e.target.value })}
                                    className="font-mono text-sm"
                                />
                                <p className="text-xs text-muted-foreground">
                                    Instruções base que definem a personalidade e regras do agente.
                                </p>
                            </div>

                            <Button variant="gradient" onClick={handleSave} disabled={saving} className="gap-2">
                                <Save className="h-4 w-4" />
                                {saving ? 'Salvando...' : 'Salvar Alterações'}
                            </Button>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="knowledge" className="space-y-4">
                    <Card className="border-border/50">
                        <CardHeader>
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                                    <Sparkles className="h-5 w-5 text-white" />
                                </div>
                                <div>
                                    <CardTitle>Base de Conhecimento</CardTitle>
                                    <CardDescription>
                                        Informações específicas que o agente pode consultar
                                    </CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="context">Contexto da Clínica</Label>
                                <Textarea
                                    id="context"
                                    rows={10}
                                    value={agentConfig.context}
                                    onChange={(e) => setAgentConfig({ ...agentConfig, context: e.target.value })}
                                    className="font-mono text-sm"
                                />
                                <p className="text-xs text-muted-foreground">
                                    Adicione informações sobre horários, localização, procedimentos e políticas.
                                </p>
                            </div>
                            <Button variant="gradient" onClick={handleSave} disabled={saving} className="gap-2">
                                <Save className="h-4 w-4" />
                                {saving ? 'Salvando...' : 'Salvar Conhecimento'}
                            </Button>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="test">
                    <Card className="border-border/50">
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                                        <MessageSquare className="h-5 w-5 text-white" />
                                    </div>
                                    <div>
                                        <CardTitle>Testar Agente</CardTitle>
                                        <CardDescription>
                                            Converse com o agente para testar suas respostas
                                        </CardDescription>
                                    </div>
                                </div>
                                {testMessages.length > 0 && (
                                    <Button variant="outline" size="sm" onClick={clearTestChat}>
                                        Limpar Chat
                                    </Button>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="border border-border/50 rounded-2xl h-[400px] flex flex-col bg-muted/20 overflow-hidden">
                                {/* Messages */}
                                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                                    {testMessages.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                                            <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
                                                <Bot className="h-8 w-8 opacity-50" />
                                            </div>
                                            <p className="font-medium">Envie uma mensagem para testar</p>
                                            <p className="text-sm">Simule uma conversa com o agente</p>
                                        </div>
                                    ) : (
                                        testMessages.map((msg, index) => (
                                            <div
                                                key={index}
                                                className={`flex items-start gap-3 animate-fade-in ${
                                                    msg.role === 'user' ? 'flex-row-reverse' : ''
                                                }`}
                                            >
                                                <div
                                                    className={`h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                                                        msg.role === 'user'
                                                            ? 'bg-gradient-primary text-white'
                                                            : 'bg-muted'
                                                    }`}
                                                >
                                                    {msg.role === 'user' ? (
                                                        <User className="h-4 w-4" />
                                                    ) : (
                                                        <Bot className="h-4 w-4" />
                                                    )}
                                                </div>
                                                <div
                                                    className={`max-w-[70%] rounded-2xl px-4 py-3 ${
                                                        msg.role === 'user'
                                                            ? 'bg-gradient-primary text-white rounded-tr-md'
                                                            : 'bg-background border border-border/50 rounded-tl-md'
                                                    }`}
                                                >
                                                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                    {sendingTest && (
                                        <div className="flex items-start gap-3 animate-fade-in">
                                            <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center">
                                                <Bot className="h-4 w-4" />
                                            </div>
                                            <div className="bg-background border border-border/50 rounded-2xl rounded-tl-md px-4 py-3">
                                                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                            </div>
                                        </div>
                                    )}
                                    <div ref={messagesEndRef} />
                                </div>

                                {/* Input */}
                                <form onSubmit={handleSendTestMessage} className="border-t border-border/50 p-4 flex gap-2 bg-background">
                                    <Input
                                        value={testInput}
                                        onChange={(e) => setTestInput(e.target.value)}
                                        placeholder="Digite sua mensagem..."
                                        disabled={sendingTest}
                                        className="rounded-xl"
                                    />
                                    <Button type="submit" variant="gradient" disabled={sendingTest || !testInput.trim()} size="icon" className="rounded-xl">
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
