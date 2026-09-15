// app/(main)/painel-motorista/page.tsx
'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { useProfile } from '@/app/contexts/ProfileContext'
import { useTheme } from '@/app/contexts/theme'
import Header from '@/components/Header'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import LoginAndRegister from '@/components/LoginAndRegister/LoginAndRegister'
import { toast } from 'sonner'
import { TrendingUp, Car, Camera, Star, MessageSquare, Clock, CheckCircle2 } from 'lucide-react'
import { Spinner } from '@/components/Spinner'
import { computeSuggestedPrice, PLATFORM_DEFAULT_PRICING, PLATFORM_DEFAULT_EXTRA_FEES, PLATFORM_DEFAULT_CONDITION_EXTRA_FEES, PricingMode } from '@/lib/driverPricing'
import { createSquareImage } from '@/lib/image'
import { DRIVER_SERVICE_OPTIONS } from '@/lib/driverServices'
import { getAvatarUrl } from '@/lib/avatar'
import { shortAddress } from '@/lib/serviceBoard'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function PainelMotoristaContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const nextUrl = searchParams.get('next')
    const { userId, avatarUrl, bgMode, customBgUrl, profileSlug, loading: profileLoading } = useProfile()
    const { colors } = useTheme()

    const [loading, setLoading] = useState(true)
    const [showLogin, setShowLogin] = useState(false)
    const [saving, setSaving] = useState(false)

    const [pricingMode, setPricingMode] = useState<PricingMode>('platform')
    const [baseDistanceKm, setBaseDistanceKm] = useState('5')
    const [baseFee, setBaseFee] = useState('7')
    const [pricePerKmAfterBase, setPricePerKmAfterBase] = useState('2')
    const [extraFeePessoa, setExtraFeePessoa] = useState(String(PLATFORM_DEFAULT_EXTRA_FEES.pessoa))
    const [extraFeeAnimal, setExtraFeeAnimal] = useState(String(PLATFORM_DEFAULT_EXTRA_FEES.animal))
    const [extraFeeObjeto, setExtraFeeObjeto] = useState(String(PLATFORM_DEFAULT_EXTRA_FEES.objeto))
    const [extraFeeCondominio, setExtraFeeCondominio] = useState(String(PLATFORM_DEFAULT_CONDITION_EXTRA_FEES.condominio))
    const [extraFeeCompras, setExtraFeeCompras] = useState(String(PLATFORM_DEFAULT_CONDITION_EXTRA_FEES.compras))
    const [extraFeeNecessidadeEspecial, setExtraFeeNecessidadeEspecial] = useState(String(PLATFORM_DEFAULT_CONDITION_EXTRA_FEES.necessidade_especial))
    const [extraFeePetSemCaixa, setExtraFeePetSemCaixa] = useState(String(PLATFORM_DEFAULT_CONDITION_EXTRA_FEES.pet_sem_caixa))
    const [extraFeeEntregaInterna, setExtraFeeEntregaInterna] = useState(String(PLATFORM_DEFAULT_CONDITION_EXTRA_FEES.entrega_interna))
    const [extraFeeArCondicionado, setExtraFeeArCondicionado] = useState(String(PLATFORM_DEFAULT_CONDITION_EXTRA_FEES.ar_condicionado))

    // ===== MODO MOTORISTA (liga/desliga) =====
    const [driverModeActive, setDriverModeActive] = useState(false)
    const [togglingMode, setTogglingMode] = useState(false)

    // ===== MEU CARRO =====
    const [carModel, setCarModel] = useState('')
    const [carColor, setCarColor] = useState('')
    const [carPlate, setCarPlate] = useState('')
    const [carPhotoFile, setCarPhotoFile] = useState<File | null>(null)
    const [carPhotoPreview, setCarPhotoPreview] = useState<string | null>(null)
    const [carPhotoPath, setCarPhotoPath] = useState<string | null>(null)
    const [services, setServices] = useState<string[]>([])
    const [passengerCapacity, setPassengerCapacity] = useState('')
    const [hasBabySeat, setHasBabySeat] = useState<boolean | null>(null)
    const [trunkBagsPequena, setTrunkBagsPequena] = useState('')
    const [trunkBagsMedia, setTrunkBagsMedia] = useState('')
    const [trunkBagsGrande, setTrunkBagsGrande] = useState('')
    const [trunkSuitcasesPequena, setTrunkSuitcasesPequena] = useState('')
    const [trunkSuitcasesMedia, setTrunkSuitcasesMedia] = useState('')
    const [trunkSuitcasesGrande, setTrunkSuitcasesGrande] = useState('')
    const [savingVehicle, setSavingVehicle] = useState(false)
    const [isFirstVehicleSetup, setIsFirstVehicleSetup] = useState(false)
    const [showFirstVehicleDialog, setShowFirstVehicleDialog] = useState(false)

    // ===== AVALIAÇÕES E HISTÓRICO =====
    const [reviews, setReviews] = useState<{ rating: number; comment: string | null; created_at: string; reviewerName: string | null; reviewerAvatarUrl: string | undefined }[]>([])
    const [rideHistory, setRideHistory] = useState<{ id: string; origin_address: string; destination_address: string; created_at: string; distance_km: number | null }[]>([])

    useEffect(() => {
        if (!carPhotoFile) return
        const url = URL.createObjectURL(carPhotoFile)
        setCarPhotoPreview(url)
        return () => URL.revokeObjectURL(url)
    }, [carPhotoFile])

    const toggleService = (id: string) => {
        setServices((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]))
    }

    const load = async () => {
        setLoading(true)
        if (!userId) {
            setShowLogin(true)
            setLoading(false)
            return
        }
        setShowLogin(false)

        const { data } = await supabase
            .from('driver_pricing')
            .select('pricing_mode, base_distance_km, base_fee, price_per_km_after_base, extra_fee_pessoa, extra_fee_animal, extra_fee_objeto, extra_fee_condominio, extra_fee_compras, extra_fee_necessidade_especial, extra_fee_pet_sem_caixa, extra_fee_entrega_interna, extra_fee_ar_condicionado, driver_mode_active')
            .eq('driver_id', userId)
            .maybeSingle()

        if (data) {
            setPricingMode(data.pricing_mode)
            if (data.base_distance_km != null) setBaseDistanceKm(String(data.base_distance_km))
            if (data.base_fee != null) setBaseFee(String(data.base_fee))
            if (data.price_per_km_after_base != null) setPricePerKmAfterBase(String(data.price_per_km_after_base))
            if (data.extra_fee_pessoa != null) setExtraFeePessoa(String(data.extra_fee_pessoa))
            if (data.extra_fee_animal != null) setExtraFeeAnimal(String(data.extra_fee_animal))
            if (data.extra_fee_objeto != null) setExtraFeeObjeto(String(data.extra_fee_objeto))
            if (data.extra_fee_condominio != null) setExtraFeeCondominio(String(data.extra_fee_condominio))
            if (data.extra_fee_compras != null) setExtraFeeCompras(String(data.extra_fee_compras))
            if (data.extra_fee_necessidade_especial != null) setExtraFeeNecessidadeEspecial(String(data.extra_fee_necessidade_especial))
            if (data.extra_fee_pet_sem_caixa != null) setExtraFeePetSemCaixa(String(data.extra_fee_pet_sem_caixa))
            if (data.extra_fee_entrega_interna != null) setExtraFeeEntregaInterna(String(data.extra_fee_entrega_interna))
            if (data.extra_fee_ar_condicionado != null) setExtraFeeArCondicionado(String(data.extra_fee_ar_condicionado))
            setDriverModeActive(!!data.driver_mode_active)
        }

        const { data: vehicle } = await supabase
            .from('driver_vehicles')
            .select('car_model, car_color, car_plate, car_photo_url, services, passenger_capacity, has_baby_seat, trunk_bags_pequena, trunk_bags_media, trunk_bags_grande, trunk_suitcases_pequena, trunk_suitcases_media, trunk_suitcases_grande')
            .eq('driver_id', userId)
            .maybeSingle()

        if (vehicle) {
            setCarModel(vehicle.car_model || '')
            setCarColor(vehicle.car_color || '')
            setCarPlate(vehicle.car_plate || '')
            setCarPhotoPath(vehicle.car_photo_url || null)
            setServices(vehicle.services || [])
            setPassengerCapacity(vehicle.passenger_capacity != null ? String(vehicle.passenger_capacity) : '')
            setHasBabySeat(vehicle.has_baby_seat)
            setTrunkBagsPequena(vehicle.trunk_bags_pequena != null ? String(vehicle.trunk_bags_pequena) : '')
            setTrunkBagsMedia(vehicle.trunk_bags_media != null ? String(vehicle.trunk_bags_media) : '')
            setTrunkBagsGrande(vehicle.trunk_bags_grande != null ? String(vehicle.trunk_bags_grande) : '')
            setTrunkSuitcasesPequena(vehicle.trunk_suitcases_pequena != null ? String(vehicle.trunk_suitcases_pequena) : '')
            setTrunkSuitcasesMedia(vehicle.trunk_suitcases_media != null ? String(vehicle.trunk_suitcases_media) : '')
            setTrunkSuitcasesGrande(vehicle.trunk_suitcases_grande != null ? String(vehicle.trunk_suitcases_grande) : '')
        }
        setIsFirstVehicleSetup(!vehicle)

        const { data: reviewRows } = await supabase
            .from('ride_reviews')
            .select('rating, comment, created_at, reviewer_id')
            .eq('reviewee_id', userId)
            .order('created_at', { ascending: false })
            .limit(20)

        const reviewerIds = Array.from(new Set((reviewRows || []).map((r) => r.reviewer_id)))
        let reviewersById = new Map<string, { name: string | null; avatar_url: string | null }>()
        if (reviewerIds.length > 0) {
            const { data: reviewers } = await supabase.from('profiles').select('id, name, avatar_url').in('id', reviewerIds)
            reviewersById = new Map((reviewers || []).map((p) => [p.id, p]))
        }
        setReviews((reviewRows || []).map((r) => ({
            rating: r.rating,
            comment: r.comment,
            created_at: r.created_at,
            reviewerName: reviewersById.get(r.reviewer_id)?.name || null,
            reviewerAvatarUrl: getAvatarUrl(supabase, reviewersById.get(r.reviewer_id)?.avatar_url),
        })))

        const { data: historyRows } = await supabase
            .from('ride_requests')
            .select('id, origin_address, destination_address, created_at, distance_km')
            .eq('driver_id', userId)
            .eq('status', 'completed')
            .order('created_at', { ascending: false })
            .limit(20)
        setRideHistory(historyRows || [])

        setLoading(false)
    }

    const handleSaveVehicle = async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            setShowLogin(true)
            return
        }

        setSavingVehicle(true)
        try {
            let photoPath = carPhotoPath
            if (carPhotoFile) {
                const fileExt = carPhotoFile.name.split('.').pop()
                const fileName = `${user.id}/${Date.now()}.${fileExt}`
                const { data, error: uploadError } = await supabase.storage.from('driver-car-photos').upload(fileName, carPhotoFile)
                if (uploadError) throw uploadError
                photoPath = data?.path || null
            }

            const { error } = await supabase.from('driver_vehicles').upsert(
                {
                    driver_id: user.id,
                    car_model: carModel.trim() || null,
                    car_color: carColor.trim() || null,
                    car_plate: carPlate.trim() || null,
                    car_photo_url: photoPath,
                    services,
                    passenger_capacity: passengerCapacity.trim() ? parseInt(passengerCapacity, 10) || null : null,
                    has_baby_seat: hasBabySeat,
                    trunk_bags_pequena: trunkBagsPequena.trim() ? parseInt(trunkBagsPequena, 10) || null : null,
                    trunk_bags_media: trunkBagsMedia.trim() ? parseInt(trunkBagsMedia, 10) || null : null,
                    trunk_bags_grande: trunkBagsGrande.trim() ? parseInt(trunkBagsGrande, 10) || null : null,
                    trunk_suitcases_pequena: trunkSuitcasesPequena.trim() ? parseInt(trunkSuitcasesPequena, 10) || null : null,
                    trunk_suitcases_media: trunkSuitcasesMedia.trim() ? parseInt(trunkSuitcasesMedia, 10) || null : null,
                    trunk_suitcases_grande: trunkSuitcasesGrande.trim() ? parseInt(trunkSuitcasesGrande, 10) || null : null,
                },
                { onConflict: 'driver_id' }
            )
            if (error) throw error

            setCarPhotoPath(photoPath)
            setCarPhotoFile(null)
            toast.success('As informações do seu carro foram salvas!')

            if (isFirstVehicleSetup) {
                setIsFirstVehicleSetup(false)
                setShowFirstVehicleDialog(true)
            }
        } catch (err: any) {
            toast.error('Erro ao salvar o carro: ' + (err.message || 'tente novamente'))
        } finally {
            setSavingVehicle(false)
        }
    }

    const carPhotoUrl = carPhotoPreview || (carPhotoPath ? supabase.storage.from('driver-car-photos').getPublicUrl(carPhotoPath).data.publicUrl : null)
    const reviewsAvg = reviews.length > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : null

    useEffect(() => {
        if (profileLoading) return
        load()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [profileLoading, userId])

    const handleLoginSuccess = () => {
        setShowLogin(false)
        load()
    }

    // Campos de tarifa compartilhados pelos dois upserts em driver_pricing
    // (salvar tarifa e ligar/desligar modo motorista, que precisa reenviar
    // a tarifa atual pra não zerar ela no upsert).
    const buildPricingFields = (driverId: string) => ({
        driver_id: driverId,
        pricing_mode: pricingMode,
        base_distance_km: pricingMode === 'custom' ? (parseFloat(baseDistanceKm) || 0) : null,
        base_fee: pricingMode === 'custom' ? (parseFloat(baseFee) || 0) : null,
        price_per_km_after_base: pricingMode === 'custom' ? (parseFloat(pricePerKmAfterBase) || 0) : null,
        extra_fee_pessoa: pricingMode === 'custom' ? (parseFloat(extraFeePessoa) || 0) : null,
        extra_fee_animal: pricingMode === 'custom' ? (parseFloat(extraFeeAnimal) || 0) : null,
        extra_fee_objeto: pricingMode === 'custom' ? (parseFloat(extraFeeObjeto) || 0) : null,
        extra_fee_condominio: pricingMode === 'custom' ? (parseFloat(extraFeeCondominio) || 0) : null,
        extra_fee_compras: pricingMode === 'custom' ? (parseFloat(extraFeeCompras) || 0) : null,
        extra_fee_necessidade_especial: pricingMode === 'custom' ? (parseFloat(extraFeeNecessidadeEspecial) || 0) : null,
        extra_fee_pet_sem_caixa: pricingMode === 'custom' ? (parseFloat(extraFeePetSemCaixa) || 0) : null,
        extra_fee_entrega_interna: pricingMode === 'custom' ? (parseFloat(extraFeeEntregaInterna) || 0) : null,
        extra_fee_ar_condicionado: pricingMode === 'custom' ? (parseFloat(extraFeeArCondicionado) || 0) : null,
    })

    const handleSave = async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            setShowLogin(true)
            return
        }

        setSaving(true)
        try {
            const { error } = await supabase.from('driver_pricing').upsert(
                buildPricingFields(user.id),
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

    const handleToggleDriverMode = async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            setShowLogin(true)
            return
        }

        setTogglingMode(true)
        const next = !driverModeActive
        try {
            const { error } = await supabase.from('driver_pricing').upsert(
                { ...buildPricingFields(user.id), driver_mode_active: next },
                { onConflict: 'driver_id' }
            )
            if (error) throw error

            setDriverModeActive(next)
            toast.success(next ? 'Modo motorista ativado!' : 'Modo motorista desativado.')
        } catch (err: any) {
            toast.error('Erro ao atualizar modo motorista: ' + (err.message || 'tente novamente'))
        } finally {
            setTogglingMode(false)
        }
    }

    const previewDistance = 10
    const activePricing = pricingMode === 'platform'
        ? PLATFORM_DEFAULT_PRICING
        : {
            baseDistanceKm: parseFloat(baseDistanceKm) || 0,
            baseFee: parseFloat(baseFee) || 0,
            pricePerKmAfterBase: parseFloat(pricePerKmAfterBase) || 0,
            extraFees: {
                pessoa: parseFloat(extraFeePessoa) || 0,
                animal: parseFloat(extraFeeAnimal) || 0,
                objeto: parseFloat(extraFeeObjeto) || 0,
            },
            conditionExtraFees: {
                condominio: parseFloat(extraFeeCondominio) || 0,
                compras: parseFloat(extraFeeCompras) || 0,
                necessidade_especial: parseFloat(extraFeeNecessidadeEspecial) || 0,
                pet_sem_caixa: parseFloat(extraFeePetSemCaixa) || 0,
                entrega_interna: parseFloat(extraFeeEntregaInterna) || 0,
                ar_condicionado: parseFloat(extraFeeArCondicionado) || 0,
            },
        }
    const previewPrice = computeSuggestedPrice(previewDistance, activePricing)

    const conditionExtraFeeFields = [
        { key: 'condominio', label: 'Condomínio', value: extraFeeCondominio, setValue: setExtraFeeCondominio, platformDefault: PLATFORM_DEFAULT_CONDITION_EXTRA_FEES.condominio },
        { key: 'compras', label: 'Compras no mercado', value: extraFeeCompras, setValue: setExtraFeeCompras, platformDefault: PLATFORM_DEFAULT_CONDITION_EXTRA_FEES.compras },
        { key: 'necessidade_especial', label: 'Necessidade especial', value: extraFeeNecessidadeEspecial, setValue: setExtraFeeNecessidadeEspecial, platformDefault: PLATFORM_DEFAULT_CONDITION_EXTRA_FEES.necessidade_especial },
        { key: 'pet_sem_caixa', label: 'Pet sem caixa de transporte', value: extraFeePetSemCaixa, setValue: setExtraFeePetSemCaixa, platformDefault: PLATFORM_DEFAULT_CONDITION_EXTRA_FEES.pet_sem_caixa },
        { key: 'entrega_interna', label: 'Entrega em área interna', value: extraFeeEntregaInterna, setValue: setExtraFeeEntregaInterna, platformDefault: PLATFORM_DEFAULT_CONDITION_EXTRA_FEES.entrega_interna },
        { key: 'ar_condicionado', label: 'Ar condicionado', value: extraFeeArCondicionado, setValue: setExtraFeeArCondicionado, platformDefault: PLATFORM_DEFAULT_CONDITION_EXTRA_FEES.ar_condicionado },
    ]

    const planButtonStyle = (active: boolean) => ({
        flex: 1,
        padding: '0.85rem 1rem',
        borderRadius: '1rem',
        fontSize: '0.8rem',
        fontWeight: 800,
        transition: 'all 0.2s',
        cursor: 'pointer',
        textAlign: 'left' as const,
        background: active ? GRADIENT : `${colors.border}20`,
        color: active ? '#ffffff' : colors.textPrimary,
        border: active ? 'none' : `1px solid ${colors.border}`,
    })

    return (
        <div className="relative min-h-dvh" style={{ background: colors.background }}>
            <div className="fixed inset-0 z-0">
                <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
            </div>

            <main className="relative z-10 min-h-dvh">
                <Header
                    title="Painel do Motorista"
                    showBack={true}
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
                            <button
                                onClick={handleToggleDriverMode}
                                disabled={togglingMode}
                                className="w-full flex items-center gap-3 p-4 rounded-2xl transition-all hover:scale-[1.01] disabled:opacity-60"
                                style={{
                                    background: driverModeActive ? '#22c55e20' : colors.surface,
                                    border: `1px solid ${driverModeActive ? '#22c55e60' : colors.border}`,
                                }}
                            >
                                <div
                                    className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                                    style={{ background: driverModeActive ? '#22c55e' : GRADIENT, color: '#ffffff' }}
                                >
                                    {togglingMode ? <Spinner size={18} color="#ffffff" /> : <Car size={24} />}
                                </div>
                                <div className="flex-1 min-w-0 text-left">
                                    <span className="text-sm font-black" style={{ color: colors.textPrimary }}>
                                        {driverModeActive ? 'Desativar modo motorista' : 'Ativar modo motorista'}
                                    </span>
                                    <p className="text-xs mt-0.5" style={{ color: colors.textSecondary }}>
                                        {driverModeActive
                                            ? 'Ativado — você vê as corridas em tempo real e aparece no mapa do passageiro assim que se candidatar a um pedido'
                                            : 'Ative pra ver as corridas disponíveis em tempo real e poder se candidatar aos pedidos'}
                                    </p>
                                </div>
                                <div
                                    className="flex-shrink-0 w-11 h-6 rounded-full relative transition-all"
                                    style={{ background: driverModeActive ? '#22c55e' : colors.border }}
                                >
                                    <div
                                        className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all"
                                        style={{ left: driverModeActive ? 20 : 2 }}
                                    />
                                </div>
                            </button>

                            <div className="flex items-center gap-3">
                                <div
                                    className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                                    style={{ background: GRADIENT, color: '#ffffff' }}
                                >
                                    <Car size={24} />
                                </div>
                                <div>
                                    <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>
                                        Escolha seu plano de tarifa
                                    </h3>
                                    <p className="text-xs" style={{ color: colors.textSecondary }}>
                                        Usada para calcular o preço sugerido em cada corrida disponível
                                    </p>
                                </div>
                            </div>

                            <div className="flex gap-2">
                                <button onClick={() => setPricingMode('platform')} style={planButtonStyle(pricingMode === 'platform')}>
                                    Tarifa da plataforma
                                    <div className="text-[10px] font-normal mt-0.5 opacity-80">Valor padrão, sem configurar nada</div>
                                </button>
                                <button onClick={() => setPricingMode('custom')} style={planButtonStyle(pricingMode === 'custom')}>
                                    Minha tarifa
                                    <div className="text-[10px] font-normal mt-0.5 opacity-80">Você define seus próprios valores</div>
                                </button>
                            </div>

                            {pricingMode === 'platform' ? (
                                <div
                                    className="p-4 rounded-2xl border"
                                    style={{ background: colors.surface, borderColor: colors.border }}
                                >
                                    <div className="flex items-center gap-2 mb-3">
                                        <TrendingUp size={16} style={{ color: '#f97316' }} />
                                        <p className="text-[10px] font-black" style={{ color: '#f97316' }}>
                                            Tarifa padrão da plataforma
                                        </p>
                                    </div>
                                    <p className="text-xs" style={{ color: colors.textPrimary }}>
                                        Até {PLATFORM_DEFAULT_PRICING.baseDistanceKm} km = R$ {PLATFORM_DEFAULT_PRICING.baseFee.toFixed(2)}, acima + R$ {PLATFORM_DEFAULT_PRICING.pricePerKmAfterBase.toFixed(2)}/km
                                    </p>
                                    <p className="text-[10px] mt-3 font-bold" style={{ color: colors.textPrimary }}>
                                        Exemplo: uma corrida de {previewDistance} km sairia por R$ {previewPrice.toFixed(2)}
                                    </p>
                                </div>
                            ) : (
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
                            )}

                            <div
                                className="p-4 rounded-2xl border"
                                style={{ background: colors.surface, borderColor: colors.border }}
                            >
                                <div className="flex items-center gap-2 mb-1">
                                    <TrendingUp size={16} style={{ color: '#f97316' }} />
                                    <p className="text-[10px] font-black" style={{ color: '#f97316' }}>
                                        Valor extra por tipo de corrida
                                    </p>
                                </div>
                                <p className="text-[10px] mb-3" style={{ color: colors.textSecondary }}>
                                    Somado à tarifa base, conforme o tipo do pedido
                                </p>
                                {pricingMode === 'platform' ? (
                                    <div className="grid grid-cols-3 gap-2 text-center">
                                        <div>
                                            <p className="text-[9px] font-bold" style={{ color: colors.textSecondary }}>Pessoa</p>
                                            <p className="text-xs font-black" style={{ color: colors.textPrimary }}>+ R$ {PLATFORM_DEFAULT_EXTRA_FEES.pessoa.toFixed(2)}</p>
                                        </div>
                                        <div>
                                            <p className="text-[9px] font-bold" style={{ color: colors.textSecondary }}>Animal</p>
                                            <p className="text-xs font-black" style={{ color: colors.textPrimary }}>+ R$ {PLATFORM_DEFAULT_EXTRA_FEES.animal.toFixed(2)}</p>
                                        </div>
                                        <div>
                                            <p className="text-[9px] font-bold" style={{ color: colors.textSecondary }}>Objeto</p>
                                            <p className="text-xs font-black" style={{ color: colors.textPrimary }}>+ R$ {PLATFORM_DEFAULT_EXTRA_FEES.objeto.toFixed(2)}</p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-3 gap-2">
                                        <div>
                                            <label className="text-[9px] font-bold block mb-1" style={{ color: colors.textSecondary }}>Pessoa (R$)</label>
                                            <input
                                                type="number"
                                                value={extraFeePessoa}
                                                onChange={(e) => setExtraFeePessoa(e.target.value)}
                                                placeholder="0"
                                                className="w-full p-2 rounded-full border text-sm"
                                                style={{ background: colors.background, borderColor: colors.border, color: colors.textPrimary }}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[9px] font-bold block mb-1" style={{ color: colors.textSecondary }}>Animal (R$)</label>
                                            <input
                                                type="number"
                                                value={extraFeeAnimal}
                                                onChange={(e) => setExtraFeeAnimal(e.target.value)}
                                                placeholder="5"
                                                className="w-full p-2 rounded-full border text-sm"
                                                style={{ background: colors.background, borderColor: colors.border, color: colors.textPrimary }}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[9px] font-bold block mb-1" style={{ color: colors.textSecondary }}>Objeto (R$)</label>
                                            <input
                                                type="number"
                                                value={extraFeeObjeto}
                                                onChange={(e) => setExtraFeeObjeto(e.target.value)}
                                                placeholder="3"
                                                className="w-full p-2 rounded-full border text-sm"
                                                style={{ background: colors.background, borderColor: colors.border, color: colors.textPrimary }}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div
                                className="p-4 rounded-2xl border"
                                style={{ background: colors.surface, borderColor: colors.border }}
                            >
                                <div className="flex items-center gap-2 mb-1">
                                    <TrendingUp size={16} style={{ color: '#f97316' }} />
                                    <p className="text-[10px] font-black" style={{ color: '#f97316' }}>
                                        Valor extra por condição da corrida
                                    </p>
                                </div>
                                <p className="text-[10px] mb-3" style={{ color: colors.textSecondary }}>
                                    Somado à tarifa base, conforme o que o pedido precisar (condomínio conta em dobro se for na origem e no destino)
                                </p>
                                {pricingMode === 'platform' ? (
                                    <div className="grid grid-cols-2 gap-3 text-center">
                                        {conditionExtraFeeFields.map((field) => (
                                            <div key={field.key}>
                                                <p className="text-[9px] font-bold" style={{ color: colors.textSecondary }}>{field.label}</p>
                                                <p className="text-xs font-black" style={{ color: colors.textPrimary }}>+ R$ {field.platformDefault.toFixed(2)}</p>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-2 gap-2">
                                        {conditionExtraFeeFields.map((field) => (
                                            <div key={field.key}>
                                                <label className="text-[9px] font-bold block mb-1" style={{ color: colors.textSecondary }}>{field.label} (R$)</label>
                                                <input
                                                    type="number"
                                                    value={field.value}
                                                    onChange={(e) => field.setValue(e.target.value)}
                                                    placeholder={String(field.platformDefault)}
                                                    className="w-full p-2 rounded-full border text-sm"
                                                    style={{ background: colors.background, borderColor: colors.border, color: colors.textPrimary }}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="w-full py-3.5 rounded-full text-sm font-black uppercase tracking-wider transition-all disabled:opacity-70 flex items-center justify-center gap-2"
                                style={{ background: GRADIENT, color: '#ffffff' }}
                            >
                                {saving ? <Spinner size={16} /> : 'Salvar tarifa'}
                            </button>

                            {/* ===== MEU CARRO ===== */}
                            <div className="flex items-center gap-3 mt-2">
                                <div
                                    className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                                    style={{ background: GRADIENT, color: '#ffffff' }}
                                >
                                    <Car size={24} />
                                </div>
                                <div>
                                    <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>Meu carro</h3>
                                    <p className="text-xs" style={{ color: colors.textSecondary }}>
                                        Aparece pros passageiros escolherem entre os candidatos
                                    </p>
                                </div>
                            </div>

                            <div className="p-4 rounded-2xl border flex flex-col gap-3" style={{ background: colors.surface, borderColor: colors.border }}>
                                <div className="flex items-center gap-3">
                                    <div
                                        onClick={() => document.getElementById('car-photo-input')?.click()}
                                        className="w-20 h-20 rounded-xl flex items-center justify-center cursor-pointer overflow-hidden flex-shrink-0"
                                        style={{ background: `${colors.border}30`, border: `1px dashed ${colors.border}` }}
                                    >
                                        {carPhotoUrl ? (
                                            <img src={carPhotoUrl} className="w-full h-full object-cover" alt="" />
                                        ) : (
                                            <Camera size={22} style={{ color: colors.textSecondary }} />
                                        )}
                                    </div>
                                    <input
                                        id="car-photo-input"
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={async (e) => {
                                            const file = e.target.files?.[0]
                                            if (!file) return
                                            try {
                                                setCarPhotoFile(await createSquareImage(file, 500))
                                            } catch {
                                                toast.error('Erro ao processar imagem')
                                            }
                                        }}
                                    />
                                    <div className="flex-1 grid grid-cols-2 gap-2">
                                        <input
                                            type="text"
                                            value={carModel}
                                            onChange={(e) => setCarModel(e.target.value)}
                                            placeholder="Modelo (ex: Onix)"
                                            className="w-full p-2 rounded-full border text-xs"
                                            style={{ background: colors.background, borderColor: colors.border, color: colors.textPrimary }}
                                        />
                                        <input
                                            type="text"
                                            value={carColor}
                                            onChange={(e) => setCarColor(e.target.value)}
                                            placeholder="Cor (ex: Prata)"
                                            className="w-full p-2 rounded-full border text-xs"
                                            style={{ background: colors.background, borderColor: colors.border, color: colors.textPrimary }}
                                        />
                                        <input
                                            type="text"
                                            value={carPlate}
                                            onChange={(e) => setCarPlate(e.target.value.toUpperCase())}
                                            placeholder="Placa"
                                            className="col-span-2 w-full p-2 rounded-full border text-xs"
                                            style={{ background: colors.background, borderColor: colors.border, color: colors.textPrimary }}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <p className="text-[10px] font-black mb-2" style={{ color: colors.textSecondary }}>Capacidade do carro</p>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="text-[9px] font-bold block mb-1" style={{ color: colors.textSecondary }}>Quantos passageiros cabem?</label>
                                            <input
                                                type="number"
                                                min={1}
                                                value={passengerCapacity}
                                                onChange={(e) => setPassengerCapacity(e.target.value)}
                                                placeholder="4"
                                                className="w-full p-2 rounded-full border text-sm"
                                                style={{ background: colors.background, borderColor: colors.border, color: colors.textPrimary }}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[9px] font-bold block mb-1" style={{ color: colors.textSecondary }}>Tem banco para bebê?</label>
                                            <div className="flex items-center gap-1.5">
                                                <button
                                                    onClick={() => setHasBabySeat(true)}
                                                    className="flex-1 py-2 rounded-full text-[11px] font-black transition-all"
                                                    style={hasBabySeat === true ? { background: GRADIENT, color: '#fff' } : { background: `${colors.border}30`, color: colors.textSecondary, border: `1px solid ${colors.border}` }}
                                                >
                                                    SIM
                                                </button>
                                                <button
                                                    onClick={() => setHasBabySeat(false)}
                                                    className="flex-1 py-2 rounded-full text-[11px] font-black transition-all"
                                                    style={hasBabySeat === false ? { background: GRADIENT, color: '#fff' } : { background: `${colors.border}30`, color: colors.textSecondary, border: `1px solid ${colors.border}` }}
                                                >
                                                    NÃO
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    <p className="text-[9px] font-bold mt-3 mb-1.5" style={{ color: colors.textSecondary }}>
                                        Sacolas de compras que cabem no porta-malas
                                    </p>
                                    <div className="grid grid-cols-3 gap-2">
                                        <div>
                                            <label className="text-[9px] font-bold block mb-1" style={{ color: colors.textSecondary }}>Pequena</label>
                                            <input
                                                type="number"
                                                min={0}
                                                value={trunkBagsPequena}
                                                onChange={(e) => setTrunkBagsPequena(e.target.value)}
                                                placeholder="0"
                                                className="w-full p-2 rounded-full border text-sm"
                                                style={{ background: colors.background, borderColor: colors.border, color: colors.textPrimary }}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[9px] font-bold block mb-1" style={{ color: colors.textSecondary }}>Média</label>
                                            <input
                                                type="number"
                                                min={0}
                                                value={trunkBagsMedia}
                                                onChange={(e) => setTrunkBagsMedia(e.target.value)}
                                                placeholder="0"
                                                className="w-full p-2 rounded-full border text-sm"
                                                style={{ background: colors.background, borderColor: colors.border, color: colors.textPrimary }}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[9px] font-bold block mb-1" style={{ color: colors.textSecondary }}>Grande</label>
                                            <input
                                                type="number"
                                                min={0}
                                                value={trunkBagsGrande}
                                                onChange={(e) => setTrunkBagsGrande(e.target.value)}
                                                placeholder="0"
                                                className="w-full p-2 rounded-full border text-sm"
                                                style={{ background: colors.background, borderColor: colors.border, color: colors.textPrimary }}
                                            />
                                        </div>
                                    </div>

                                    <p className="text-[9px] font-bold mt-3 mb-1.5" style={{ color: colors.textSecondary }}>
                                        Malas de viagem que cabem no porta-malas
                                    </p>
                                    <div className="grid grid-cols-3 gap-2">
                                        <div>
                                            <label className="text-[9px] font-bold block" style={{ color: colors.textSecondary }}>Pequena</label>
                                            <span className="text-[8px] block mb-1" style={{ color: colors.textSecondary, opacity: 0.7 }}>até 55cm</span>
                                            <input
                                                type="number"
                                                min={0}
                                                value={trunkSuitcasesPequena}
                                                onChange={(e) => setTrunkSuitcasesPequena(e.target.value)}
                                                placeholder="0"
                                                className="w-full p-2 rounded-full border text-sm"
                                                style={{ background: colors.background, borderColor: colors.border, color: colors.textPrimary }}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[9px] font-bold block" style={{ color: colors.textSecondary }}>Média</label>
                                            <span className="text-[8px] block mb-1" style={{ color: colors.textSecondary, opacity: 0.7 }}>até 65cm</span>
                                            <input
                                                type="number"
                                                min={0}
                                                value={trunkSuitcasesMedia}
                                                onChange={(e) => setTrunkSuitcasesMedia(e.target.value)}
                                                placeholder="0"
                                                className="w-full p-2 rounded-full border text-sm"
                                                style={{ background: colors.background, borderColor: colors.border, color: colors.textPrimary }}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[9px] font-bold block" style={{ color: colors.textSecondary }}>Grande</label>
                                            <span className="text-[8px] block mb-1" style={{ color: colors.textSecondary, opacity: 0.7 }}>até 75cm</span>
                                            <input
                                                type="number"
                                                min={0}
                                                value={trunkSuitcasesGrande}
                                                onChange={(e) => setTrunkSuitcasesGrande(e.target.value)}
                                                placeholder="0"
                                                className="w-full p-2 rounded-full border text-sm"
                                                style={{ background: colors.background, borderColor: colors.border, color: colors.textPrimary }}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <p className="text-[10px] font-black mb-2" style={{ color: colors.textSecondary }}>Serviços oferecidos</p>
                                    <div className="grid grid-cols-2 gap-2">
                                        {DRIVER_SERVICE_OPTIONS.map((opt) => {
                                            const Icon = opt.icon
                                            const active = services.includes(opt.id)
                                            return (
                                                <button
                                                    key={opt.id}
                                                    onClick={() => toggleService(opt.id)}
                                                    className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all"
                                                    style={
                                                        active
                                                            ? { background: GRADIENT, color: '#fff' }
                                                            : { background: `${colors.border}30`, color: colors.textSecondary, border: `1px solid ${colors.border}` }
                                                    }
                                                >
                                                    <Icon size={15} />
                                                    {opt.label}
                                                </button>
                                            )
                                        })}
                                    </div>
                                </div>

                                <button
                                    onClick={handleSaveVehicle}
                                    disabled={savingVehicle}
                                    className="w-full py-3 rounded-full text-sm font-black uppercase tracking-wider transition-all disabled:opacity-70 flex items-center justify-center gap-2"
                                    style={{ background: GRADIENT, color: '#ffffff' }}
                                >
                                    {savingVehicle ? <Spinner size={16} /> : 'Salvar carro'}
                                </button>
                            </div>

                            {/* ===== AVALIAÇÕES RECEBIDAS ===== */}
                            <div className="flex items-center gap-3 mt-2">
                                <div
                                    className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                                    style={{ background: GRADIENT, color: '#ffffff' }}
                                >
                                    <Star size={22} />
                                </div>
                                <div>
                                    <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>
                                        Avaliações recebidas {reviewsAvg != null && `· ${reviewsAvg.toFixed(1)} ★`}
                                    </h3>
                                    <p className="text-xs" style={{ color: colors.textSecondary }}>
                                        {reviews.length === 0 ? 'Ainda sem avaliações' : `${reviews.length} avaliação${reviews.length > 1 ? 'ões' : ''} de passageiros`}
                                    </p>
                                </div>
                            </div>

                            {reviews.length > 0 && (
                                <div className="flex flex-col gap-2">
                                    {reviews.map((r, i) => (
                                        <div key={i} className="p-3 rounded-xl flex items-start gap-2.5" style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}` }}>
                                            {r.reviewerAvatarUrl ? (
                                                <img src={r.reviewerAvatarUrl} className="w-8 h-8 rounded-full object-cover flex-shrink-0" alt="" />
                                            ) : (
                                                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: GRADIENT, color: '#fff' }}>
                                                    <MessageSquare size={13} />
                                                </div>
                                            )}
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-xs font-bold truncate" style={{ color: colors.textPrimary }}>
                                                        {r.reviewerName || 'Passageiro'}
                                                    </span>
                                                    <span className="text-[11px] font-black flex-shrink-0" style={{ color: '#f97316' }}>
                                                        {'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}
                                                    </span>
                                                </div>
                                                {r.comment && (
                                                    <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>{r.comment}</p>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* ===== HISTÓRICO DE CORRIDAS ===== */}
                            <div className="flex items-center gap-3 mt-2">
                                <div
                                    className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                                    style={{ background: GRADIENT, color: '#ffffff' }}
                                >
                                    <Clock size={22} />
                                </div>
                                <div>
                                    <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>Histórico de corridas</h3>
                                    <p className="text-xs" style={{ color: colors.textSecondary }}>
                                        {rideHistory.length === 0 ? 'Nenhuma corrida concluída ainda' : `${rideHistory.length} corrida${rideHistory.length > 1 ? 's' : ''} concluída${rideHistory.length > 1 ? 's' : ''}`}
                                    </p>
                                </div>
                            </div>

                            {rideHistory.length > 0 && (
                                <div className="flex flex-col gap-2">
                                    {rideHistory.map((h) => (
                                        <div key={h.id} className="p-3 rounded-xl" style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}` }}>
                                            <p className="text-xs font-bold" style={{ color: colors.textPrimary }}>
                                                {shortAddress(h.origin_address)} → {shortAddress(h.destination_address)}
                                            </p>
                                            <p className="text-[10px] mt-0.5" style={{ color: colors.textSecondary }}>
                                                {formatDate(h.created_at)}{h.distance_km != null ? ` · ${h.distance_km.toFixed(1)} km` : ''}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </section>
            </main>

            {showFirstVehicleDialog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
                    <div
                        className="w-full max-w-sm rounded-2xl p-8 flex flex-col items-center gap-3 text-center"
                        style={{ background: colors.surface, boxShadow: colors.shadow }}
                    >
                        <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: GRADIENT, color: '#fff' }}>
                            <CheckCircle2 size={32} />
                        </div>
                        <h2 className="text-lg font-black" style={{ color: colors.textPrimary }}>Carro cadastrado!</h2>
                        <p className="text-sm" style={{ color: colors.textSecondary }}>
                            Ative o modo motorista aqui em cima pra aparecer disponível, e vá pra tela de corridas — lá você vê os pedidos em tempo real e pode se candidatar.
                        </p>
                        <button
                            onClick={() => { setShowFirstVehicleDialog(false); router.push('/aceitar-corridas') }}
                            className="mt-2 w-full py-3 rounded-full font-bold text-sm flex items-center justify-center gap-2"
                            style={{ background: GRADIENT, color: '#fff' }}
                        >
                            <Car size={18} />
                            Ir para corridas disponíveis
                        </button>
                        <button
                            onClick={() => setShowFirstVehicleDialog(false)}
                            className="w-full py-2.5 rounded-full font-bold text-sm"
                            style={{ color: colors.textSecondary }}
                        >
                            Continuar aqui
                        </button>
                    </div>
                </div>
            )}
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
