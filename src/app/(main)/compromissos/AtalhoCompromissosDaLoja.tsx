// components/AtalhoCompromissosDaLoja.tsx
'use client'

import { ReactNode, useMemo, useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Plus, X, Earth, Lock, User, Store, Check } from 'lucide-react'
import { useAppointments, useDeleteAppointment } from '@/app/(main)/compromissos/dadosDoCompromisso'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/theme'

/* ─── Helpers ─── */
function hexToRgb(hex: string) {
    const clean = hex.replace('#', '')
    const bigint = parseInt(clean, 16)
    return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 }
}

function formatTime(time: string) {
    return time.slice(0, 5)
}

interface AtalhoCompromissosDaLojaProps {
    dragHandle?: ReactNode
    profileSlug?: string | null
}

export default function AtalhoCompromissosDaLoja({
    dragHandle,
    profileSlug,
}: AtalhoCompromissosDaLojaProps) {
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

    const storeAppointments = useMemo(() => {
        if (!userId) return []
        return appointments.filter(
            (a) =>
                (a.owner_id === userId || a.provider_profile_id === userId) &&
                a.store_id
        )
    }, [appointments, userId])

    const filtered = useMemo(() => {
        if (!showPending) return storeAppointments.filter((a) => a.status !== 'pending')
        return storeAppointments
    }, [storeAppointments, showPending])

    // Ordenação: pendentes primeiro, depois confirmados, depois cancelados.
    // Dentro de cada status, mais recente primeiro.
    const sorted = useMemo(() => {
        return [...filtered].sort((a, b) => {
            const statusOrder: Record<string, number> = { pending: 0, confirmed: 1, cancelled: 2 }
            const orderA = statusOrder[a.status] ?? 3
            const orderB = statusOrder[b.status] ?? 3
            if (orderA !== orderB) return orderA - orderB

            const da = new Date(`${a.date}T${a.time}`)
            const db = new Date(`${b.date}T${b.time}`)
            return db.getTime() - da.getTime() // mais recente primeiro
        })
    }, [filtered])

    // Agrupa por loja (storeSlug)
    const groupedByStore = useMemo(() => {
        const map = new Map<string, typeof sorted>()
        sorted.forEach((a) => {
            const key = a.store_slug || a.store_id || 'loja-desconhecida'
            if (!map.has(key)) map.set(key, [])
            map.get(key)!.push(a)
        })
        return Array.from(map.entries()).map(([storeSlug, apps]) => ({
            storeSlug,
            appointments: apps,
        }))
    }, [sorted])

    const handleAccept = useCallback(async (id: string, e: React.MouseEvent) => {
        e.stopPropagation(); e.preventDefault()
        const { error } = await supabase
            .from('appointments')
            .update({ status: 'confirmed' })
            .eq('id', id)
        if (!error) refetch()
        else alert('Erro ao aceitar.')
    }, [refetch])

    const handleDecline = useCallback(async (id: string, e: React.MouseEvent) => {
        e.stopPropagation(); e.preventDefault()
        const { error } = await supabase.from('appointments').update({ status: 'cancelled' }).eq('id', id)
        if (!error) refetch()
    }, [refetch])

    const handleDelete = useCallback(async (id: string, e: React.MouseEvent) => {
        e.stopPropagation(); e.preventDefault()
        if (!confirm('Excluir este compromisso?')) return
        const success = await deleteAppointment(id)
        if (success) refetch()
    }, [deleteAppointment, refetch])

    const accentColor = colors.accent
    const textPrimary = colors.textPrimary
    const textSecondary = colors.textSecondary
    const surfaceRgb = hexToRgb(colors.surface)

    const statusConfig = {
        confirmed: { bg: '#10b98133', text: '#6ee7b7', label: 'Confirmado' },
        pending: { bg: '#eab30833', text: '#fde047', label: 'Pendente' },
        cancelled: { bg: '#ef444433', text: '#fca5a5', label: 'Cancelado' },
    }

    const scrollbarThumbColor = `${accentColor}40`

    if (loading) {
        return (
            <section>
                <div className="flex items-center gap-2 mb-3">
                    {dragHandle}
                    <Store className="w-5 h-5" style={{ color: accentColor }} />
                    <h2 className="text-xl font-black" style={{ color: textPrimary }}>Carregando...</h2>
                </div>
                <div className="flex gap-3 overflow-x-auto pb-2">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="flex-shrink-0 w-[280px] h-24 rounded-xl animate-pulse"
                            style={{ background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)` }} />
                    ))}
                </div>
            </section>
        )
    }

    return (
        <section>
            {/* Top bar: dragHandle + filtro pendentes + link "Ver todos" */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                <div className="flex items-center gap-2">
                    {dragHandle}
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-medium select-none" style={{ color: textSecondary }}>Pendentes</span>
                        <label className="relative inline-flex items-center cursor-pointer" style={{ width: 44, height: 24 }}>
                            <input type="checkbox" className="sr-only peer" checked={showPending} onChange={e => setShowPending(e.target.checked)} />
                            <span className="absolute inset-0 rounded-full transition-colors duration-200" style={{ background: showPending ? accentColor : colors.border }} />
                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${showPending ? 'translate-x-5' : 'translate-x-0'}`} />
                        </label>
                    </div>
                    {sorted.length > 0 && (
                        <Link href="/compromissos" className="text-xs font-bold px-3 py-1.5 rounded-full transition-colors whitespace-nowrap" style={{ background: colors.accentLight, color: accentColor }}>
                            Ver todos
                        </Link>
                    )}
                </div>
            </div>

            {sorted.length === 0 ? (
                <div className="rounded-2xl p-5 flex items-center justify-between"
                    style={{
                        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.5)`,
                        border: `1px solid ${colors.border}`,
                    }}>
                    <p className="font-medium text-sm" style={{ color: textSecondary }}>Nenhum compromisso nas suas lojas.</p>
                    <Link href="/compromissos/agendar" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full font-bold text-sm transition-colors shadow-md whitespace-nowrap"
                        style={{ background: accentColor, color: colors.accentText }}>
                        <Plus size={14} /> Criar
                    </Link>
                </div>
            ) : (
                <div className="space-y-6">
                    {groupedByStore.map(({ storeSlug, appointments }) => (
                        <div key={storeSlug}>
                            {/* Título da loja */}
                            <h3 className="text-lg font-black mb-3 flex items-center gap-2" style={{ color: textPrimary }}>
                                <Store size={18} style={{ color: accentColor }} />
                                Agenda da <span style={{ color: accentColor }}>@{storeSlug === 'loja-desconhecida' ? 'Loja' : storeSlug}</span>
                            </h3>

                            {/* Cards horizontais com espaçamento interno */}
                            <div className="flex gap-3 overflow-x-auto overflow-y-visible pt-3 pb-2 pl-2 pr-2 snap-x snap-mandatory scroll-container">
                                {appointments.map((appointment) => {
                                    const status = appointment.status as 'confirmed' | 'pending' | 'cancelled'
                                    const statusInfo = statusConfig[status] || statusConfig.pending
                                    const isPending = status === 'pending'

                                    const dateStr = new Date(appointment.date + 'T12:00:00').toLocaleDateString('pt-BR', {
                                        day: '2-digit', month: 'short'
                                    })

                                    const avatarUrl = appointment.customer_avatar_url || null
                                    const customerName = appointment.customer_slug || 'Cliente'
                                    const serviceName = appointment.service_name
                                    const customerSlug = appointment.customer_slug || null
                                    const duration = appointment.duration_minutes // duração do serviço

                                    return (
                                        <div
                                            key={appointment.id}
                                            className="flex-shrink-0 w-[280px] snap-start flex items-center gap-3 p-3 rounded-xl border shadow-sm hover:shadow-md transition-all relative"
                                            style={{
                                                background: colors.surface,
                                                borderColor: isPending ? '#fbbf2466' : colors.border,
                                            }}
                                        >
                                            {/* Badge "Novo" – no canto superior direito */}
                                            {isPending && (
                                                <span
                                                    className="absolute -top-2 -right-2 z-10 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold tracking-wide shadow-md"
                                                    style={{
                                                        background: accentColor,
                                                        color: '#000000',
                                                        boxShadow: `0 2px 6px ${accentColor}40`,
                                                    }}
                                                >
                                                    Novo
                                                </span>
                                            )}

                                            {/* Avatar do cliente com link */}
                                            {customerSlug ? (
                                                <Link href={`/${customerSlug}`} onClick={(e) => e.stopPropagation()} className="flex-shrink-0">
                                                    {avatarUrl ? (
                                                        <img src={avatarUrl} alt="" className="w-11 h-11 rounded-xl object-cover" />
                                                    ) : (
                                                        <div className="w-11 h-11 rounded-xl flex items-center justify-center"
                                                            style={{ background: `linear-gradient(135deg, ${accentColor}, ${colors.accentLight})` }}>
                                                            <User size={22} style={{ color: colors.accentText }} />
                                                        </div>
                                                    )}
                                                </Link>
                                            ) : (
                                                <div className="flex-shrink-0">
                                                    {avatarUrl ? (
                                                        <img src={avatarUrl} alt="" className="w-11 h-11 rounded-xl object-cover" />
                                                    ) : (
                                                        <div className="w-11 h-11 rounded-xl flex items-center justify-center"
                                                            style={{ background: `linear-gradient(135deg, ${accentColor}, ${colors.accentLight})` }}>
                                                            <User size={22} style={{ color: colors.accentText }} />
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* Informações e ações */}
                                            <Link href="/compromissos" className="flex-1 min-w-0 flex flex-col" style={{ textDecoration: 'none', color: 'inherit' }}>
                                                {/* Linha 1: data + status */}
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-xs font-medium" style={{ color: textSecondary }}>{dateStr}</span>
                                                    <span
                                                        className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                                                        style={{ background: statusInfo.bg, color: statusInfo.text }}
                                                    >
                                                        {statusInfo.label}
                                                    </span>
                                                </div>

                                                {/* Linha 2: serviço + duração (se houver) */}
                                                <div className="flex items-center gap-1 mb-1">
                                                    <h4 className="font-bold text-sm truncate" style={{ color: textPrimary }}>{serviceName}</h4>
                                                    {duration && (
                                                        <span className="text-[10px] font-semibold whitespace-nowrap" style={{ color: textSecondary }}>
                                                            · {duration} min
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Linha 3: cliente e visibilidade */}
                                                <div className="flex items-center gap-2 mt-1">
                                                    <p className="text-xs flex items-center gap-1" style={{ color: textSecondary }}>
                                                        <User size={10} />@{customerName}
                                                    </p>
                                                    {appointment.is_public !== undefined && (
                                                        <span
                                                            className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold inline-flex items-center gap-1"
                                                            style={{
                                                                background: appointment.is_public ? 'rgba(16,185,129,0.2)' : `${textSecondary}20`,
                                                                color: appointment.is_public ? '#10b981' : textSecondary,
                                                            }}
                                                        >
                                                            {appointment.is_public ? <Earth size={10} /> : <Lock size={10} />}
                                                            {appointment.is_public ? 'Público' : 'Privado'}
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Linha 4: hora e ações */}
                                                <div className="flex items-center justify-between mt-2">
                                                    <span className="text-sm font-black tabular-nums" style={{ color: accentColor }}>
                                                        {formatTime(appointment.time)}
                                                    </span>
                                                    <div className="flex items-center gap-1">
                                                        {isPending ? (
                                                            <>
                                                                <button onClick={(e) => handleAccept(appointment.id, e)}
                                                                    className="p-1 bg-green-500 text-white rounded-full hover:bg-green-600 transition-colors">
                                                                    <Check size={12} />
                                                                </button>
                                                                <button onClick={(e) => handleDecline(appointment.id, e)}
                                                                    className="p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors">
                                                                    <X size={12} />
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <button onClick={(e) => handleDelete(appointment.id, e)}
                                                                className="p-1 rounded-full transition-colors hover:bg-red-50 hover:text-red-500"
                                                                style={{ color: textSecondary }}>
                                                                <X size={14} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </Link>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Estilização da scrollbar personalizada */}
            <style jsx>{`
                .scroll-container::-webkit-scrollbar {
                    height: 6px;
                }
                .scroll-container::-webkit-scrollbar-track {
                    background: transparent;
                }
                .scroll-container::-webkit-scrollbar-thumb {
                    background-color: ${scrollbarThumbColor};
                    border-radius: 9999px;
                }
                .scroll-container::-webkit-scrollbar-thumb:hover {
                    background-color: ${accentColor};
                }
                /* Firefox */
                .scroll-container {
                    scrollbar-width: thin;
                    scrollbar-color: ${scrollbarThumbColor} transparent;
                }
            `}</style>
        </section>
    )
}