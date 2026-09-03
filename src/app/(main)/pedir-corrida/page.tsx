// app/(main)/pedir-corrida/page.tsx
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
    User,
    Package,
    MapPin,
    Navigation,
    Loader2,
    CheckCircle2,
    Send,
} from 'lucide-react'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

type RideType = 'para-mim' | 'buscar-alguem' | 'entregar-algo'

const RIDE_TYPES: { id: RideType; label: string; icon: any; forWhomLabel: string }[] = [
    { id: 'para-mim', label: 'Corrida para mim', icon: Car, forWhomLabel: '' },
    { id: 'buscar-alguem', label: 'Buscar alguém', icon: User, forWhomLabel: 'Nome de quem vamos buscar' },
    { id: 'entregar-algo', label: 'Entregar algo', icon: Package, forWhomLabel: 'O que vamos entregar' },
]

async function reverseGeocodeAddress(lng: number, lat: number): Promise<string | null> {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    if (!token) return null
    try {
        const res = await fetch(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${token}&language=pt&types=address,place,locality`
        )
        const data = await res.json()
        return data.features?.[0]?.place_name || null
    } catch {
        return null
    }
}

export default function PedirCorridaPage() {
    const router = useRouter()
    const { avatarUrl, bgMode, customBgUrl, profileSlug, loading: profileLoading } = useProfile()
    const { colors } = useTheme()

    const [rideType, setRideType] = useState<RideType>('para-mim')
    const [origin, setOrigin] = useState('')
    const [destination, setDestination] = useState('')
    const [forWhom, setForWhom] = useState('')
    const [notes, setNotes] = useState('')
    const [locatingOrigin, setLocatingOrigin] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [submitted, setSubmitted] = useState(false)

    const selectedType = RIDE_TYPES.find((t) => t.id === rideType)!

    const useMyLocationAsOrigin = () => {
        if (!navigator.geolocation) return
        setLocatingOrigin(true)
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                const address = await reverseGeocodeAddress(pos.coords.longitude, pos.coords.latitude)
                if (address) setOrigin(address)
                else toast.error('Não conseguimos identificar seu endereço')
                setLocatingOrigin(false)
            },
            () => {
                toast.error('Não conseguimos acessar sua localização')
                setLocatingOrigin(false)
            },
            { enableHighAccuracy: true, timeout: 10000 }
        )
    }

    const handleSubmit = async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            router.push('/login')
            return
        }
        if (!origin.trim() || !destination.trim()) {
            toast.error('Preencha o endereço de origem e destino')
            return
        }

        setSubmitting(true)
        try {
            const { error } = await supabase.from('ride_requests').insert({
                requester_id: user.id,
                ride_type: rideType,
                origin_address: origin.trim(),
                destination_address: destination.trim(),
                for_whom: forWhom.trim() || null,
                notes: notes.trim() || null,
            })

            if (error) throw error
            setSubmitted(true)
        } catch (err: any) {
            toast.error('Erro ao enviar pedido: ' + (err.message || 'tente novamente'))
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
                    title="Pedir Corrida"
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
                            <h2 className="text-lg font-black" style={{ color: colors.textPrimary }}>Pedido enviado!</h2>
                            <p className="text-sm" style={{ color: colors.textSecondary }}>
                                Assim que tivermos motoristas parceiros disponíveis na sua região, vamos avisar você.
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
                            {/* Tipo de corrida */}
                            <div>
                                <label className="text-xs font-bold uppercase tracking-wide" style={{ color: colors.textSecondary }}>
                                    O que você precisa?
                                </label>
                                <div className="grid grid-cols-3 gap-2 mt-2">
                                    {RIDE_TYPES.map((type) => {
                                        const Icon = type.icon
                                        const active = rideType === type.id
                                        return (
                                            <button
                                                key={type.id}
                                                onClick={() => setRideType(type.id)}
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

                            {/* Origem */}
                            <div>
                                <label className="text-xs font-bold uppercase tracking-wide" style={{ color: colors.textSecondary }}>
                                    De onde
                                </label>
                                <div className="flex gap-2 mt-1">
                                    <input
                                        type="text"
                                        value={origin}
                                        onChange={(e) => setOrigin(e.target.value)}
                                        placeholder="Endereço de partida"
                                        className="flex-1 px-4 py-3 rounded-xl text-sm focus:outline-none"
                                        style={inputStyle}
                                    />
                                    <button
                                        onClick={useMyLocationAsOrigin}
                                        disabled={locatingOrigin}
                                        className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                                        style={{ background: `${colors.accent}20`, color: colors.accent }}
                                        title="Usar minha localização"
                                    >
                                        {locatingOrigin ? <Loader2 size={18} className="animate-spin" /> : <Navigation size={18} />}
                                    </button>
                                </div>
                            </div>

                            {/* Destino */}
                            <div>
                                <label className="text-xs font-bold uppercase tracking-wide" style={{ color: colors.textSecondary }}>
                                    Para onde
                                </label>
                                <div className="relative mt-1">
                                    <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: colors.textSecondary }} />
                                    <input
                                        type="text"
                                        value={destination}
                                        onChange={(e) => setDestination(e.target.value)}
                                        placeholder="Endereço de destino"
                                        className="w-full pl-9 pr-4 py-3 rounded-xl text-sm focus:outline-none"
                                        style={inputStyle}
                                    />
                                </div>
                            </div>

                            {/* Para quem / o que (condicional) */}
                            {selectedType.forWhomLabel && (
                                <div>
                                    <label className="text-xs font-bold uppercase tracking-wide" style={{ color: colors.textSecondary }}>
                                        {selectedType.forWhomLabel}
                                    </label>
                                    <input
                                        type="text"
                                        value={forWhom}
                                        onChange={(e) => setForWhom(e.target.value)}
                                        className="w-full mt-1 px-4 py-3 rounded-xl text-sm focus:outline-none"
                                        style={inputStyle}
                                    />
                                </div>
                            )}

                            {/* Observações */}
                            <div>
                                <label className="text-xs font-bold uppercase tracking-wide" style={{ color: colors.textSecondary }}>
                                    Observações (opcional)
                                </label>
                                <textarea
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    rows={3}
                                    placeholder="Algum detalhe importante?"
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
                                Pedir corrida
                            </button>
                        </div>
                    )}
                </section>
            </main>
        </div>
    )
}
