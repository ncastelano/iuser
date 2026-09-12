'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { Send, MessageCircle } from 'lucide-react'
import { Spinner } from '@/components/Spinner'
import { getAvatarUrl } from '@/lib/avatar'

// Passageiro: laranja -> vermelho (mesmo gradiente do resto do app).
// Motorista: verde escuro -> verde claro. Os dois com texto branco, sempre —
// a cor identifica QUEM mandou (papel na corrida), não se é "minha" mensagem.
const REQUESTER_GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'
const DRIVER_GRADIENT = 'linear-gradient(135deg, #14532d, #4ade80)'

interface RideMessage {
    id: string
    sender_id: string
    message: string
    created_at: string
}

interface Participant {
    role: 'driver' | 'requester'
    avatarUrl: string | undefined
    initial: string
}

function getInitial(name: string | null, profileSlug: string | null): string {
    const source = (name || profileSlug || '?').trim()
    return source.charAt(0).toUpperCase()
}

interface RideChatProps {
    rideId: string
    // Chips de resposta rápida (só faz sentido pro motorista, que geralmente
    // manda os mesmos tipos de aviso). O passageiro escreve livre.
    quickReplies?: string[]
}

function timeAgo(iso: string): string {
    const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
    if (minutes < 1) return 'agora'
    if (minutes < 60) return `há ${minutes} min`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `há ${hours}h`
    return `há ${Math.floor(hours / 24)}d`
}

// Chat momentâneo de uma corrida aceita — some junto com o pedido, não é uma
// conversa persistente. Usado tanto em /pedir-motorista (passageiro) quanto
// em /aceitar-corridas (motorista), lendo/escrevendo em ride_messages.
export default function RideChat({ rideId, quickReplies }: RideChatProps) {
    const { colors } = useTheme()
    const [messages, setMessages] = useState<RideMessage[]>([])
    const [participants, setParticipants] = useState<Record<string, Participant>>({})
    const [text, setText] = useState('')
    const [sending, setSending] = useState(false)
    const [loading, setLoading] = useState(true)
    const { userId } = useProfile()
    const [, forceTick] = useState(0)
    const bottomRef = useRef<HTMLDivElement>(null)

    // Papel (motorista/passageiro) e avatar de cada participante — pra
    // colorir e ilustrar as mensagens sem precisar que quem chama o
    // componente já tenha esses dados à mão.
    useEffect(() => {
        let active = true
        supabase
            .from('ride_requests')
            .select('requester_id, driver_id')
            .eq('id', rideId)
            .maybeSingle()
            .then(async ({ data: ride }) => {
                if (!active || !ride) return
                const ids = [ride.requester_id, ride.driver_id].filter(Boolean) as string[]
                if (ids.length === 0) return

                const { data: profiles } = await supabase.from('profiles').select('id, name, profileSlug, avatar_url').in('id', ids)
                if (!active) return

                const map: Record<string, Participant> = {}
                for (const p of profiles || []) {
                    map[p.id] = {
                        role: p.id === ride.driver_id ? 'driver' : 'requester',
                        avatarUrl: getAvatarUrl(supabase, p.avatar_url),
                        initial: getInitial(p.name, p.profileSlug),
                    }
                }
                setParticipants(map)
            })
        return () => { active = false }
    }, [rideId])

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

    // Mantém "há X min" atualizado sem precisar de nova mensagem pra re-renderizar.
    useEffect(() => {
        const t = setInterval(() => forceTick((n) => n + 1), 30000)
        return () => clearInterval(t)
    }, [])

    const myGradient = participants[userId || '']?.role === 'driver' ? DRIVER_GRADIENT : REQUESTER_GRADIENT

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

            <div className="flex flex-col gap-2 max-h-52 overflow-y-auto pr-1">
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
                        const participant = participants[m.sender_id]
                        const gradient = participant?.role === 'driver' ? DRIVER_GRADIENT : REQUESTER_GRADIENT

                        const avatar = participant?.avatarUrl ? (
                            <img src={participant.avatarUrl} className="w-6 h-6 rounded-full object-cover flex-shrink-0" alt="" />
                        ) : (
                            <span
                                className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-black"
                                style={{ background: gradient, color: '#ffffff' }}
                            >
                                {participant?.initial || '?'}
                            </span>
                        )

                        return (
                            <div key={m.id} className={`flex items-end gap-1.5 ${mine ? 'justify-end' : 'justify-start'}`}>
                                {!mine && avatar}
                                <div className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                                    <div
                                        className="max-w-[200px] px-3 py-1.5 rounded-2xl text-xs break-words"
                                        style={{ background: gradient, color: '#ffffff' }}
                                    >
                                        {m.message}
                                    </div>
                                    <span className="text-[9px] mt-0.5 px-1" style={{ color: colors.textSecondary }}>
                                        {timeAgo(m.created_at)}
                                    </span>
                                </div>
                                {mine && avatar}
                            </div>
                        )
                    })
                )}
                <div ref={bottomRef} />
            </div>

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
                    style={{ background: myGradient, color: '#fff' }}
                >
                    {sending ? <Spinner size={14} /> : <Send size={14} />}
                </button>
            </div>

            {quickReplies && quickReplies.length > 0 && (
                <div className="flex flex-col gap-1.5">
                    <p className="text-[9px] font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                        Frases pré-moldadas
                    </p>
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
                </div>
            )}
        </div>
    )
}
