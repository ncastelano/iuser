'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/theme'
import { Send, MessageCircle } from 'lucide-react'
import { Spinner } from '@/components/Spinner'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

interface RideMessage {
    id: string
    sender_id: string
    message: string
    created_at: string
}

interface RideChatProps {
    rideId: string
    // Chips de resposta rápida (só faz sentido pro motorista, que geralmente
    // manda os mesmos tipos de aviso). O passageiro escreve livre.
    quickReplies?: string[]
}

// Chat momentâneo de uma corrida aceita — some junto com o pedido, não é uma
// conversa persistente. Usado tanto em /pedir-motorista (passageiro) quanto
// em /aceitar-corridas (motorista), lendo/escrevendo em ride_messages.
export default function RideChat({ rideId, quickReplies }: RideChatProps) {
    const { colors } = useTheme()
    const [messages, setMessages] = useState<RideMessage[]>([])
    const [text, setText] = useState('')
    const [sending, setSending] = useState(false)
    const [loading, setLoading] = useState(true)
    const [userId, setUserId] = useState<string | null>(null)
    const bottomRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        let active = true
        supabase.auth.getUser().then(({ data: { user } }) => {
            if (active) setUserId(user?.id ?? null)
        })
        return () => { active = false }
    }, [])

    useEffect(() => {
        let active = true

        const load = async () => {
            const { data } = await supabase
                .from('ride_messages')
                .select('id, sender_id, message, created_at')
                .eq('ride_request_id', rideId)
                .order('created_at', { ascending: true })
            if (active) {
                setMessages(data || [])
                setLoading(false)
            }
        }
        load()

        const channel = supabase
            .channel(`ride-chat-${rideId}`)
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'ride_messages', filter: `ride_request_id=eq.${rideId}` },
                (payload) => {
                    const msg = payload.new as RideMessage
                    setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]))
                }
            )
            .subscribe()

        return () => {
            active = false
            supabase.removeChannel(channel)
        }
    }, [rideId])

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }, [messages.length])

    const send = async (content: string) => {
        const trimmed = content.trim()
        if (!trimmed || !userId || sending) return
        setSending(true)
        try {
            const { error } = await supabase.from('ride_messages').insert({
                ride_request_id: rideId,
                sender_id: userId,
                message: trimmed,
            })
            if (error) throw error
            setText('')
        } catch {
            // Silencioso: um erro pontual de chat não deve travar a tela da corrida.
        } finally {
            setSending(false)
        }
    }

    return (
        <div className="flex flex-col gap-2 rounded-xl p-3" style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}` }}>
            <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                <MessageCircle size={12} />
                Chat da corrida
            </p>

            <div className="flex flex-col gap-1.5 max-h-52 overflow-y-auto pr-1">
                {loading ? (
                    <div className="flex justify-center py-3">
                        <Spinner size={14} color={colors.textSecondary} />
                    </div>
                ) : messages.length === 0 ? (
                    <p className="text-[11px] text-center py-3" style={{ color: colors.textSecondary }}>
                        Nenhuma mensagem ainda.
                    </p>
                ) : (
                    messages.map((m) => {
                        const mine = m.sender_id === userId
                        return (
                            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                                <div
                                    className="max-w-[80%] px-3 py-1.5 rounded-2xl text-xs break-words"
                                    style={
                                        mine
                                            ? { background: GRADIENT, color: '#fff' }
                                            : { background: colors.surface, color: colors.textPrimary, border: `1px solid ${colors.border}` }
                                    }
                                >
                                    {m.message}
                                </div>
                            </div>
                        )
                    })
                )}
                <div ref={bottomRef} />
            </div>

            {quickReplies && quickReplies.length > 0 && (
                <div className="flex gap-1.5 flex-wrap">
                    {quickReplies.map((reply) => (
                        <button
                            key={reply}
                            onClick={() => send(reply)}
                            disabled={sending}
                            className="px-2.5 py-1 rounded-full text-[10px] font-bold disabled:opacity-60 transition-all hover:scale-105 active:scale-95"
                            style={{ background: colors.surface, color: colors.textPrimary, border: `1px solid ${colors.border}` }}
                        >
                            {reply}
                        </button>
                    ))}
                </div>
            )}

            <div className="flex items-center gap-2">
                <input
                    type="text"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault()
                            send(text)
                        }
                    }}
                    placeholder="Escreva uma mensagem..."
                    className="flex-1 min-w-0 px-3 py-2 rounded-full border text-xs"
                    style={{ background: colors.background, borderColor: colors.border, color: colors.textPrimary }}
                />
                <button
                    onClick={() => send(text)}
                    disabled={sending || !text.trim()}
                    className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 disabled:opacity-50"
                    style={{ background: GRADIENT, color: '#fff' }}
                >
                    {sending ? <Spinner size={14} /> : <Send size={14} />}
                </button>
            </div>
        </div>
    )
}
