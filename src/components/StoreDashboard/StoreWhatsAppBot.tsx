// src/components/StoreDashboard/StoreWhatsAppBot.tsx
//
// A loja "pede" o atendimento automático por WhatsApp aqui, já informando
// o número que quer usar (whatsapp_bot_requested_number) — é só um
// interesse registrado com um status de fila (whatsapp_bot_status), o
// número de verdade só passa a responder depois que o admin conecta ele
// no painel da Meta e associa à loja (fica visível aqui assim que
// acontece).
'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { toast } from 'sonner'
import { MessageCircle, Check, Copy, Clock, Loader2, X, ShieldCheck, ArrowLeft } from 'lucide-react'
import { hexToRgb } from '@/lib/color'
import { Spinner } from '@/components/Spinner'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

type BotStatus = 'none' | 'requested' | 'queued' | 'connecting' | 'connected'

const STATUS_TEXT: Record<Exclude<BotStatus, 'none' | 'connected'>, string> = {
    requested: 'Pedido enviado — na fila pra conectarmos o número da sua loja.',
    queued: 'Na fila de conexão — já vimos seu pedido, é só aguardar.',
    connecting: 'Conectando o número da sua loja agora...',
}

interface StoreWhatsAppBotProps {
    storeId: string
}

export default function StoreWhatsAppBot({ storeId }: StoreWhatsAppBotProps) {
    const { colors } = useTheme()
    const surfaceRgb = hexToRgb(colors.surface)

    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [optIn, setOptIn] = useState(false)
    const [status, setStatus] = useState<BotStatus>('none')
    const [phoneNumberId, setPhoneNumberId] = useState<string | null>(null)
    const [displayNumber, setDisplayNumber] = useState<string | null>(null)
    const [requestedNumber, setRequestedNumber] = useState('')
    const [dialogStep, setDialogStep] = useState<'closed' | 'terms' | 'number'>('closed')
    const [feePrice, setFeePrice] = useState<number | null>(null)

    const load = useCallback(async () => {
        if (!storeId) return
        setLoading(true)
        const { data } = await supabase
            .from('stores')
            .select('whatsapp_bot_opt_in, whatsapp_bot_phone_number_id, whatsapp_bot_display_number, whatsapp_bot_requested_number, whatsapp_bot_status')
            .eq('id', storeId)
            .single()
        setOptIn(!!data?.whatsapp_bot_opt_in)
        setPhoneNumberId(data?.whatsapp_bot_phone_number_id || null)
        setDisplayNumber(data?.whatsapp_bot_display_number || null)
        setRequestedNumber(data?.whatsapp_bot_requested_number || '')
        setStatus((data?.whatsapp_bot_status as BotStatus) || 'none')
        setLoading(false)
    }, [storeId])

    useEffect(() => { load() }, [load])

    useEffect(() => {
        supabase
            .from('service_pricing')
            .select('postpaid_price')
            .eq('service_type', 'whatsapp_bot_message_fee')
            .maybeSingle()
            .then(({ data }) => setFeePrice(data?.postpaid_price ?? null))
    }, [])

    const request = async () => {
        const cleanNumber = requestedNumber.trim()
        if (!cleanNumber) {
            toast.error('Informe o número de WhatsApp que a loja vai usar.')
            return
        }
        setSaving(true)
        const { error } = await supabase
            .from('stores')
            .update({ whatsapp_bot_opt_in: true, whatsapp_bot_requested_number: cleanNumber, whatsapp_bot_status: 'requested' })
            .eq('id', storeId)
        if (error) {
            toast.error('Erro ao salvar: ' + error.message)
        } else {
            setOptIn(true)
            setStatus('requested')
            setDialogStep('closed')
            toast.success('Pedido registrado! Em breve conectamos seu número.')
        }
        setSaving(false)
    }

    const cancel = async () => {
        setSaving(true)
        const { error } = await supabase
            .from('stores')
            .update({ whatsapp_bot_opt_in: false, whatsapp_bot_status: 'none' })
            .eq('id', storeId)
        if (error) {
            toast.error('Erro ao salvar: ' + error.message)
        } else {
            setOptIn(false)
            setStatus('none')
            toast.success('Atendimento automático desativado.')
        }
        setSaving(false)
    }

    const waLink = displayNumber ? `https://wa.me/${displayNumber.replace(/\D/g, '')}` : null

    const cardStyle = {
        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: `1px solid ${colors.border}`,
        boxShadow: colors.shadow,
    } as const

    const inputStyle = {
        background: colors.background,
        border: `1px solid ${colors.border}`,
        color: colors.textPrimary,
        borderRadius: 12,
        padding: '10px 14px',
        fontSize: 13,
    } as const

    if (loading) {
        return <div className="rounded-2xl p-6 animate-pulse" style={cardStyle}><div className="h-6 w-48 bg-gray-200 rounded" /></div>
    }

    return (
        <div className="rounded-2xl p-6 flex flex-col gap-4" style={cardStyle}>
            <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: GRADIENT, color: '#fff' }}>
                    <MessageCircle size={24} />
                </div>
                <div>
                    <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>Atendimento automático por WhatsApp</h3>
                    <p className="text-xs mt-0.5" style={{ color: colors.textSecondary }}>
                        Cliente conversa com o WhatsApp da sua loja e o bot responde: catálogo, horário, pedido e status — sozinho.
                    </p>
                </div>
            </div>

            {phoneNumberId ? (
                <div className="rounded-xl p-4 flex flex-col gap-2" style={{ background: '#22c55e15', border: '1px solid #22c55e40' }}>
                    <p className="text-xs font-black flex items-center gap-1.5" style={{ color: '#16a34a' }}>
                        <Check size={14} /> Conectado{displayNumber ? ` — ${displayNumber}` : ''}
                    </p>
                    <p className="text-xs" style={{ color: colors.textSecondary }}>
                        Compartilhe esse link com seus clientes:
                    </p>
                    {waLink && (
                        <div className="flex items-center gap-2">
                            <span className="flex-1 text-xs font-bold truncate" style={{ color: colors.textPrimary }}>{waLink}</span>
                            <button
                                onClick={() => { navigator.clipboard.writeText(waLink); toast.success('Link copiado!') }}
                                className="p-1.5 rounded-full flex-shrink-0"
                                style={{ background: `${colors.border}30`, color: colors.textPrimary }}
                            >
                                <Copy size={14} />
                            </button>
                        </div>
                    )}
                </div>
            ) : optIn ? (
                <div className="rounded-xl p-4 flex flex-col gap-2" style={{ background: '#f9731615', border: '1px solid #f9731640' }}>
                    <div className="flex items-center gap-2">
                        {status === 'connecting' ? (
                            <Loader2 size={16} style={{ color: '#f97316' }} className="flex-shrink-0 animate-spin" />
                        ) : (
                            <Clock size={16} style={{ color: '#f97316' }} className="flex-shrink-0" />
                        )}
                        <p className="text-xs font-bold" style={{ color: colors.textPrimary }}>
                            {STATUS_TEXT[status === 'connected' || status === 'none' ? 'requested' : status]}
                        </p>
                    </div>
                    {requestedNumber && (
                        <p className="text-[11px]" style={{ color: colors.textSecondary }}>
                            Número pedido: <span className="font-bold">{requestedNumber}</span>
                        </p>
                    )}
                </div>
            ) : null}

            <button
                onClick={() => (phoneNumberId ? undefined : optIn ? cancel() : setDialogStep('terms'))}
                disabled={saving || !!phoneNumberId}
                className="px-4 py-2.5 rounded-full font-black uppercase text-xs tracking-wider transition-all disabled:opacity-60 self-start"
                style={optIn
                    ? { background: `${colors.border}30`, color: colors.textPrimary }
                    : { background: GRADIENT, color: '#fff' }}
            >
                {saving ? <Spinner size={14} /> : phoneNumberId ? 'Conectado' : optIn ? 'Cancelar pedido' : 'Quero ativar'}
            </button>

            {dialogStep !== 'closed' && (
                <div
                    className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
                    style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
                    onClick={() => setDialogStep('closed')}
                >
                    <div
                        className="w-full max-w-sm rounded-2xl p-6 space-y-4"
                        style={{ background: colors.background, border: `1px solid ${colors.border}`, boxShadow: colors.shadow }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {dialogStep === 'terms' ? (
                            <>
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-center gap-2">
                                        <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: GRADIENT, color: '#fff' }}>
                                            <MessageCircle size={18} />
                                        </div>
                                        <h3 className="text-base font-black" style={{ color: colors.textPrimary }}>Ativar atendimento automático</h3>
                                    </div>
                                    <button onClick={() => setDialogStep('closed')} style={{ color: colors.textSecondary }}>
                                        <X size={18} />
                                    </button>
                                </div>

                                <p className="text-xs leading-relaxed" style={{ color: colors.textSecondary }}>
                                    O bot responde sozinho no WhatsApp da sua loja: catálogo, horário, pedido e status.
                                </p>

                                <div className="rounded-xl p-3 flex items-start gap-2" style={{ background: '#f9731615', border: '1px solid #f9731640' }}>
                                    <ShieldCheck size={16} style={{ color: '#f97316' }} className="flex-shrink-0 mt-0.5" />
                                    <p className="text-[11px] leading-relaxed" style={{ color: colors.textPrimary }}>
                                        Mensagens do bot além da cota gratuita mensal da Meta são cobradas à parte
                                        {feePrice != null ? ` (${feePrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} por mensagem, estimativa)` : ' (custo estimado + R$0,15)'}
                                        , descontadas do extrato da loja — vale pro pré-pago e pro pós-pago.
                                    </p>
                                </div>

                                <div className="flex gap-3 pt-1">
                                    <button
                                        onClick={() => setDialogStep('closed')}
                                        className="flex-1 py-3 rounded-xl font-black uppercase text-[10px] tracking-wider"
                                        style={{ background: `${colors.border}30`, color: colors.textPrimary }}
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={() => setDialogStep('number')}
                                        className="flex-1 py-3 rounded-xl font-black uppercase text-[10px] tracking-wider"
                                        style={{ background: GRADIENT, color: '#fff' }}
                                    >
                                        Concordo, continuar
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="flex items-center gap-2">
                                    <button onClick={() => setDialogStep('terms')} style={{ color: colors.textSecondary }}>
                                        <ArrowLeft size={18} />
                                    </button>
                                    <h3 className="text-base font-black" style={{ color: colors.textPrimary }}>Qual o WhatsApp da loja?</h3>
                                </div>

                                <p className="text-xs leading-relaxed" style={{ color: colors.textSecondary }}>
                                    Informe o número de WhatsApp que você já comprou/separou só pra ativar o bot.
                                </p>

                                <input
                                    type="tel"
                                    autoFocus
                                    value={requestedNumber}
                                    onChange={(e) => setRequestedNumber(e.target.value)}
                                    placeholder="Ex: 5569999999999"
                                    style={inputStyle}
                                    className="w-full"
                                />

                                <button
                                    onClick={request}
                                    disabled={saving}
                                    className="w-full py-3 rounded-xl font-black uppercase text-[10px] tracking-wider disabled:opacity-60 flex items-center justify-center"
                                    style={{ background: GRADIENT, color: '#fff' }}
                                >
                                    {saving ? <Spinner size={14} /> : 'Ativar'}
                                </button>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
