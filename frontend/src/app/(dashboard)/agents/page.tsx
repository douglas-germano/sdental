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
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Agentes IA</h1>
                <p className="text-muted-foreground">
                    Personalize o comportamento e conhecimento da sua assistente virtual
                </p>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
                <TabsList>
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
                    <Card>
                        <CardHeader>
                            <CardTitle>Configurações Gerais</CardTitle>
                            <CardDescription>
                                Defina a identidade e parâmetros do modelo
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="name">Nome do Agente</Label>
                                    <Input
                                        id="name"
                                        value={agentConfig.name}
                                        onChange={(e) => setAgentConfig({ ...agentConfig, name: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="model">Modelo IA</Label>
                                    <Input
                                        id="model"
                                        value={agentConfig.model}
                                        disabled
                                        className="bg-gray-100"
                                    />
                                    <p className="text-xs text-muted-foreground">O modelo é gerenciado pelo sistema.</p>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="temperature">Criatividade (Temperatura): {agentConfig.temperature}</Label>
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.1"
                                    value={agentConfig.temperature}
                                    onChange={(e) => setAgentConfig({ ...agentConfig, temperature: parseFloat(e.target.value) })}
                                    className="w-full"
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

                            <Button onClick={handleSave} disabled={saving}>
                                <Save className="h-4 w-4 mr-2" />
                                {saving ? 'Salvando...' : 'Salvar Alterações'}
                            </Button>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="knowledge" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Base de Conhecimento</CardTitle>
                            <CardDescription>
                                Informações específicas que o agente pode consultar
                            </CardDescription>
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
                            <Button onClick={handleSave} disabled={saving}>
                                <Save className="h-4 w-4 mr-2" />
                                {saving ? 'Salvando...' : 'Salvar Conhecimento'}
                            </Button>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="test">
                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle>Testar Agente</CardTitle>
                                    <CardDescription>
                                        Converse com o agente para testar suas respostas
                                    </CardDescription>
                                </div>
                                {testMessages.length > 0 && (
                                    <Button variant="outline" size="sm" onClick={clearTestChat}>
                                        Limpar Chat
                                    </Button>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="border rounded-lg h-[400px] flex flex-col">
                                {/* Messages */}
                                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                                    {testMessages.length === 0 ? (
                                        <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                                            Envie uma mensagem para testar o agente
                                        </div>
                                    ) : (
                                        testMessages.map((msg, index) => (
                                            <div
                                                key={index}
                                                className={`flex items-start gap-3 ${
                                                    msg.role === 'user' ? 'flex-row-reverse' : ''
                                                }`}
                                            >
                                                <div
                                                    className={`h-8 w-8 rounded-full flex items-center justify-center ${
                                                        msg.role === 'user'
                                                            ? 'bg-primary text-primary-foreground'
                                                            : 'bg-gray-100'
                                                    }`}
                                                >
                                                    {msg.role === 'user' ? (
                                                        <User className="h-4 w-4" />
                                                    ) : (
                                                        <Bot className="h-4 w-4" />
                                                    )}
                                                </div>
                                                <div
                                                    className={`max-w-[70%] rounded-lg px-4 py-2 ${
                                                        msg.role === 'user'
                                                            ? 'bg-primary text-primary-foreground'
                                                            : 'bg-gray-100'
                                                    }`}
                                                >
                                                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                    {sendingTest && (
                                        <div className="flex items-start gap-3">
                                            <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center">
                                                <Bot className="h-4 w-4" />
                                            </div>
                                            <div className="bg-gray-100 rounded-lg px-4 py-2">
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            </div>
                                        </div>
                                    )}
                                    <div ref={messagesEndRef} />
                                </div>

                                {/* Input */}
                                <form onSubmit={handleSendTestMessage} className="border-t p-4 flex gap-2">
                                    <Input
                                        value={testInput}
                                        onChange={(e) => setTestInput(e.target.value)}
                                        placeholder="Digite sua mensagem..."
                                        disabled={sendingTest}
                                    />
                                    <Button type="submit" disabled={sendingTest || !testInput.trim()}>
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
