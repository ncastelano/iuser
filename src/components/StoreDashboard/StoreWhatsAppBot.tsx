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
import { MessageCircle, Check, Copy, Clock, Loader2 } from 'lucide-react'
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
            ) : (
                <input
                    type="tel"
                    value={requestedNumber}
                    onChange={(e) => setRequestedNumber(e.target.value)}
                    placeholder="WhatsApp da loja, ex: 5569999999999"
                    style={inputStyle}
                    className="w-full"
                />
            )}

            <button
                onClick={() => (phoneNumberId ? undefined : optIn ? cancel() : request())}
                disabled={saving || !!phoneNumberId}
                className="px-4 py-2.5 rounded-full font-black uppercase text-xs tracking-wider transition-all disabled:opacity-60 self-start"
                style={optIn
                    ? { background: `${colors.border}30`, color: colors.textPrimary }
                    : { background: GRADIENT, color: '#fff' }}
            >
                {saving ? <Spinner size={14} /> : phoneNumberId ? 'Conectado' : optIn ? 'Cancelar pedido' : 'Quero ativar'}
            </button>
        </div>
    )
}
