// app/(main)/StoreDeliverySettings.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/theme'
import { toast } from 'sonner'
import { Truck, ChevronDown, ChevronUp, TrendingUp } from 'lucide-react'

// ===== GRADIENTE FIXO LARANJA-VERMELHO =====
const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

// ===== STYLE PARA BOTÕES PILL =====
const pillButtonStyle = {
    padding: '0.75rem 1.25rem',
    borderRadius: '9999px',
    fontWeight: 700,
    fontSize: '0.875rem',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
    border: 'none',
}

function hexToRgb(hex: string) {
    const clean = hex.replace('#', '')
    const bigint = parseInt(clean, 16)
    return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 }
}

interface StoreDeliverySettingsProps {
    storeId: string
    onRefresh?: () => void
}

export default function StoreDeliverySettings({ storeId, onRefresh }: StoreDeliverySettingsProps) {
    const { colors } = useTheme()
    const surfaceRgb = hexToRgb(colors.surface)

    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [isExpanded, setIsExpanded] = useState(false)

    const [acceptsDelivery, setAcceptsDelivery] = useState(true)
    const [acceptsPickup, setAcceptsPickup] = useState(true)
    const [deliveryMode, setDeliveryMode] = useState<'free' | 'fixed' | 'distance'>('fixed')
    const [fixedDeliveryFee, setFixedDeliveryFee] = useState('')
    const [deliveryBaseDistance, setDeliveryBaseDistance] = useState('5')
    const [deliveryBaseFee, setDeliveryBaseFee] = useState('7')
    const [deliveryExtraPerKm, setDeliveryExtraPerKm] = useState('2')

    const loadConfig = useCallback(async () => {
        if (!storeId) return
        setLoading(true)

        const { data: store, error } = await supabase
            .from('stores')
            .select('accepts_delivery, accepts_pickup, delivery_type, delivery_fee, delivery_base_distance, delivery_base_fee, delivery_fee_per_km')
            .eq('id', storeId)
            .single()

        if (error) {
            console.error('[StoreDeliverySettings] Erro ao carregar configurações:', error)
            setLoading(false)
            return
        }

        if (store) {
            setAcceptsDelivery(store.accepts_delivery ?? true)
            setAcceptsPickup(store.accepts_pickup ?? true)

            if (store.delivery_type === 'free') {
                setDeliveryMode('free')
            } else if (store.delivery_type === 'fixed') {
                setDeliveryMode('fixed')
                setFixedDeliveryFee(store.delivery_fee ? String(store.delivery_fee) : '')
            } else if (store.delivery_type === 'distance') {
                setDeliveryMode('distance')
                setDeliveryBaseDistance(store.delivery_base_distance != null ? String(store.delivery_base_distance) : '5')
                setDeliveryBaseFee(store.delivery_base_fee != null ? String(store.delivery_base_fee) : '7')
                setDeliveryExtraPerKm(store.delivery_fee_per_km != null ? String(store.delivery_fee_per_km) : '2')
            } else {
                setDeliveryMode('fixed')
                setFixedDeliveryFee('')
            }
        }

        setLoading(false)
    }, [storeId])

    useEffect(() => {
        loadConfig()
    }, [loadConfig])

    const saveConfig = async () => {
        if (!storeId) return
        setSaving(true)

        let deliveryType = 'none'
        let savedDeliveryFee: number | null = null
        let savedFeePerKm: number | null = null
        let savedBaseDistance: number | null = null
        let savedBaseFee: number | null = null

        if (acceptsDelivery) {
            if (deliveryMode === 'free') {
                deliveryType = 'free'
                savedDeliveryFee = 0
            } else if (deliveryMode === 'fixed') {
                deliveryType = 'fixed'
                savedDeliveryFee = fixedDeliveryFee ? parseFloat(fixedDeliveryFee) : 0
            } else if (deliveryMode === 'distance') {
                deliveryType = 'distance'
                savedBaseDistance = deliveryBaseDistance ? parseFloat(deliveryBaseDistance) : 0
                savedBaseFee = deliveryBaseFee ? parseFloat(deliveryBaseFee) : 0
                savedFeePerKm = deliveryExtraPerKm ? parseFloat(deliveryExtraPerKm) : 0
            }
        }

        const { error } = await supabase
            .from('stores')
            .update({
                accepts_delivery: acceptsDelivery,
                accepts_pickup: acceptsPickup,
                delivery_type: deliveryType,
                delivery_fee: savedDeliveryFee,
                delivery_fee_per_km: savedFeePerKm,
                delivery_base_distance: savedBaseDistance,
                delivery_base_fee: savedBaseFee,
            })
            .eq('id', storeId)

        if (error) {
            toast.error('Erro ao salvar configurações: ' + error.message)
            setSaving(false)
            return
        }

        toast.success('Configurações de entrega salvas!')
        setSaving(false)
        if (onRefresh) onRefresh()
    }

    const cancelEditing = () => {
        loadConfig()
    }

    // Função para obter o texto de resumo da configuração atual
    const getDeliverySummary = () => {
        if (!acceptsDelivery) return 'Entrega desativada'

        if (deliveryMode === 'free') {
            return 'Entrega grátis'
        } else if (deliveryMode === 'fixed') {
            const fee = parseFloat(fixedDeliveryFee) || 0
            return `Entrega: R$ ${fee.toFixed(2)} fixo`
        } else if (deliveryMode === 'distance') {
            const baseDist = parseFloat(deliveryBaseDistance) || 0
            const baseFee = parseFloat(deliveryBaseFee) || 0
            const extra = parseFloat(deliveryExtraPerKm) || 0
            return `Até ${baseDist}km: R$ ${baseFee.toFixed(2)} | +R$ ${extra.toFixed(2)}/km`
        }
        return 'Configuração não definida'
    }

    if (loading) {
        return (
            <div
                className="rounded-2xl p-6 animate-pulse"
                style={{
                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    border: `1px solid ${colors.border}`,
                    boxShadow: colors.shadow,
                }}
            >
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-full bg-gray-200" />
                    <div className="h-6 w-32 bg-gray-200 rounded" />
                </div>
                <div className="space-y-4">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="h-12 bg-gray-200 rounded-xl" />
                    ))}
                </div>
            </div>
        )
    }

    return (
        <div
            className="rounded-2xl p-6 flex flex-col gap-5 relative"
            style={{
                background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                border: `1px solid ${colors.border}`,
                boxShadow: colors.shadow,
            }}
        >
            {/* Cabeçalho com toggle - PILL */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-between text-left"
                style={{
                    padding: '0.5rem 0.75rem',
                    borderRadius: '9999px',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                }}
            >
                <div className="flex items-center gap-3">
                    <div
                        className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{
                            background: GRADIENT,
                            color: '#ffffff',
                        }}
                    >
                        <Truck size={24} />
                    </div>
                    <div>
                        <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>
                            Configurações de Entrega
                        </h3>
                        <div className="flex flex-col gap-0.5 mt-0.5">
                            <div className="flex items-center gap-2 text-xs" style={{ color: colors.textSecondary }}>
                                <span>{acceptsDelivery ? 'Entrega ativa' : 'Entrega desativada'}</span>
                                <span>•</span>
                                <span>{acceptsPickup ? 'Retirada ativa' : 'Retirada desativada'}</span>
                            </div>
                            {acceptsDelivery && (
                                <div className="text-[10px] font-medium" style={{ color: '#f97316' }}>
                                    {getDeliverySummary()}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {isExpanded ? (
                        <ChevronUp size={22} style={{ color: colors.textSecondary }} />
                    ) : (
                        <ChevronDown size={22} style={{ color: colors.textSecondary }} />
                    )}
                </div>
            </button>

            {isExpanded && (
                <>
                    <div className="space-y-4">
                        {/* Toggle Faz entrega */}
                        <div
                            className="flex items-center justify-between p-3 rounded-full"
                            style={{
                                background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                border: `1px solid ${colors.border}`,
                            }}
                        >
                            <div className="flex items-center gap-2">
                                <Truck size={16} style={{ color: colors.textSecondary }} />
                                <span className="text-xs font-bold" style={{ color: colors.textPrimary }}>Faz entrega</span>
                            </div>
                            <button
                                onClick={() => setAcceptsDelivery(!acceptsDelivery)}
                                className={`relative w-11 h-6 rounded-full transition-colors ${acceptsDelivery ? 'bg-orange-500' : 'bg-gray-400'}`}
                            >
                                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${acceptsDelivery ? 'right-1' : 'left-1'}`} />
                            </button>
                        </div>

                        {acceptsDelivery && (
                            <div className="ml-3 space-y-3">
                                <p className="text-[10px] font-bold" style={{ color: colors.textSecondary }}>Tipo de entrega</p>
                                <div className="flex gap-2 flex-wrap">
                                    <button
                                        onClick={() => setDeliveryMode('free')}
                                        className={`px-4 py-2 rounded-full text-xs font-bold transition-all ${deliveryMode === 'free'
                                            ? 'text-white'
                                            : 'border'
                                            }`}
                                        style={
                                            deliveryMode === 'free'
                                                ? { background: GRADIENT, color: '#ffffff' }
                                                : {
                                                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.2)`,
                                                    borderColor: colors.border,
                                                    color: colors.textSecondary
                                                }
                                        }
                                    >
                                        Grátis
                                    </button>
                                    <button
                                        onClick={() => setDeliveryMode('fixed')}
                                        className={`px-4 py-2 rounded-full text-xs font-bold transition-all ${deliveryMode === 'fixed'
                                            ? 'text-white'
                                            : 'border'
                                            }`}
                                        style={
                                            deliveryMode === 'fixed'
                                                ? { background: GRADIENT, color: '#ffffff' }
                                                : {
                                                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.2)`,
                                                    borderColor: colors.border,
                                                    color: colors.textSecondary
                                                }
                                        }
                                    >
                                        Valor Fixo
                                    </button>
                                    <button
                                        onClick={() => setDeliveryMode('distance')}
                                        className={`px-4 py-2 rounded-full text-xs font-bold transition-all ${deliveryMode === 'distance'
                                            ? 'text-white'
                                            : 'border'
                                            }`}
                                        style={
                                            deliveryMode === 'distance'
                                                ? { background: GRADIENT, color: '#ffffff' }
                                                : {
                                                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.2)`,
                                                    borderColor: colors.border,
                                                    color: colors.textSecondary
                                                }
                                        }
                                    >
                                        Por Distância
                                    </button>
                                </div>

                                {deliveryMode === 'fixed' && (
                                    <input
                                        type="number"
                                        value={fixedDeliveryFee}
                                        onChange={(e) => setFixedDeliveryFee(e.target.value)}
                                        placeholder="Valor da entrega (R$)"
                                        className="w-full p-3 rounded-full border text-sm"
                                        style={{
                                            background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.2)`,
                                            borderColor: colors.border,
                                            color: colors.textPrimary,
                                        }}
                                    />
                                )}

                                {deliveryMode === 'distance' && (
                                    <div
                                        className="p-4 rounded-2xl border"
                                        style={{
                                            background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.2)`,
                                            borderColor: colors.border,
                                        }}
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
                                                    value={deliveryBaseDistance}
                                                    onChange={(e) => setDeliveryBaseDistance(e.target.value)}
                                                    placeholder="5"
                                                    className="w-full p-2 rounded-full border text-sm"
                                                    style={{
                                                        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.2)`,
                                                        borderColor: colors.border,
                                                        color: colors.textPrimary,
                                                    }}
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[9px] font-bold block mb-1" style={{ color: colors.textSecondary }}>
                                                    Valor base (R$)
                                                </label>
                                                <input
                                                    type="number"
                                                    value={deliveryBaseFee}
                                                    onChange={(e) => setDeliveryBaseFee(e.target.value)}
                                                    placeholder="7"
                                                    className="w-full p-2 rounded-full border text-sm"
                                                    style={{
                                                        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.2)`,
                                                        borderColor: colors.border,
                                                        color: colors.textPrimary,
                                                    }}
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[9px] font-bold block mb-1" style={{ color: colors.textSecondary }}>
                                                    Extra por km (R$)
                                                </label>
                                                <input
                                                    type="number"
                                                    value={deliveryExtraPerKm}
                                                    onChange={(e) => setDeliveryExtraPerKm(e.target.value)}
                                                    placeholder="2"
                                                    className="w-full p-2 rounded-full border text-sm"
                                                    style={{
                                                        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.2)`,
                                                        borderColor: colors.border,
                                                        color: colors.textPrimary,
                                                    }}
                                                />
                                            </div>
                                        </div>
                                        <p className="text-[9px] mt-2" style={{ color: colors.textSecondary }}>
                                            Ex: até {deliveryBaseDistance || '5'} km = R$ {deliveryBaseFee || '7'}, acima + R$ {deliveryExtraPerKm || '2'}/km
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Toggle Retirada no local */}
                        <div
                            className="flex items-center justify-between p-3 rounded-full"
                            style={{
                                background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                border: `1px solid ${colors.border}`,
                            }}
                        >
                            <span className="text-xs font-bold" style={{ color: colors.textPrimary }}>Retirada no local</span>
                            <button
                                onClick={() => setAcceptsPickup(!acceptsPickup)}
                                className={`relative w-11 h-6 rounded-full transition-colors ${acceptsPickup ? 'bg-orange-500' : 'bg-gray-400'}`}
                            >
                                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${acceptsPickup ? 'right-1' : 'left-1'}`} />
                            </button>
                        </div>
                    </div>

                    {/* Botões de ação - PILL */}
                    <div className="flex gap-3 mt-2">
                        <button
                            onClick={cancelEditing}
                            style={{
                                ...pillButtonStyle,
                                flex: 1,
                                background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.2)`,
                                border: `2px solid ${colors.border}`,
                                color: colors.textSecondary,
                            }}
                            className="hover:opacity-70 transition-opacity"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={saveConfig}
                            disabled={saving}
                            style={{
                                ...pillButtonStyle,
                                flex: 1,
                                background: GRADIENT,
                                color: '#ffffff',
                                opacity: saving ? 0.7 : 1,
                            }}
                            className="hover:opacity-80 transition-opacity"
                        >
                            {saving ? 'Salvando...' : 'Salvar'}
                        </button>
                    </div>
                </>
            )}
        </div>
    )
}