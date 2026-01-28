'use client'

export const runtime = 'edge'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
    Calendar,
    Clock,
    User,
    Phone,
    Mail,
    FileText,
    CheckCircle,
    ArrowLeft,
    ArrowRight,
    Loader2,
    Users
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Service {
    name: string
    duration: number
    price?: number
}

interface TimeSlot {
    time: string
    duration: number
}

interface CalendarDay {
    date: string
    day: number
    weekday: string
    available: boolean
}

interface Professional {
    id: string
    name: string
    specialty?: string
    color?: string
}

interface ClinicInfo {
    name: string
    phone: string
    services: Service[]
    business_hours: Record<string, unknown>
    professionals: Professional[]
    has_professionals: boolean
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://sdental.onrender.com/api'

export default function BookingPage() {
    const params = useParams()
    const slug = params.slug as string

    const [step, setStep] = useState(1)
    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)

    const [clinic, setClinic] = useState<ClinicInfo | null>(null)
    const [calendar, setCalendar] = useState<CalendarDay[]>([])
    const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([])
    const [loadingSlots, setLoadingSlots] = useState(false)

    const [selectedService, setSelectedService] = useState<Service | null>(null)
    const [selectedProfessional, setSelectedProfessional] = useState<Professional | null>(null)
    const [selectedDate, setSelectedDate] = useState<string | null>(null)
    const [selectedTime, setSelectedTime] = useState<string | null>(null)

    const [formData, setFormData] = useState({
        name: '',
        phone: '',
        email: '',
        notes: ''
    })

    const [appointment, setAppointment] = useState<{
        service: string
        date: string
        time: string
        patient_name: string
    } | null>(null)

