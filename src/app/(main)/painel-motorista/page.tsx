// app/(main)/painel-motorista/page.tsx
'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { useProfile } from '@/app/contexts/ProfileContext'
import { useTheme } from '@/app/theme'
import Header from '@/app/Header'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import LoginAndRegister from '../LoginAndRegister'
import { toast } from 'sonner'
import { TrendingUp, Car } from 'lucide-react'
import { Spinner } from '@/components/Spinner'
import { computeSuggestedPrice } from '@/lib/driverPricing'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

function PainelMotoristaContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const nextUrl = searchParams.get('next')
    const { avatarUrl, bgMode, customBgUrl, profileSlug, loading: profileLoading } = useProfile()
    const { colors } = useTheme()

    const [loading, setLoading] = useState(true)
    const [showLogin, setShowLogin] = useState(false)
    const [saving, setSaving] = useState(false)

    const [baseDistanceKm, setBaseDistanceKm] = useState('5')
    const [baseFee, setBaseFee] = useState('7')
    const [pricePerKmAfterBase, setPricePerKmAfterBase] = useState('2')

    const load = async () => {
        setLoading(true)
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            setShowLogin(true)
            setLoading(false)
            return
        }
        setShowLogin(false)

        const { data } = await supabase
            .from('driver_pricing')
            .select('base_distance_km, base_fee, price_per_km_after_base')
            .eq('driver_id', user.id)
            .maybeSingle()

        if (data) {
            setBaseDistanceKm(String(data.base_distance_km))
            setBaseFee(String(data.base_fee))
            setPricePerKmAfterBase(String(data.price_per_km_after_base))
        }

        setLoading(false)
    }

    useEffect(() => {
        load()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const handleLoginSuccess = () => {
        setShowLogin(false)
        load()
    }

    const handleSave = async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            setShowLogin(true)
            return
        }

        setSaving(true)
        try {
            const { error } = await supabase.from('driver_pricing').upsert(
                {
                    driver_id: user.id,
                    base_distance_km: parseFloat(baseDistanceKm) || 0,
                    base_fee: parseFloat(baseFee) || 0,
                    price_per_km_after_base: parseFloat(pricePerKmAfterBase) || 0,
                },
                { onConflict: 'driver_id' }
            )
            if (error) throw error

            toast.success('Sua tarifa foi salva!')
            if (nextUrl) {
                router.push(nextUrl)
            }
        } catch (err: any) {
            toast.error('Erro ao salvar tarifa: ' + (err.message || 'tente novamente'))
        } finally {
            setSaving(false)
        }
    }

    const previewDistance = 10
    const previewPrice = computeSuggestedPrice(previewDistance, {
        baseDistanceKm: parseFloat(baseDistanceKm) || 0,
        baseFee: parseFloat(baseFee) || 0,
        pricePerKmAfterBase: parseFloat(pricePerKmAfterBase) || 0,
    })

    return (
        <div className="relative min-h-dvh" style={{ background: colors.background }}>
            <div className="fixed inset-0 z-0">
                <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
            </div>

            <main className="relative z-10 min-h-dvh">
                <Header
                    title="Minha tarifa de motorista"
                    showBack={true}
                    onBack={() => router.push('/procurar-servico')}
                    greeting={`Olá, ${profileLoading ? '...' : profileSlug ? `@${profileSlug}` : 'Visitante'}`}
                    avatarUrl={avatarUrl}
                    loading={profileLoading}
                />

                <section className="px-4 md:px-6 mt-4 pb-24 max-w-lg mx-auto">
                    {loading && (
                        <div className="flex justify-center py-10">
                            <Spinner size={24} color={colors.textSecondary} />
                        </div>
                    )}

                    {!loading && showLogin && (
                        <LoginAndRegister onLoginSuccess={handleLoginSuccess} />
                    )}

                    {!loading && !showLogin && (
                        <div className="flex flex-col gap-5">
                            <div className="flex items-center gap-3">
                                <div
                                    className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                                    style={{ background: GRADIENT, color: '#ffffff' }}
                                >
                                    <Car size={24} />
                                </div>
                                <div>
                                    <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>
                                        Sua tarifa por km
                                    </h3>
                                    <p className="text-xs" style={{ color: colors.textSecondary }}>
                                        Usada para calcular o preço sugerido em cada corrida disponível
                                    </p>
                                </div>
                            </div>

                            <div
                                className="p-4 rounded-2xl border"
                                style={{ background: colors.surface, borderColor: colors.border }}
                            >
                                <div className="flex items-center gap-2 mb-3">
                                    <TrendingUp size={16} style={{ color: '#f97316' }} />
                                    <p className="text-[10px] font-black" style={{ color: '#f97316' }}>
                                        Tarifa com valor base
                                    </p>
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                    <div>
                                        <label className="text-[9px] font-bold block mb-1" style={{ color: colors.textSecondary }}>
                                            Distância base (km)
                                        </label>
                                        <input
                                            type="number"
                                            value={baseDistanceKm}
                                            onChange={(e) => setBaseDistanceKm(e.target.value)}
                                            placeholder="5"
                                            className="w-full p-2 rounded-full border text-sm"
                                            style={{ background: colors.background, borderColor: colors.border, color: colors.textPrimary }}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[9px] font-bold block mb-1" style={{ color: colors.textSecondary }}>
                                            Valor base (R$)
                                        </label>
                                        <input
                                            type="number"
                                            value={baseFee}
                                            onChange={(e) => setBaseFee(e.target.value)}
                                            placeholder="7"
                                            className="w-full p-2 rounded-full border text-sm"
                                            style={{ background: colors.background, borderColor: colors.border, color: colors.textPrimary }}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[9px] font-bold block mb-1" style={{ color: colors.textSecondary }}>
                                            Extra por km (R$)
                                        </label>
                                        <input
                                            type="number"
                                            value={pricePerKmAfterBase}
                                            onChange={(e) => setPricePerKmAfterBase(e.target.value)}
                                            placeholder="2"
                                            className="w-full p-2 rounded-full border text-sm"
                                            style={{ background: colors.background, borderColor: colors.border, color: colors.textPrimary }}
                                        />
                                    </div>
                                </div>
                                <p className="text-[9px] mt-2" style={{ color: colors.textSecondary }}>
                                    Ex: até {baseDistanceKm || '0'} km = R$ {(parseFloat(baseFee) || 0).toFixed(2)}, acima + R$ {(parseFloat(pricePerKmAfterBase) || 0).toFixed(2)}/km
                                </p>
                                <p className="text-[10px] mt-3 font-bold" style={{ color: colors.textPrimary }}>
                                    Exemplo: uma corrida de {previewDistance} km sairia por R$ {previewPrice.toFixed(2)}
                                </p>
                            </div>

                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="w-full py-3.5 rounded-full text-sm font-black uppercase tracking-wider transition-all disabled:opacity-70 flex items-center justify-center gap-2"
                                style={{ background: GRADIENT, color: '#ffffff' }}
                            >
                                {saving ? <Spinner size={16} /> : 'Salvar tarifa'}
                            </button>
                        </div>
                    )}
                </section>
            </main>
        </div>
    )
}

export default function PainelMotoristaPage() {
    return (
        <Suspense fallback={null}>
            <PainelMotoristaContent />
        </Suspense>
    )
}
