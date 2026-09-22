// src/components/StoreDashboard/StoreWhatsAppBot.tsx
//
// A loja "pede" o atendimento automático por WhatsApp aqui
// (whatsapp_bot_opt_in) — é só um interesse registrado, o número de
// verdade só passa a responder depois que o admin conecta ele no painel
// da Meta e associa à loja (fica visível aqui assim que acontece).
'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { toast } from 'sonner'
import { MessageCircle, Check, Copy, Clock } from 'lucide-react'
import { hexToRgb } from '@/lib/color'
import { Spinner } from '@/components/Spinner'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

interface StoreWhatsAppBotProps {
    storeId: string
}

export default function StoreWhatsAppBot({ storeId }: StoreWhatsAppBotProps) {
    const { colors } = useTheme()
    const surfaceRgb = hexToRgb(colors.surface)

    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [optIn, setOptIn] = useState(false)
    const [phoneNumberId, setPhoneNumberId] = useState<string | null>(null)
    const [displayNumber, setDisplayNumber] = useState<string | null>(null)

    const load = useCallback(async () => {
        if (!storeId) return
        setLoading(true)
        const { data } = await supabase
            .from('stores')
            .select('whatsapp_bot_opt_in, whatsapp_bot_phone_number_id, whatsapp_bot_display_number')
            .eq('id', storeId)
            .single()
        setOptIn(!!data?.whatsapp_bot_opt_in)
        setPhoneNumberId(data?.whatsapp_bot_phone_number_id || null)
        setDisplayNumber(data?.whatsapp_bot_display_number || null)
        setLoading(false)
    }, [storeId])

    useEffect(() => { load() }, [load])

    const toggle = async (value: boolean) => {
        setSaving(true)
        const { error } = await supabase.from('stores').update({ whatsapp_bot_opt_in: value }).eq('id', storeId)
        if (error) {
            toast.error('Erro ao salvar: ' + error.message)
        } else {
            setOptIn(value)
            toast.success(value ? 'Pedido registrado! Em breve conectamos seu número.' : 'Atendimento automático desativado.')
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
                <div className="rounded-xl p-4 flex items-center gap-2" style={{ background: '#f9731615', border: '1px solid #f9731640' }}>
                    <Clock size={16} style={{ color: '#f97316' }} className="flex-shrink-0" />
                    <p className="text-xs font-bold" style={{ color: colors.textPrimary }}>
                        Pedido registrado — estamos conectando o número da sua loja. Avisamos assim que estiver pronto.
                    </p>
                </div>
            ) : null}

            <button
                onClick={() => toggle(!optIn)}
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
