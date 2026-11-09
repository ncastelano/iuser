// app/(main)/StoreDeliverySettings.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { toast } from '@/lib/toast'
import { Truck, ChevronDown, ChevronUp, Check, AlertTriangle, Bike, Store, MessageCircle } from 'lucide-react'
import { usePersistedExpanded } from '@/hooks/usePersistedExpanded'
import { hexToRgb } from '@/lib/color'
import { useInsideShell } from '@/components/InsideShell'
import V3Section, { V3_GRADIENT } from './V3Section'
import { loadPlatformTariffs } from '@/lib/platformTariffs'
import { PLATFORM_DEFAULT_PRICING_BY_VEHICLE } from '@/lib/driverPricing'

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

interface StoreDeliverySettingsProps {
    storeId: string
    onRefresh?: () => void
}

export default function StoreDeliverySettings({ storeId, onRefresh }: StoreDeliverySettingsProps) {
    const { colors } = useTheme()
    const v3 = useInsideShell()
    const surfaceRgb = hexToRgb(colors.surface)

    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [isExpanded, setIsExpanded] = usePersistedExpanded('storeDeliverySettings', true)

    const [acceptsDelivery, setAcceptsDelivery] = useState(true)
    const [acceptsPickup, setAcceptsPickup] = useState(true)
    const [iuserDelivery, setIuserDelivery] = useState(false)
    const [whatsappOrders, setWhatsappOrders] = useState(true)
    const [hasStoreLocation, setHasStoreLocation] = useState(true)
    // Tarifa iUser de moto (+ extra de objeto): é o valor da entrega quando quem leva é o entregador do iUser
    const [iuserTariff, setIuserTariff] = useState<{ dist: number; base: number; perKm: number } | null>(null)
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
            .select('accepts_delivery, accepts_pickup, iuser_delivery_enabled, whatsapp_orders_enabled, delivery_type, delivery_fee, delivery_base_distance, delivery_base_fee, delivery_fee_per_km, address, store_lat, store_lng')
            .eq('id', storeId)
            .single()

        if (error) {
            console.error('[StoreDeliverySettings] Erro ao carregar configurações:', error.message, error.code)
            setLoading(false)
            return
        }

        if (store) {
            setAcceptsDelivery(store.accepts_delivery ?? true)
            setAcceptsPickup(store.accepts_pickup ?? true)
            setIuserDelivery(!!store.iuser_delivery_enabled)
            setWhatsappOrders(store.whatsapp_orders_enabled ?? true)
            setHasStoreLocation(!!store.address && store.store_lat != null && store.store_lng != null)

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

    useEffect(() => {
        loadPlatformTariffs(supabase, true).then(() => {
            const m = PLATFORM_DEFAULT_PRICING_BY_VEHICLE.moto
            setIuserTariff({ dist: m.baseDistanceKm, base: m.baseFee + m.extraFees.objeto, perKm: m.pricePerKmAfterBase })
        })
    }, [])

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
                iuser_delivery_enabled: acceptsDelivery && iuserDelivery,
                whatsapp_orders_enabled: whatsappOrders,
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
        window.dispatchEvent(new Event('store-delivery-saved'))   // o cartão "Entregadores favoritos" aparece/some conforme o Entregador do iUser
        if (onRefresh) onRefresh()
    }

    // 3.0: quem faz a entrega — uma escolha só (por baixo continua nas duas colunas do banco)
    const deliveryWho: 'none' | 'own' | 'iuser' = !acceptsDelivery ? 'none' : iuserDelivery ? 'iuser' : 'own'
    const chooseWho = (who: 'none' | 'own' | 'iuser') => {
        setAcceptsDelivery(who !== 'none')
        setIuserDelivery(who === 'iuser')
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

    // ===== peças da tela =====
    const cardStyle = { background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`, border: `1px solid ${colors.border}` }
    const inputStyle = { background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.2)`, borderColor: colors.border, color: colors.textPrimary }
    const Switch = ({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) => (
        <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={onClick} className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${on ? 'bg-orange-500' : 'bg-gray-400'}`}>
            <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${on ? 'right-1' : 'left-1'}`} />
        </button>
    )
    /** uma linha de "como funciona", com o visto na cor da opção */
    const Passo = ({ cor, children }: { cor: string; children: React.ReactNode }) => (
        <li className="flex items-start gap-2 text-[12px] leading-snug" style={{ color: colors.textPrimary }}>
            <Check size={14} className="flex-shrink-0 mt-0.5" style={{ color: cor }} strokeWidth={3} />
            <span>{children}</span>
        </li>
    )
    const Aviso = ({ children }: { children: React.ReactNode }) => (
        <p className="flex items-start gap-2 text-[11px] font-bold leading-snug rounded-xl px-3 py-2" style={{ background: '#f59e0b1f', color: '#b45309' }}>
            <AlertTriangle size={14} className="flex-shrink-0 mt-px" />
            <span>{children}</span>
        </p>
    )
    const modes = [
        { id: 'free' as const, label: 'Grátis' },
        { id: 'fixed' as const, label: 'Valor fixo' },
        { id: 'distance' as const, label: 'Por distância' },
    ]
    const opcoes = [
        { id: 'iuser' as const, title: 'Entregador do iUser', text: 'Um entregador do iUser leva o pedido até o cliente.', color: '#f97316', Icon: Truck },
        { id: 'own' as const, title: 'Eu entrego', text: 'Você mesmo (ou sua equipe) leva e cobra o valor que quiser.', color: '#16a34a', Icon: Bike },
        { id: 'none' as const, title: 'Não faço entrega', text: 'O cliente só pode retirar na loja.', color: '#6b7280', Icon: Store },
    ]
    const semNada = deliveryWho === 'none' && !acceptsPickup

    const body = (
        <>
            <div className="flex flex-col gap-4">
                {/* ===== 1. ENTREGA: quem leva o pedido ===== */}
                <section className="flex flex-col gap-2">
                    <div className="px-1">
                        <h4 className="text-sm font-black" style={{ color: colors.textPrimary }}>Como o cliente recebe em casa?</h4>
                        <p className="text-[11px]" style={{ color: colors.textSecondary }}>Escolha quem leva o pedido até a casa do cliente.</p>
                    </div>
                    {opcoes.map((o) => {
                        const on = deliveryWho === o.id
                        return (
                            <div key={o.id} className="rounded-2xl overflow-hidden transition" style={{ background: on ? `${o.color}10` : cardStyle.background, border: `${on ? 1.5 : 1}px solid ${on ? o.color : colors.border}` }}>
                                <button type="button" onClick={() => chooseWho(o.id)} aria-pressed={on} className="w-full text-left px-3.5 py-3 flex items-center gap-3 active:scale-[0.995] transition">
                                    <span className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center" style={{ background: on ? o.color : `${colors.border}60`, color: on ? '#fff' : colors.textSecondary }}>
                                        <o.Icon size={17} />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-sm font-black" style={{ color: on ? o.color : colors.textPrimary }}>{o.title}</span>
                                        <span className="block text-[11px] leading-snug" style={{ color: colors.textSecondary }}>{o.text}</span>
                                    </span>
                                    <span className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center" style={{ border: `2px solid ${on ? o.color : colors.border}` }}>
                                        {on && <span className="w-2.5 h-2.5 rounded-full" style={{ background: o.color }} />}
                                    </span>
                                </button>

                                {/* o que é só desta opção fica DENTRO dela, logo abaixo */}
                                {on && o.id === 'iuser' && (
                                    <div className="px-3.5 pb-3.5 pt-3 flex flex-col gap-3" style={{ borderTop: `1px solid ${o.color}30` }}>
                                        <div className="flex flex-col gap-1.5">
                                            <p className="text-[11px] font-black uppercase tracking-wide" style={{ color: o.color }}>Como funciona</p>
                                            <ul className="flex flex-col gap-1.5">
                                                <Passo cor={o.color}>Quando o cliente escolhe receber em casa, o iUser <b>já começa a procurar um entregador</b>. Você não precisa chamar ninguém.</Passo>
                                                <Passo cor={o.color}>O pedido <b>só chega para você depois que um entregador aceitar</b>: você nunca fica com pedido pronto e ninguém para levar.</Passo>
                                                <Passo cor={o.color}>Se ninguém aceitar, o cliente pode trocar para retirar na loja ou cancelar.</Passo>
                                            </ul>
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <p className="text-[11px] font-black uppercase tracking-wide" style={{ color: o.color }}>Quanto o cliente paga</p>
                                            <p className="text-sm font-black" style={{ color: colors.textPrimary }}>
                                                {iuserTariff ? `R$ ${iuserTariff.base.toFixed(2).replace('.', ',')} até ${iuserTariff.dist} km, depois + R$ ${iuserTariff.perKm.toFixed(2).replace('.', ',')} por km` : 'A tarifa do iUser'}
                                            </p>
                                            <p className="text-[11px]" style={{ color: colors.textSecondary }}>O valor é o da tarifa do iUser e vai inteiro para o entregador.</p>
                                        </div>
                                        <p className="text-[11px]" style={{ color: colors.textSecondary }}>
                                            Quer escolher seus próprios entregadores? Use o cartão <b>Entregadores favoritos</b>: eles veem suas entregas primeiro.
                                        </p>
                                        {!hasStoreLocation && <Aviso>Falta o endereço da loja em &quot;Informações da loja&quot;: é de lá que o entregador busca o pedido.</Aviso>}
                                    </div>
                                )}

                                {on && o.id === 'own' && (
                                    <div className="px-3.5 pb-3.5 pt-3 flex flex-col gap-3" style={{ borderTop: `1px solid ${o.color}30` }}>
                                        <p className="text-[11px] font-black uppercase tracking-wide" style={{ color: o.color }}>Quanto você cobra pela entrega</p>
                                        <div className="flex gap-2 flex-wrap">
                                            {modes.map((m) => {
                                                const sel = deliveryMode === m.id
                                                return (
                                                    <button key={m.id} type="button" onClick={() => setDeliveryMode(m.id)} className="px-4 py-2 rounded-full text-xs font-bold transition-all border"
                                                        style={sel ? { background: GRADIENT, color: '#fff', borderColor: 'transparent' } : { ...inputStyle, color: colors.textSecondary }}>
                                                        {m.label}
                                                    </button>
                                                )
                                            })}
                                        </div>
                                        {deliveryMode === 'free' && <p className="text-[11px]" style={{ color: colors.textSecondary }}>O cliente não paga nada pela entrega: o custo é seu.</p>}
                                        {deliveryMode === 'fixed' && (
                                            <label className="flex flex-col gap-1">
                                                <span className="text-[11px] font-bold" style={{ color: colors.textSecondary }}>Valor da entrega (R$)</span>
                                                <input type="number" inputMode="decimal" value={fixedDeliveryFee} onChange={(e) => setFixedDeliveryFee(e.target.value)} placeholder="Ex.: 6" className="w-full p-3 rounded-full border text-sm" style={inputStyle} />
                                                <span className="text-[11px]" style={{ color: colors.textSecondary }}>O mesmo valor para qualquer endereço.</span>
                                            </label>
                                        )}
                                        {deliveryMode === 'distance' && (
                                            <div className="flex flex-col gap-2">
                                                <div className="grid grid-cols-3 gap-2 items-end">
                                                    {[
                                                        { l: 'Até quantos km', v: deliveryBaseDistance, set: setDeliveryBaseDistance, ph: '5' },
                                                        { l: 'Valor até lá (R$)', v: deliveryBaseFee, set: setDeliveryBaseFee, ph: '7' },
                                                        { l: 'Cada km a mais (R$)', v: deliveryExtraPerKm, set: setDeliveryExtraPerKm, ph: '2' },
                                                    ].map((f) => (
                                                        <label key={f.l} className="flex flex-col gap-1 justify-end">
                                                            <span className="text-[10px] font-bold leading-tight min-h-[24px] flex items-end" style={{ color: colors.textSecondary }}>{f.l}</span>
                                                            <input type="number" inputMode="decimal" value={f.v} onChange={(e) => f.set(e.target.value)} placeholder={f.ph} className="w-full p-2.5 rounded-full border text-sm" style={inputStyle} />
                                                        </label>
                                                    ))}
                                                </div>
                                                <p className="text-[11px]" style={{ color: colors.textSecondary }}>
                                                    Exemplo: até {deliveryBaseDistance || '5'} km o cliente paga R$ {deliveryBaseFee || '7'}; depois disso, mais R$ {deliveryExtraPerKm || '2'} a cada km.
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {on && o.id === 'none' && (
                                    <div className="px-3.5 pb-3.5 pt-3" style={{ borderTop: `1px solid ${o.color}30` }}>
                                        <p className="text-[11px]" style={{ color: colors.textSecondary }}>Quem comprar vai buscar o pedido na loja. Você pode voltar a fazer entrega quando quiser.</p>
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </section>

                {/* ===== 2. RETIRADA ===== */}
                <section className="rounded-2xl p-3.5 flex flex-col gap-2" style={cardStyle}>
                    <div className="flex items-center gap-3">
                        <span className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center" style={{ background: acceptsPickup ? '#f97316' : `${colors.border}60`, color: acceptsPickup ? '#fff' : colors.textSecondary }}><Store size={17} /></span>
                        <span className="min-w-0 flex-1">
                            <span className="block text-sm font-black" style={{ color: colors.textPrimary }}>Retirada na loja</span>
                            <span className="block text-[11px] leading-snug" style={{ color: colors.textSecondary }}>
                                {acceptsPickup ? 'O cliente busca o pedido na loja. Você recebe na hora, sem esperar entregador.' : 'Ninguém consegue retirar na loja.'}
                            </span>
                        </span>
                        <Switch on={acceptsPickup} onClick={() => setAcceptsPickup(!acceptsPickup)} label="Retirada na loja" />
                    </div>
                    {semNada && <Aviso>Sem entrega e sem retirada, ninguém consegue comprar de você. Ligue pelo menos uma das duas.</Aviso>}
                </section>

                {/* ===== 3. WHATSAPP ===== */}
                <section className="rounded-2xl p-3.5 flex flex-col gap-2" style={cardStyle}>
                    <div className="flex items-center gap-3">
                        <span className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center" style={{ background: whatsappOrders ? '#22c55e' : `${colors.border}60`, color: whatsappOrders ? '#fff' : colors.textSecondary }}><MessageCircle size={17} /></span>
                        <span className="min-w-0 flex-1">
                            <span className="block text-sm font-black" style={{ color: colors.textPrimary }}>Aviso pelo WhatsApp</span>
                            <span className="block text-[11px] leading-snug" style={{ color: colors.textSecondary }}>
                                {whatsappOrders
                                    ? 'Depois de pedir, o cliente também é levado ao WhatsApp da loja. O pedido aparece aqui no iUser de qualquer jeito.'
                                    : 'Os pedidos chegam só pelo iUser. O cliente não é levado ao WhatsApp.'}
                            </span>
                        </span>
                        <Switch on={whatsappOrders} onClick={() => setWhatsappOrders(!whatsappOrders)} label="Aviso pelo WhatsApp" />
                    </div>
                    {whatsappOrders && deliveryWho === 'iuser' && (
                        <p className="text-[11px]" style={{ color: colors.textSecondary }}>Nos pedidos com entregador do iUser o WhatsApp não abre: a loja só recebe o pedido depois que um entregador aceitar.</p>
                    )}
                </section>
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
    )

    // 3.0: o mesmo cartão de seção das outras partes do painel
    if (v3) {
        return (
            <V3Section
                title="Configurações de entrega"
                subtitle={<>{deliveryWho === 'iuser' ? 'Entregador do iUser' : deliveryWho === 'own' ? 'Eu entrego' : 'Sem entrega'} · {acceptsPickup ? 'Retirada ativa' : 'Retirada desativada'}{deliveryWho === 'own' && <span style={{ color: '#f97316', fontWeight: 700 }}> · {getDeliverySummary()}</span>}</>}
                expanded={isExpanded}
                onToggle={() => setIsExpanded(!isExpanded)}
                className="mb-0"
            >
                {body}
            </V3Section>
        )
    }

    return (
        <div
            className={`rounded-2xl relative flex flex-col ${isExpanded ? 'p-6 gap-5' : 'p-4'}`}
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
                    padding: isExpanded ? '0.5rem 0.75rem' : 0,
                    borderRadius: '9999px',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                }}
            >
                <div className="flex items-center gap-3">
                    <div>
                        <h3 className={`${isExpanded ? 'text-lg' : 'text-sm'} font-black`} style={{ color: colors.textPrimary }}>
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
                        <ChevronUp size={isExpanded ? 22 : 18} style={{ color: colors.textSecondary }} />
                    ) : (
                        <ChevronDown size={isExpanded ? 22 : 18} style={{ color: colors.textSecondary }} />
                    )}
                </div>
            </button>

            {isExpanded && (
                body
            )}
        </div>
    )
}