// components/AtalhoCompromissosPessoal.tsx
'use client'

import { ReactNode, useMemo, useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Clock3, Plus, Check, X, Calendar, User, Lock, Earth } from 'lucide-react'
import { useAppointments, useDeleteAppointment } from '@/app/(main)/compromissos/dadosDoCompromisso'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/theme'

/* ─── Auxiliar para converter hex em RGB (para usar em rgba) ─── */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
    const clean = hex.replace('#', '')
    const bigint = parseInt(clean, 16)
    return {
        r: (bigint >> 16) & 255,
        g: (bigint >> 8) & 255,
        b: bigint & 255,
    }
}

/* ─── Badge de visibilidade (com leve toque do tema no privado) ─── */
function VisibilityBadge({ isPublic, colors }: { isPublic: boolean; colors: any }) {
    return (
        <span
            style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '1px 6px',
                borderRadius: 8,
                backgroundColor: isPublic ? 'rgba(16,185,129,0.2)' : `${colors.textSecondary}20`, // 20% de opacidade
                color: isPublic ? '#10b981' : colors.textSecondary,
                display: 'flex',
                alignItems: 'center',
                gap: 3,
                whiteSpace: 'nowrap',
            }}
        >
            {isPublic ? <Earth size={10} /> : <Lock size={10} />}
            {isPublic ? 'Público' : 'Privado'}
        </span>
    )
}

interface AtalhoCompromissosPessoalProps {
    dragHandle?: ReactNode
    profileSlug?: string | null
    userAvatarUrl?: string | null
}

function parseDateTime(date: string, time: string) {
    const [y, m, d] = date.split('-').map(Number)
    const [h, min] = time.split(':').map(Number)
    return new Date(y, m - 1, d, h, min).getTime()
}

function formatTime(time: string) {
    return time.slice(0, 5)
}