    // Fetch clinic info and calendar
    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true)
                const [clinicRes, calendarRes] = await Promise.all([
                    fetch(`${API_URL}/public/clinic/${slug}`),
                    fetch(`${API_URL}/public/clinic/${slug}/calendar`)
                ])

                if (!clinicRes.ok) {
                    const data = await clinicRes.json()
                    setError(data.error || 'Clínica não encontrada')
                    return
                }

                const clinicData = await clinicRes.json()
                const calendarData = await calendarRes.json()

                setClinic(clinicData)
                setCalendar(calendarData.calendar || [])
            } catch {
                setError('Erro ao carregar dados da clínica')
            } finally {
                setLoading(false)
            }
        }

        fetchData()
    }, [slug])

    // Fetch time slots when date is selected
    useEffect(() => {
        if (!selectedDate) return

        const fetchSlots = async () => {
            setLoadingSlots(true)
            setTimeSlots([])
            try {
                let url = `${API_URL}/public/clinic/${slug}/availability?date=${selectedDate}`
                if (selectedService) {
                    url += `&service=${encodeURIComponent(selectedService.name)}`
                }
                if (selectedProfessional) {
                    url += `&professional_id=${selectedProfessional.id}`
                }
                const res = await fetch(url)
                const data = await res.json()
                setTimeSlots(data.available_slots || [])
            } catch {
                console.error('Error fetching slots')
            } finally {
                setLoadingSlots(false)
            }
        }

        fetchSlots()
    }, [selectedDate, selectedService, selectedProfessional, slug])

    const handleSubmit = async () => {
        if (!selectedService || !selectedDate || !selectedTime) return

        setSubmitting(true)
        setError(null)

        try {
            const res = await fetch(`${API_URL}/public/clinic/${slug}/book`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    service: selectedService.name,
                    date: selectedDate,
                    time: selectedTime,
                    name: formData.name,
                    phone: formData.phone,
                    email: formData.email || undefined,
                    notes: formData.notes || undefined,
                    professional_id: selectedProfessional?.id || undefined
                })
            })

            const data = await res.json()

            if (!res.ok) {
                setError(data.error || 'Erro ao criar agendamento')
                return
            }

            setAppointment(data.appointment)
            setSuccess(true)
        } catch {
            setError('Erro ao criar agendamento')
        } finally {
            setSubmitting(false)
        }
    }

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr + 'T12:00:00')
        return date.toLocaleDateString('pt-BR', {
            weekday: 'long',
            day: 'numeric',
            month: 'long'
        })
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        )
    }

    if (error && !clinic) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
                <Card className="max-w-md w-full">
                    <CardContent className="p-8 text-center">
                        <div className="h-16 w-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                            <span className="text-2xl">❌</span>
                        </div>
                        <h2 className="text-xl font-semibold mb-2">Erro</h2>
                        <p className="text-gray-600">{error}</p>
                    </CardContent>
                </Card>
            </div>
        )
    }

    if (success && appointment) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center p-4">
                <Card className="max-w-md w-full">
                    <CardContent className="p-8 text-center">
                        <div className="h-20 w-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
                            <CheckCircle className="h-10 w-10 text-green-600" />
                        </div>
                        <h2 className="text-2xl font-bold text-green-800 mb-2">
                            Agendamento Confirmado!
                        </h2>
                        <p className="text-gray-600 mb-6">
                            Seu horário foi reservado com sucesso.
                        </p>
                        <div className="bg-green-50 rounded-xl p-4 text-left space-y-2">
                            <p><strong>Serviço:</strong> {appointment.service}</p>
                            <p><strong>Data:</strong> {appointment.date}</p>
                            <p><strong>Horário:</strong> {appointment.time}</p>
                            <p><strong>Paciente:</strong> {appointment.patient_name}</p>
                        </div>
                        <p className="text-sm text-gray-500 mt-6">
                            Em caso de dúvidas, entre em contato pelo telefone da clínica.
                        </p>
                    </CardContent>
                </Card>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8 px-4">
            <div className="max-w-2xl mx-auto">
                {/* Header */}
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-gray-900 mb-2">
                        {clinic?.name}
                    </h1>
                    <p className="text-gray-600">Agende sua consulta online</p>
                </div>

                {/* Progress Steps */}
                {(() => {
                    const totalSteps = clinic?.has_professionals ? 5 : 4
                    return (
                        <div className="flex items-center justify-center gap-2 mb-8">
                            {Array.from({ length: totalSteps }, (_, i) => i + 1).map((s) => (
                                <div key={s} className="flex items-center">
                                    <div
                                        className={cn(
                                            'h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors',
                                            step >= s
                                                ? 'bg-blue-600 text-white'
                                                : 'bg-gray-200 text-gray-500'
                                        )}
                                    >
                                        {s}
                                    </div>
                                    {s < totalSteps && (
                                        <div
                                            className={cn(
                                                'w-8 h-1 mx-1',
                                                step > s ? 'bg-blue-600' : 'bg-gray-200'
                                            )}
                                        />
                                    )}
                                </div>
                            ))}
                        </div>
                    )
                })()}

                {/* Error Message */}
                {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-6">
                        {error}
                    </div>
                )}

                {/* Step 1: Select Service */}
                {step === 1 && (
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <FileText className="h-5 w-5 text-blue-600" />
                                Selecione o Serviço
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {(!clinic?.services || clinic.services.length === 0) ? (
                                <p className="text-gray-500 text-center py-8">
                                    Nenhum serviço disponível
                                </p>
                            ) : (
                                clinic.services.map((service, i) => (
                                    <button
                                        key={i}
                                        onClick={() => {
                                            setSelectedService(service)
                                            setSelectedProfessional(null)
                                            setStep(2)
                                        }}
                                        className={cn(
                                            'w-full p-4 rounded-xl border-2 text-left transition-all hover:border-blue-400 hover:bg-blue-50',
                                            selectedService?.name === service.name
                                                ? 'border-blue-600 bg-blue-50'
                                                : 'border-gray-200'
                                        )}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="font-medium text-gray-900">{service.name}</p>
                                                <p className="text-sm text-gray-500">
                                                    Duração: {service.duration} minutos
                                                </p>
                                            </div>
                                            {service.price && (
                                                <Badge variant="secondary">
                                                    R$ {service.price}
                                                </Badge>
                                            )}
                                        </div>
                                    </button>
                                ))
                            )}
                        </CardContent>
                    </Card>
                )}

                {/* Step 2: Select Professional (only if clinic has professionals) */}
                {step === 2 && clinic?.has_professionals && (
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Users className="h-5 w-5 text-blue-600" />
                                Escolha o Profissional
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {/* Option for any professional */}
                            <button
                                onClick={() => {
                                    setSelectedProfessional(null)
                                    setStep(3)
                                }}
                                className={cn(
                                    'w-full p-4 rounded-xl border-2 text-left transition-all hover:border-blue-400 hover:bg-blue-50',
                                    selectedProfessional === null
                                        ? 'border-blue-600 bg-blue-50'
                                        : 'border-gray-200'
                                )}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center">
                                        <Users className="h-5 w-5 text-gray-600" />
                                    </div>
                                    <div>
                                        <p className="font-medium text-gray-900">Qualquer profissional</p>
                                        <p className="text-sm text-gray-500">Proximo disponivel</p>
                                    </div>
                                </div>
                            </button>

                            {/* List professionals */}
                            {clinic.professionals.map((professional) => (
                                <button
                                    key={professional.id}
                                    onClick={() => {
                                        setSelectedProfessional(professional)
                                        setStep(3)
                                    }}
                                    className={cn(
                                        'w-full p-4 rounded-xl border-2 text-left transition-all hover:border-blue-400 hover:bg-blue-50',
                                        selectedProfessional?.id === professional.id
                                            ? 'border-blue-600 bg-blue-50'
                                            : 'border-gray-200'
                                    )}
                                >
                                    <div className="flex items-center gap-3">
                                        <div
                                            className="h-10 w-10 rounded-full flex items-center justify-center text-white font-medium"
                                            style={{ backgroundColor: professional.color || '#3B82F6' }}
                                        >
                                            {professional.name.charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                            <p className="font-medium text-gray-900">{professional.name}</p>
                                            {professional.specialty && (
                                                <p className="text-sm text-gray-500">{professional.specialty}</p>
                                            )}
                                        </div>
                                    </div>
                                </button>
                            ))}

                            <Button
                                variant="ghost"
                                className="mt-4"
                                onClick={() => setStep(1)}
                            >
                                <ArrowLeft className="h-4 w-4 mr-2" />
                                Voltar
                            </Button>
                        </CardContent>
                    </Card>
                )}

                {/* Step 2: Select Date (for clinics without professionals) OR Step 3: Select Date (for clinics with professionals) */}
                {((step === 2 && !clinic?.has_professionals) || (step === 3 && clinic?.has_professionals)) && (
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Calendar className="h-5 w-5 text-blue-600" />
                                Escolha a Data
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-7 gap-2">
                                {calendar.slice(0, 28).map((day) => (
                                    <button
                                        key={day.date}
                                        disabled={!day.available}
                                        onClick={() => {
                                            setSelectedDate(day.date)
                                            setSelectedTime(null)
                                            setStep(clinic?.has_professionals ? 4 : 3)
                                        }}
                                        className={cn(
                                            'p-2 rounded-lg text-center transition-all',
                                            !day.available
                                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                                : selectedDate === day.date
                                                    ? 'bg-blue-600 text-white'
                                                    : 'bg-white border border-gray-200 hover:border-blue-400 hover:bg-blue-50'
                                        )}
                                    >
                                        <p className="text-xs text-gray-500">{day.weekday}</p>
                                        <p className="font-medium">{day.day}</p>
                                    </button>
                                ))}
                            </div>
                            <Button
                                variant="ghost"
                                className="mt-4"
                                onClick={() => setStep(clinic?.has_professionals ? 2 : 1)}
                            >
                                <ArrowLeft className="h-4 w-4 mr-2" />
                                Voltar
                            </Button>
                        </CardContent>
                    </Card>
                )}

                {/* Step 3 or 4: Select Time */}
                {((step === 3 && !clinic?.has_professionals) || (step === 4 && clinic?.has_professionals)) && (
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Clock className="h-5 w-5 text-blue-600" />
                                Escolha o Horario
                            </CardTitle>
                            <p className="text-sm text-gray-500">
                                {selectedDate && formatDate(selectedDate)}
                                {selectedProfessional && ` - ${selectedProfessional.name}`}
                            </p>
                        </CardHeader>
                        <CardContent>
                            {loadingSlots ? (
                                <div className="flex items-center justify-center py-8">
                                    <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                                </div>
                            ) : timeSlots.length === 0 ? (
                                <p className="text-gray-500 text-center py-8">
                                    Nenhum horario disponivel nesta data
                                </p>
                            ) : (
                                <div className="grid grid-cols-4 gap-2">
                                    {timeSlots.map((slot) => (
                                        <button
                                            key={slot.time}
                                            onClick={() => {
                                                setSelectedTime(slot.time)
                                                setStep(clinic?.has_professionals ? 5 : 4)
                                            }}
                                            className={cn(
                                                'p-3 rounded-lg text-center transition-all font-medium',
                                                selectedTime === slot.time
                                                    ? 'bg-blue-600 text-white'
                                                    : 'bg-white border border-gray-200 hover:border-blue-400 hover:bg-blue-50'
                                            )}
                                        >
                                            {slot.time}
                                        </button>
                                    ))}
                                </div>
                            )}
                            <Button
                                variant="ghost"
                                className="mt-4"
                                onClick={() => setStep(clinic?.has_professionals ? 3 : 2)}
                            >
                                <ArrowLeft className="h-4 w-4 mr-2" />
                                Voltar
                            </Button>
                        </CardContent>
                    </Card>
                )}

                {/* Step 4 or 5: Patient Info */}
                {((step === 4 && !clinic?.has_professionals) || (step === 5 && clinic?.has_professionals)) && (
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <User className="h-5 w-5 text-blue-600" />
                                Seus Dados
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {/* Summary */}
                            <div className="bg-blue-50 rounded-xl p-4 space-y-1 text-sm">
                                <p><strong>Servico:</strong> {selectedService?.name}</p>
                                {selectedProfessional && (
                                    <p><strong>Profissional:</strong> {selectedProfessional.name}</p>
                                )}
                                <p><strong>Data:</strong> {selectedDate && formatDate(selectedDate)}</p>
                                <p><strong>Horario:</strong> {selectedTime}</p>
                            </div>

                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="name" className="flex items-center gap-2">
                                        <User className="h-4 w-4" />
                                        Nome Completo *
                                    </Label>
                                    <Input
                                        id="name"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        placeholder="Seu nome"
                                        required
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="phone" className="flex items-center gap-2">
                                        <Phone className="h-4 w-4" />
                                        Telefone (WhatsApp) *
                                    </Label>
                                    <Input
                                        id="phone"
                                        value={formData.phone}
                                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                        placeholder="(99) 99999-9999"
                                        required
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="email" className="flex items-center gap-2">
                                        <Mail className="h-4 w-4" />
                                        E-mail (opcional)
                                    </Label>
                                    <Input
                                        id="email"
                                        type="email"
                                        value={formData.email}
                                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                        placeholder="seu@email.com"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="notes" className="flex items-center gap-2">
                                        <FileText className="h-4 w-4" />
                                        Observações (opcional)
                                    </Label>
                                    <Input
                                        id="notes"
                                        value={formData.notes}
                                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                        placeholder="Alguma informação adicional?"
                                    />
                                </div>
                            </div>

                            <div className="flex gap-3 pt-4">
                                <Button
                                    variant="outline"
                                    onClick={() => setStep(clinic?.has_professionals ? 4 : 3)}
                                    className="flex-1"
                                >
                                    <ArrowLeft className="h-4 w-4 mr-2" />
                                    Voltar
                                </Button>
                                <Button
                                    onClick={handleSubmit}
                                    disabled={!formData.name || !formData.phone || submitting}
                                    className="flex-1 bg-blue-600 hover:bg-blue-700"
                                >
                                    {submitting ? (
                                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                    ) : (
                                        <ArrowRight className="h-4 w-4 mr-2" />
                                    )}
                                    Confirmar
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Footer */}
                <div className="text-center mt-8 text-sm text-gray-500">
                    <p>Powered by SDental</p>
                </div>
            </div>
        </div>
    )
}
