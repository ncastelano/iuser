// app/(main)/StorePaymentMethods.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { toast } from '@/lib/toast'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { usePersistedExpanded } from '@/hooks/usePersistedExpanded'
import { hexToRgb } from '@/lib/color'
import V3Section from './V3Section'
import { cardLinkProblem, fetchStorePaymentLink, saveStorePaymentLink } from '@/modules/order-payment'

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

interface StorePaymentMethodsProps {
    storeId: string
    onRefresh?: () => void
}

export default function StorePaymentMethods({ storeId, onRefresh }: StorePaymentMethodsProps) {
    const { colors } = useTheme()
    const surfaceRgb = hexToRgb(colors.surface)

    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [isExpanded, setIsExpanded] = usePersistedExpanded('storePaymentMethods', true)

    const [acceptsPix, setAcceptsPix] = useState(true)
    const [acceptsCard, setAcceptsCard] = useState(true)
    const [acceptsCash, setAcceptsCash] = useState(true)
    const [pixKey, setPixKey] = useState('')
    const [pixKeyType, setPixKeyType] = useState<'cpf' | 'email' | 'phone' | 'random'>('cpf')
    const [isPixExpanded, setIsPixExpanded] = useState(true)
    // o LINK de pagamento por cartão da conta da loja (Mercado Pago, InfinitePay...): o cliente paga antes, sem maquininha na porta (privado; só a dona edita)
    const [cardLink, setCardLink] = useState('')

    const loadConfig = useCallback(async () => {
        if (!storeId) return
        setLoading(true)

        const { data: store, error } = await supabase
            .from('my_stores')
            .select('accepts_pix, accepts_card, accepts_cash, pix_key, pix_key_type')
            .eq('id', storeId)
            .single()

        if (error) {
            console.error('[StorePaymentMethods] Erro ao carregar configurações:', error)
            setLoading(false)
            return
        }

        if (store) {
            setAcceptsPix(store.accepts_pix ?? true)
            setAcceptsCard(store.accepts_card ?? true)
            setAcceptsCash(store.accepts_cash ?? true)
            setPixKey(store.pix_key || '')
            setPixKeyType(store.pix_key_type || 'cpf')
        }
        setCardLink((await fetchStorePaymentLink(storeId)) || '')

        setLoading(false)
    }, [storeId])

    useEffect(() => {
        loadConfig()
    }, [loadConfig])

    const saveConfig = async () => {
        if (!storeId) return
        const linkErr = cardLinkProblem(cardLink)
        if (linkErr) { toast.error(linkErr); return }
        setSaving(true)

        const { error } = await supabase
            .from('stores')
            .update({
                accepts_pix: acceptsPix,
                accepts_card: acceptsCard,
                accepts_cash: acceptsCash,
                pix_key: acceptsPix ? pixKey : null,
                pix_key_type: acceptsPix ? pixKeyType : null,
            })
            .eq('id', storeId)

        if (error) {
            toast.error('Erro ao salvar configurações: ' + error.message)
            setSaving(false)
            return
        }

        try { await saveStorePaymentLink(storeId, acceptsCard ? cardLink : '') }
        catch (e: any) { toast.error(e?.message || 'Não deu para salvar o link de cartão'); setSaving(false); return }
        toast.success('Formas de pagamento salvas!')
        setSaving(false)
        if (onRefresh) onRefresh()
    }

    const cancelEditing = () => {
        loadConfig()
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

    const body = (
                <>
                    <div className="space-y-4">
                        {/* Toggle Cartão */}
                        <div
                            className="flex items-center justify-between p-3 rounded-full"
                            style={{
                                background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                border: `1px solid ${colors.border}`,
                            }}
                        >
                            <div className="flex items-center gap-2">
                                
                                <span className="text-xs font-bold" style={{ color: colors.textPrimary }}>Cartão</span>
                            </div>
                            <button
                                onClick={() => setAcceptsCard(!acceptsCard)}
                                className={`relative w-11 h-6 rounded-full transition-colors ${acceptsCard ? 'bg-orange-500' : 'bg-gray-400'}`}
                            >
                                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${acceptsCard ? 'right-1' : 'left-1'}`} />
                            </button>
                        </div>

                        {/* Toggle Dinheiro */}
                        <div
                            className="flex items-center justify-between p-3 rounded-full"
                            style={{
                                background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                border: `1px solid ${colors.border}`,
                            }}
                        >
                            <div className="flex items-center gap-2">
                                
                                <span className="text-xs font-bold" style={{ color: colors.textPrimary }}>Dinheiro</span>
                            </div>
                            <button
                                onClick={() => setAcceptsCash(!acceptsCash)}
                                className={`relative w-11 h-6 rounded-full transition-colors ${acceptsCash ? 'bg-orange-500' : 'bg-gray-400'}`}
                            >
                                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${acceptsCash ? 'right-1' : 'left-1'}`} />
                            </button>
                        </div>

                        {/* Toggle Pix com expansão */}
                        <div>
                            <div
                                className="flex items-center justify-between p-3 rounded-full"
                                style={{
                                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                    border: `1px solid ${colors.border}`,
                                }}
                            >
                                <div className="flex items-center gap-2">
                                    
                                    <span className="text-xs font-bold" style={{ color: colors.textPrimary }}>Pix</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setIsPixExpanded(!isPixExpanded)}
                                        className="p-1 rounded-full hover:bg-white/10 transition-colors"
                                    >
                                        {isPixExpanded ? (
                                            <ChevronUp size={16} style={{ color: colors.textSecondary }} />
                                        ) : (
                                            <ChevronDown size={16} style={{ color: colors.textSecondary }} />
                                        )}
                                    </button>
                                    <button
                                        onClick={() => setAcceptsPix(!acceptsPix)}
                                        className={`relative w-11 h-6 rounded-full transition-colors ${acceptsPix ? 'bg-orange-500' : 'bg-gray-400'}`}
                                    >
                                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${acceptsPix ? 'right-1' : 'left-1'}`} />
                                    </button>
                                </div>
                            </div>

                            {isPixExpanded && acceptsPix && (
                                <div className="ml-3 mt-3 space-y-3">
                                    <p className="text-[10px] font-bold" style={{ color: colors.textSecondary }}>Tipo de Chave</p>
                                    <select
                                        value={pixKeyType}
                                        onChange={(e) => setPixKeyType(e.target.value as any)}
                                        className="w-full p-3 rounded-full border text-sm"
                                        style={{
                                            background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.2)`,
                                            borderColor: colors.border,
                                            color: colors.textPrimary,
                                        }}
                                    >
                                        <option value="cpf">CPF</option>
                                        <option value="email">E-mail</option>
                                        <option value="phone">Telefone</option>
                                        <option value="random">Chave aleatória</option>
                                    </select>
                                    <input
                                        type="text"
                                        value={pixKey}
                                        onChange={(e) => setPixKey(e.target.value)}
                                        placeholder="Digite a chave"
                                        className="w-full p-3 rounded-full border text-sm"
                                        style={{
                                            background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.2)`,
                                            borderColor: colors.border,
                                            color: colors.textPrimary,
                                        }}
                                    />
                                </div>
                            )}
                        </div>
                    </div>

                    {/* cartão SEM maquininha na porta: o link de pagamento da conta da loja (o cliente paga antes, no próprio celular) */}
                    {acceptsCard && (
                        <div className="rounded-2xl p-3" style={{ background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.2)`, border: `1px solid ${colors.border}` }}>
                            <p className="text-[12px] font-black" style={{ color: colors.textPrimary }}>Link de pagamento por cartão (opcional)</p>
                            <p className="text-[11px] mt-0.5" style={{ color: colors.textSecondary }}>Cole o link da sua conta (Mercado Pago, InfinitePay, PagBank...). O cliente paga o pedido no cartão antes, pelo celular dele, e o entregador não precisa levar a sua maquininha.</p>
                            <input
                                type="url"
                                value={cardLink}
                                onChange={(e) => setCardLink(e.target.value)}
                                placeholder="https://link.mercadopago.com.br/sua-loja"
                                className="mt-2 w-full p-3 rounded-full border text-sm"
                                style={{ background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.2)`, borderColor: cardLinkProblem(cardLink) ? '#ef4444' : colors.border, color: colors.textPrimary }}
                            />
                            {cardLinkProblem(cardLink) && <p className="text-[11px] mt-1 font-bold" style={{ color: '#ef4444' }}>{cardLinkProblem(cardLink)}</p>}
                        </div>
                    )}

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
    return (
            <V3Section
                title="Formas de pagamento"
                subtitle={<>{acceptsCard ? 'Cartão' : 'Sem cartão'} · {acceptsPix ? 'Pix' : 'Sem Pix'} · {acceptsCash ? 'Dinheiro' : 'Sem dinheiro'}</>}
                expanded={isExpanded}
                onToggle={() => setIsExpanded(!isExpanded)}
                className="mb-0"
            >
                {body}
            </V3Section>
        )
}