export default function AtalhoCompromissosPessoal({
    dragHandle,
    profileSlug,
    userAvatarUrl,
}: AtalhoCompromissosPessoalProps) {
    const { colors } = useTheme()
    const { appointments, loading, refetch } = useAppointments()
    const { deleteAppointment } = useDeleteAppointment()

    const [userId, setUserId] = useState<string | null>(null)
    const [showPending, setShowPending] = useState(true)

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user) setUserId(session.user.id)
        })
    }, [])

    const personalAppointments = useMemo(() => {
        if (!userId) return []
        return appointments.filter(a => a.customer_id === userId && !a.store_id)
    }, [appointments, userId])

    const filtered = useMemo(() => {
        if (!showPending) return personalAppointments.filter(a => a.status !== 'pending')
        return personalAppointments
    }, [personalAppointments, showPending])

    const sorted = useMemo(() => {
        return [...filtered].sort((a, b) => parseDateTime(a.date, a.time) - parseDateTime(b.date, b.time))
    }, [filtered])

    const handleAccept = useCallback(async (id: string, e: React.MouseEvent) => {
        e.stopPropagation()
        e.preventDefault()
        const { error } = await supabase.rpc('confirm_appointment', { incoming_id: id })
        if (!error) refetch()
        else alert('Erro ao aceitar convite.')
    }, [refetch])

    const handleDecline = useCallback(async (id: string, e: React.MouseEvent) => {
        e.stopPropagation()
        e.preventDefault()
        const { error } = await supabase.from('appointments').update({ status: 'cancelled' }).eq('id', id)
        if (!error) refetch()
    }, [refetch])

    const handleDelete = useCallback(async (id: string, e: React.MouseEvent) => {
        e.stopPropagation()
        e.preventDefault()
        if (!confirm('Excluir este compromisso?')) return
        const success = await deleteAppointment(id)
        if (success) refetch()
    }, [deleteAppointment, refetch])

    const getAvatarUrl = (appointment: any) => {
        if (appointment.direction === 'incoming') {
            return appointment.customer_avatar_url || null
        } else if (appointment.direction === 'outgoing') {
            return appointment.customer_avatar_url || null
        } else {
            return userAvatarUrl || null
        }
    }

    const getProfileSlugFromAppointment = (appointment: any): string | null => {
        if (appointment.direction === 'incoming') {
            return appointment.owner_slug || null
        } else if (appointment.direction === 'outgoing') {
            return appointment.customer_slug || null
        }
        return null
    }

    const title = profileSlug ? `Agenda de @${profileSlug}` : 'Agenda Pessoal'

    // Estilos dinâmicos baseados no tema (para fundos com transparência)
    const cardBg = `rgba(${hexToRgb(colors.surface).r}, ${hexToRgb(colors.surface).g}, ${hexToRgb(colors.surface).b}, 0.5)`
    const borderColor = colors.border
    const accentColor = colors.accent
    const textPrimary = colors.textPrimary
    const textSecondary = colors.textSecondary

    if (loading) {
        return (
            <section>
                <div className="flex items-center gap-2 mb-3">
                    {dragHandle}
                    <Calendar className="w-5 h-5" style={{ color: accentColor }} />
                    <h2 className="text-xl font-black" style={{ color: textPrimary }}>{title}</h2>
                </div>
                <div className="flex gap-3 overflow-x-auto pb-2">
                    {[1, 2, 3].map(i => (
                        <div
                            key={i}
                            className="flex-shrink-0 w-[280px] h-24 rounded-xl animate-pulse"
                            style={{ background: `rgba(${hexToRgb(colors.surface).r}, ${hexToRgb(colors.surface).g}, ${hexToRgb(colors.surface).b}, 0.3)` }}
                        />
                    ))}
                </div>
            </section>
        )
    }

    return (
        <section>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                <div className="flex items-center gap-2">
                    {dragHandle}
                    <h2 className="text-xl font-black" style={{ color: textPrimary }}>{title}</h2>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-medium select-none" style={{ color: textSecondary }}>Pendentes</span>
                        <label className="relative inline-flex items-center cursor-pointer" style={{ width: 44, height: 24 }}>
                            <input type="checkbox" className="sr-only peer" checked={showPending} onChange={e => setShowPending(e.target.checked)} />
                            <span
                                className="absolute inset-0 rounded-full transition-colors duration-200"
                                style={{ background: showPending ? accentColor : colors.border }}
                            />
                            <span
                                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${showPending ? 'translate-x-5' : 'translate-x-0'}`}
                            />
                        </label>
                    </div>
                    {sorted.length > 0 && (
                        <Link
                            href="/compromissos"
                            className="text-xs font-bold px-3 py-1.5 rounded-full transition-colors whitespace-nowrap"
                            style={{ background: colors.accentLight, color: accentColor }}
                        >
                            Ver todos
                        </Link>
                    )}
                </div>
            </div>

            {sorted.length === 0 ? (
                <div
                    className="rounded-2xl p-5 flex items-center justify-between"
                    style={{
                        background: cardBg,
                        backdropFilter: 'blur(12px)',
                        WebkitBackdropFilter: 'blur(12px)',
                        border: `1px solid ${borderColor}`,
                    }}
                >
                    <p className="font-medium text-sm" style={{ color: textSecondary }}>Nenhum compromisso pessoal.</p>
                    <Link
                        href="/compromissos/agendar"
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full font-bold text-sm transition-colors shadow-md whitespace-nowrap"
                        style={{ background: accentColor, color: colors.accentText }}
                    >
                        <Plus size={14} /> Criar
                    </Link>
                </div>
            ) : (
                <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-hide">
                    {sorted.map(appointment => {
                        const isIncomingPending = appointment.direction === 'incoming' && appointment.status === 'pending'
                        const statusColor =
                            appointment.status === 'confirmed'
                                ? { bg: '#10b98133', text: '#6ee7b7' }
                                : appointment.status === 'pending'
                                    ? { bg: '#eab30833', text: '#fde047' }
                                    : { bg: '#ef444433', text: '#fca5a5' }
                        const avatarUrl = getAvatarUrl(appointment)
                        const profileSlugTarget = getProfileSlugFromAppointment(appointment)

                        const avatarElement = (
                            <div className="flex-shrink-0">
                                {avatarUrl ? (
                                    <img src={avatarUrl} alt="" style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover' }} />
                                ) : (
                                    <div
                                        style={{
                                            width: 44,
                                            height: 44,
                                            borderRadius: 10,
                                            background: `linear-gradient(135deg, ${accentColor}, ${colors.accentLight})`,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            color: colors.accentText,
                                        }}
                                    >
                                        <Calendar size={24} />
                                    </div>
                                )}
                            </div>
                        )

                        return (
                            <div
                                key={appointment.id}
                                className="flex-shrink-0 w-[280px] snap-start flex items-center gap-3 p-3 rounded-xl border shadow-sm hover:shadow-md transition-all"
                                style={{
                                    background: cardBg,
                                    backdropFilter: 'blur(12px)',
                                    WebkitBackdropFilter: 'blur(12px)',
                                    borderColor: isIncomingPending ? '#fbbf2466' : borderColor,
                                }}
                            >
                                {profileSlugTarget ? (
                                    <Link href={`/${profileSlugTarget}`} onClick={(e) => e.stopPropagation()}>
                                        {avatarElement}
                                    </Link>
                                ) : (
                                    avatarElement
                                )}

                                <Link href="/compromissos" className="flex-1 min-w-0 flex flex-col" style={{ textDecoration: 'none', color: 'inherit' }}>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-xs font-medium" style={{ color: textSecondary }}>
                                            {new Date(appointment.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                                        </span>
                                        <span
                                            className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                                            style={{ background: statusColor.bg, color: statusColor.text }}
                                        >
                                            {appointment.status === 'confirmed' ? 'Confirmado' : appointment.status === 'pending' ? 'Pendente' : appointment.status}
                                        </span>
                                        {isIncomingPending && (
                                            <span className="text-[10px] font-bold text-amber-300 bg-amber-400/20 px-1.5 py-0.5 rounded-full">
                                                Convite
                                            </span>
                                        )}
                                    </div>
                                    <h4 className="font-bold text-sm truncate" style={{ color: textPrimary }}>{appointment.service_name}</h4>
                                    <div className="flex items-center gap-2 mt-1">
                                        {appointment.direction === 'incoming' ? (
                                            <p className="text-xs flex items-center gap-1" style={{ color: textSecondary }}>
                                                <User size={10} />@{appointment.owner_slug}
                                            </p>
                                        ) : appointment.direction === 'outgoing' ? (
                                            <p className="text-xs flex items-center gap-1" style={{ color: textSecondary }}>
                                                <User size={10} /> Convite para @{appointment.customer_slug}
                                            </p>
                                        ) : (
                                            <p className="text-xs flex items-center gap-1" style={{ color: textSecondary }}>
                                                <User size={10} /> Compromisso pessoal
                                            </p>
                                        )}
                                        {appointment.is_public !== undefined && (
                                            <VisibilityBadge isPublic={appointment.is_public} colors={colors} />
                                        )}
                                    </div>
                                    <div className="flex items-center justify-between mt-2">
                                        <span className="text-sm font-black tabular-nums" style={{ color: accentColor }}>{formatTime(appointment.time)}</span>
                                        <div className="flex items-center gap-1">
                                            {isIncomingPending ? (
                                                <>
                                                    <button onClick={e => handleAccept(appointment.id, e)} className="p-1 bg-green-500 text-white rounded-full hover:bg-green-600 transition-colors"><Check size={12} /></button>
                                                    <button onClick={e => handleDecline(appointment.id, e)} className="p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"><X size={12} /></button>
                                                </>
                                            ) : (
                                                <button onClick={e => handleDelete(appointment.id, e)} className="p-1 rounded-full transition-colors" style={{ color: textSecondary, background: 'transparent' }}><X size={14} /></button>
                                            )}
                                        </div>
                                    </div>
                                </Link>
                            </div>
                        )
                    })}
                </div>
            )}
        </section>
    )
}