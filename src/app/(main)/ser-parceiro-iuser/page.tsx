// app/(main)/ser-parceiro-iuser/page.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { useProfile } from '@/app/contexts/ProfileContext'
import { useTheme } from '@/app/theme'
import Header from '@/app/Header'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import { toast } from 'sonner'
import {
    Car,
    Truck,
    Wrench,
    MapPin,
    Phone,
    Loader2,
    CheckCircle2,
    Send,
} from 'lucide-react'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

type ServiceType = 'motorista' | 'entregador' | 'outro'

const SERVICE_TYPES: { id: ServiceType; label: string; icon: any }[] = [
    { id: 'motorista', label: 'Motorista', icon: Car },
    { id: 'entregador', label: 'Entregador', icon: Truck },
    { id: 'outro', label: 'Outro serviço', icon: Wrench },
]

export default function SerParceiroPage() {
    const router = useRouter()
    const { avatarUrl, bgMode, customBgUrl, profileSlug, loading: profileLoading } = useProfile()
    const { colors } = useTheme()

    const [serviceType, setServiceType] = useState<ServiceType>('motorista')
    const [customService, setCustomService] = useState('')
    const [city, setCity] = useState('')
    const [whatsapp, setWhatsapp] = useState('')
    const [toolDescription, setToolDescription] = useState('')
    const [notes, setNotes] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const [submitted, setSubmitted] = useState(false)

    const handleSubmit = async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            router.push('/login')
            return
        }
        if (!city.trim() || !whatsapp.trim()) {
            toast.error('Preencha a cidade e o WhatsApp')
            return
        }
        if (serviceType === 'outro' && !customService.trim()) {
            toast.error('Conte qual serviço você presta')
            return
        }

        setSubmitting(true)
        try {
            const { error } = await supabase.from('partner_applications').insert({
                applicant_id: user.id,
                service_type: serviceType,
                custom_service: serviceType === 'outro' ? customService.trim() : null,
                city: city.trim(),
                whatsapp: whatsapp.replace(/\D/g, ''),
                tool_description: toolDescription.trim() || null,
                notes: notes.trim() || null,
            })

            if (error) throw error
            setSubmitted(true)
        } catch (err: any) {
            toast.error('Erro ao enviar candidatura: ' + (err.message || 'tente novamente'))
        } finally {
            setSubmitting(false)
        }
    }

    const inputStyle = {
        background: `${colors.border}30`,
        border: `1px solid ${colors.border}`,
        color: colors.textPrimary,
    }

    return (
        <div className="relative min-h-dvh" style={{ background: colors.background }}>
            <div className="fixed inset-0 z-0">
                <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
            </div>

            <main className="relative z-10 min-h-dvh">
                <Header
                    title="Seja Parceiro iUser"
                    showBack={true}
                    onBack={() => router.push('/')}
                    greeting={`Olá, ${profileLoading ? '...' : profileSlug ? `@${profileSlug}` : 'Visitante'}`}
                    avatarUrl={avatarUrl}
                    loading={profileLoading}
                />

                <section className="px-4 md:px-6 mt-4 pb-24 max-w-lg mx-auto">
                    {submitted ? (
                        <div
                            className="rounded-2xl p-8 flex flex-col items-center gap-3 text-center"
                            style={{ background: colors.surface, border: `1px solid ${colors.border}`, boxShadow: colors.shadow }}
                        >
                            <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: GRADIENT, color: '#fff' }}>
                                <CheckCircle2 size={32} />
                            </div>
                            <h2 className="text-lg font-black" style={{ color: colors.textPrimary }}>Candidatura enviada!</h2>
                            <p className="text-sm" style={{ color: colors.textSecondary }}>
                                Vamos entrar em contato pelo WhatsApp assim que abrirmos vagas de parceiro na sua cidade.
                            </p>
                            <button
                                onClick={() => router.push('/')}
                                className="mt-2 px-6 py-3 rounded-full font-bold text-sm"
                                style={{ background: GRADIENT, color: '#fff' }}
                            >
                                Voltar ao início
                            </button>
                        </div>
                    ) : (
                        <div
                            className="rounded-2xl p-5 space-y-5"
                            style={{ background: colors.surface, border: `1px solid ${colors.border}`, boxShadow: colors.shadow }}
                        >
                            <p className="text-sm" style={{ color: colors.textSecondary }}>
                                Seja motorista, entregador ou preste qualquer outro serviço — cadastre-se e comece a ganhar dinheiro.
                            </p>

                            {/* Tipo de serviço */}
                            <div>
                                <label className="text-xs font-bold uppercase tracking-wide" style={{ color: colors.textSecondary }}>
                                    O que você quer oferecer?
                                </label>
                                <div className="grid grid-cols-3 gap-2 mt-2">
                                    {SERVICE_TYPES.map((type) => {
                                        const Icon = type.icon
                                        const active = serviceType === type.id
                                        return (
                                            <button
                                                key={type.id}
                                                onClick={() => setServiceType(type.id)}
                                                className="flex flex-col items-center gap-1.5 py-3 rounded-xl text-[11px] font-bold transition-all"
                                                style={
                                                    active
                                                        ? { background: GRADIENT, color: '#fff' }
                                                        : { background: `${colors.border}30`, color: colors.textSecondary, border: `1px solid ${colors.border}` }
                                                }
                                            >
                                                <Icon size={18} />
                                                {type.label}
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>

                            {serviceType === 'outro' && (
                                <div>
                                    <label className="text-xs font-bold uppercase tracking-wide" style={{ color: colors.textSecondary }}>
                                        Qual serviço você presta?
                                    </label>
                                    <input
                                        type="text"
                                        value={customService}
                                        onChange={(e) => setCustomService(e.target.value)}
                                        placeholder="Ex: Eletricista, faxina, jardinagem..."
                                        className="w-full mt-1 px-4 py-3 rounded-xl text-sm focus:outline-none"
                                        style={inputStyle}
                                    />
                                </div>
                            )}

                            {/* Cidade */}
                            <div>
                                <label className="text-xs font-bold uppercase tracking-wide" style={{ color: colors.textSecondary }}>
                                    Cidade
                                </label>
                                <div className="relative mt-1">
                                    <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: colors.textSecondary }} />
                                    <input
                                        type="text"
                                        value={city}
                                        onChange={(e) => setCity(e.target.value)}
                                        placeholder="Onde você presta o serviço"
                                        className="w-full pl-9 pr-4 py-3 rounded-xl text-sm focus:outline-none"
                                        style={inputStyle}
                                    />
                                </div>
                            </div>

                            {/* WhatsApp */}
                            <div>
                                <label className="text-xs font-bold uppercase tracking-wide" style={{ color: colors.textSecondary }}>
                                    WhatsApp
                                </label>
                                <div className="relative mt-1">
                                    <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: colors.textSecondary }} />
                                    <input
                                        type="tel"
                                        value={whatsapp}
                                        onChange={(e) => setWhatsapp(e.target.value)}
                                        placeholder="(00) 00000-0000"
                                        className="w-full pl-9 pr-4 py-3 rounded-xl text-sm focus:outline-none"
                                        style={inputStyle}
                                    />
                                </div>
                            </div>

                            {/* Ferramenta/veículo */}
                            <div>
                                <label className="text-xs font-bold uppercase tracking-wide" style={{ color: colors.textSecondary }}>
                                    Veículo ou ferramenta (opcional)
                                </label>
                                <input
                                    type="text"
                                    value={toolDescription}
                                    onChange={(e) => setToolDescription(e.target.value)}
                                    placeholder="Ex: Moto Honda CG, carro próprio, furadeira..."
                                    className="w-full mt-1 px-4 py-3 rounded-xl text-sm focus:outline-none"
                                    style={inputStyle}
                                />
                            </div>

                            {/* Observações */}
                            <div>
                                <label className="text-xs font-bold uppercase tracking-wide" style={{ color: colors.textSecondary }}>
                                    Conte um pouco da sua experiência (opcional)
                                </label>
                                <textarea
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    rows={3}
                                    className="w-full mt-1 px-4 py-3 rounded-xl text-sm focus:outline-none resize-none"
                                    style={inputStyle}
                                />
                            </div>

                            <button
                                onClick={handleSubmit}
                                disabled={submitting}
                                className="w-full py-3.5 rounded-xl font-black uppercase text-sm tracking-wider transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-60 flex items-center justify-center gap-2"
                                style={{ background: GRADIENT, color: '#fff' }}
                            >
                                {submitting ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                                Enviar candidatura
                            </button>
                        </div>
                    )}
                </section>
            </main>
        </div>
    )
}
