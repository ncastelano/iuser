// components/AtalhoCompromissosDaLoja.tsx
'use client'

import { ReactNode, useMemo, useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Plus, X, Earth, Lock, User, Store, Check, Megaphone, CalendarPlus, Eye, EyeOff, Clock } from 'lucide-react'
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

/* ─── Badge de visibilidade ─── */
function VisibilityBadge({ isPublic, textColor }: { isPublic: boolean; textColor: string }) {
    return (
        <span
            style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 8,
                backgroundColor: isPublic ? 'rgba(16,185,129,0.15)' : `${textColor}20`,
                color: isPublic ? '#10b981' : textColor,
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

/* ─── Badge de status ─── */
function StatusBadge({ status }: { status: string }) {
    const config = {
        confirmed: { bg: 'rgba(16,185,129,0.2)', text: '#34d399', label: 'Confirmado' },
        pending: { bg: 'rgba(234,179,8,0.2)', text: '#fbbf24', label: 'Pendente' },
        cancelled: { bg: 'rgba(239,68,68,0.2)', text: '#f87171', label: 'Cancelado' },
        completed: { bg: 'rgba(60, 60, 61, 0.2)', text: '#60a5fa', label: 'Concluído' },
    }
    const style = config[status as keyof typeof config] || config.pending

    return (
        <span
            className="text-[10px] px-2 py-0.5 rounded-full font-bold"
            style={{ background: style.bg, color: style.text }}
        >
            {style.label}
        </span>
    )
}

interface AtalhoCompromissosDaLojaProps {
    dragHandle?: ReactNode
    profileSlug?: string | null
    onHasItemsChange?: (hasItems: boolean) => void
}

export default function AtalhoCompromissosDaLoja({
    dragHandle,
    profileSlug,
    onHasItemsChange,
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

    useEffect(() => {
        onHasItemsChange?.(storeAppointments.length > 0)
    }, [storeAppointments, onHasItemsChange])

    const filtered = useMemo(() => {
        if (!showPending) return storeAppointments.filter((a) => a.status !== 'pending')
        return storeAppointments
    }, [storeAppointments, showPending])

    const sorted = useMemo(() => {
        return [...filtered].sort((a, b) => {
            const statusOrder: Record<string, number> = { pending: 0, confirmed: 1, cancelled: 2 }
            const orderA = statusOrder[a.status] ?? 3
            const orderB = statusOrder[b.status] ?? 3
            if (orderA !== orderB) return orderA - orderB

            const da = new Date(`${a.date}T${a.time}`)
            const db = new Date(`${b.date}T${b.time}`)
            return db.getTime() - da.getTime()
        })
    }, [filtered])

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

    const hasHiddenPending = !showPending && storeAppointments.some(a => a.status === 'pending')

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

    const surfaceRgb = hexToRgb(colors.surface)
    const cardBg = `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0)`
    const borderColor = colors.border
    const accentColor = '#f97316'
    const textPrimary = colors.textPrimary
    const textSecondary = colors.textSecondary

    const scrollbarThumbColor = `${accentColor}40`

    if (loading) {
        return (
            <div
                className="rounded-2xl p-6 w-full"
                style={{
                    background: cardBg,
                    backdropFilter: 'blur(20px) saturate(180%)',
                    WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                    border: `1px solid ${borderColor}`,
                }}
            >
                <div className="flex items-center gap-2 mb-4">
                    {dragHandle}
                    <Store className="w-5 h-5" style={{ color: accentColor }} />
                    <h2 className="text-xl font-black" style={{ color: textPrimary }}>Carregando...</h2>
                </div>
                <div className="flex gap-3 overflow-x-auto pb-2">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="flex-shrink-0 w-[280px] h-24 rounded-xl animate-pulse"
                            style={{ background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.1)` }} />
                    ))}
                </div>
            </div>
        )
    }

    return (
        <div
            className="rounded-2xl p-6 w-full"
            style={{
                background: cardBg,
                backdropFilter: 'blur(20px) saturate(180%)',
                WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                border: `1px solid ${borderColor}`,
            }}
        >
            {/* Cabeçalho */}
            <div className="flex flex-wrap items-center gap-3 mb-4">
                <div className="flex items-center gap-2">
                    {dragHandle}
                    <Store className="w-5 h-5" style={{ color: accentColor }} />
                    <h2 className="text-xl font-black" style={{ color: textPrimary }}>Agenda da Loja</h2>
                </div>

                <div className="flex items-center gap-3 flex-1 justify-end flex-wrap">
                    <Link
                        href="/compromissos/agendar"
                        className="text-xs font-bold px-3 py-1.5 rounded-full transition-all hover:scale-105 active:scale-95 flex items-center gap-1"
                        style={{ background: '#f97316', color: '#ffffff' }}
                    >
                        <Plus size={14} />
                        Criar
                    </Link>

                    {sorted.length > 0 && (
                        <Link
                            href="/compromissos"
                            className="text-xs font-bold px-3 py-1.5 rounded-full transition-all hover:scale-105 active:scale-95"
                            style={{ background: '#f97316', color: '#ffffff' }}
                        >
                            Ver todos
                        </Link>
                    )}

                    <div className="flex items-center gap-2">
                        <span
                            className="text-xs font-medium select-none cursor-pointer"
                            style={{ color: textSecondary }}
                            onClick={() => setShowPending(prev => !prev)}
                        >
                            Pendentes
                        </span>
                        <label className="relative inline-flex items-center cursor-pointer" style={{ width: 40, height: 22 }}>
                            <input type="checkbox" className="sr-only peer" checked={showPending} onChange={e => setShowPending(e.target.checked)} />
                            <span
                                className="absolute inset-0 rounded-full transition-colors duration-200"
                                style={{ background: showPending ? '#f97316' : colors.border }}
                            />
                            <span
                                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${showPending ? 'translate-x-[18px]' : 'translate-x-0'}`}
                            />
                        </label>
                    </div>
                </div>
            </div>

            {/* Conteúdo */}
            {sorted.length === 0 && !hasHiddenPending ? (
                /* Estado vazio */
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-xl" style={{ background: `${borderColor}10`, backdropFilter: 'blur(8px)' }}>
                    <div className="flex items-center gap-4">
                        <div
                            className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0"
                            style={{
                                background: `linear-gradient(135deg, #f97316, #fb923c)`,
                                color: '#ffffff',
                            }}
                        >
                            <Store size={28} />
                        </div>
                        <div>
                            <h3 className="text-lg font-black" style={{ color: textPrimary }}>
                                Sem compromissos na sua loja
                            </h3>
                            <p className="text-sm mt-1" style={{ color: textSecondary }}>
                                Divulgue sua loja para as pessoas agendarem um horário.
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button
                            className="px-4 py-2 rounded-full font-bold text-sm flex items-center gap-2 transition-all shadow-md opacity-50 cursor-not-allowed"
                            style={{
                                background: '#f97316',
                                color: '#ffffff',
                                boxShadow: `0 4px 10px #f9731640`,
                            }}
                            disabled
                            aria-disabled="true"
                        >
                            <Megaphone size={16} />
                            Divulgar loja
                        </button>
                        <button
                            className="px-4 py-2 rounded-full font-bold text-sm flex items-center gap-2 transition-all shadow-md opacity-50 cursor-not-allowed"
                            style={{
                                background: '#f97316',
                                color: '#ffffff',
                                boxShadow: `0 4px 10px #f9731640`,
                            }}
                            disabled
                            aria-disabled="true"
                        >
                            <CalendarPlus size={16} />
                            Criar evento
                        </button>
                        <Link
                            href="/compromissos/agendar"
                            className="px-4 py-2 rounded-full font-bold text-sm flex items-center gap-2 transition-all hover:scale-105 shadow-md"
                            style={{
                                background: '#f97316',
                                color: '#ffffff',
                                boxShadow: `0 4px 14px #f9731660`,
                            }}
                        >
                            <Plus size={16} />
                            Novo compromisso
                        </Link>
                    </div>
                </div>
            ) : sorted.length === 0 && hasHiddenPending ? (
                /* Pendentes ocultos */
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-xl" style={{ background: `#f9731610`, backdropFilter: 'blur(8px)' }}>
                    <div className="flex items-center gap-4">
                        <div
                            className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0"
                            style={{
                                background: `linear-gradient(135deg, #f97316, #fb923c)`,
                                color: '#ffffff',
                            }}
                        >
                            <EyeOff size={28} />
                        </div>
                        <div>
                            <h3 className="text-lg font-black" style={{ color: textPrimary }}>
                                Sua loja tem agendamentos pendentes
                            </h3>
                            <p className="text-sm mt-1" style={{ color: textSecondary }}>
                                Ative a exibição de pendentes para aceitar ou recusar novos pedidos.
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={() => setShowPending(true)}
                        className="px-5 py-2.5 rounded-full font-bold text-sm flex items-center gap-2 transition-all hover:scale-105 active:scale-95 shadow-lg flex-shrink-0"
                        style={{
                            background: '#f97316',
                            color: '#ffffff',
                            boxShadow: `0 4px 14px #f9731660`,
                        }}
                    >
                        <Eye size={16} />
                        Ativar pendentes
                    </button>
                </div>
            ) : (
                /* Lista de compromissos agrupados */
                <div className="space-y-6">
                    {groupedByStore.map(({ storeSlug, appointments }) => (
                        <div key={storeSlug}>
                            <h3 className="text-lg font-black mb-3 flex items-center gap-2" style={{ color: textPrimary }}>
                                <Store size={18} style={{ color: accentColor }} />
                                Agenda da <span style={{ color: accentColor }}>@{storeSlug === 'loja-desconhecida' ? 'Loja' : storeSlug}</span>
                            </h3>

                            <div className="flex gap-3 overflow-x-auto overflow-y-visible pt-3 pb-2 pl-2 pr-2 snap-x snap-mandatory scroll-container">
                                {appointments.map((appointment) => {
                                    const status = appointment.status as string
                                    const isPending = status === 'pending'

                                    const dateStr = new Date(appointment.date + 'T12:00:00').toLocaleDateString('pt-BR', {
                                        day: '2-digit', month: 'short'
                                    })

                                    const avatarUrl = appointment.customer_avatar_url || null
                                    const customerName = appointment.customer_slug || 'Cliente'
                                    const serviceName = appointment.service_name
                                    const customerSlug = appointment.customer_slug || null
                                    const duration = appointment.duration_minutes

                                    const isPast = new Date(`${appointment.date}T${appointment.time}`).getTime() < Date.now()
                                    const isToday = new Date(appointment.date).toDateString() === new Date().toDateString()

                                    return (
                                        <div
                                            key={appointment.id}
                                            className="flex-shrink-0 w-[280px] snap-start rounded-xl p-4 border transition-all hover:shadow-lg hover:-translate-y-0.5"
                                            style={{
                                                background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.1)`,
                                                backdropFilter: 'blur(8px)',
                                                WebkitBackdropFilter: 'blur(8px)',
                                                borderColor: isPending ? `#f9731660` : `${borderColor}20`,
                                                boxShadow: isPending ? `0 0 0 2px #f9731640` : 'none',
                                            }}
                                        >
                                            {isPending && (
                                                <span
                                                    className="absolute -top-2 -right-2 z-10 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold tracking-wide shadow-md"
                                                    style={{
                                                        background: '#f97316',
                                                        color: '#ffffff',
                                                        boxShadow: `0 2px 6px #f9731640`,
                                                    }}
                                                >
                                                    Novo
                                                </span>
                                            )}

                                            <Link href="/compromissos" className="flex items-start gap-3" style={{ textDecoration: 'none', color: 'inherit' }}>
                                                {/* Avatar */}
                                                <div className="flex-shrink-0">
                                                    {customerSlug ? (
                                                        <Link href={`/${customerSlug}`} onClick={(e) => e.stopPropagation()}>
                                                            {avatarUrl ? (
                                                                <img src={avatarUrl} alt="" className="w-12 h-12 rounded-xl object-cover" />
                                                            ) : (
                                                                <div
                                                                    className="w-12 h-12 rounded-xl flex items-center justify-center"
                                                                    style={{
                                                                        background: `linear-gradient(135deg, #f97316, #fb923c)`,
                                                                        color: '#ffffff',
                                                                    }}
                                                                >
                                                                    <User size={20} />
                                                                </div>
                                                            )}
                                                        </Link>
                                                    ) : (
                                                        <>
                                                            {avatarUrl ? (
                                                                <img src={avatarUrl} alt="" className="w-12 h-12 rounded-xl object-cover" />
                                                            ) : (
                                                                <div
                                                                    className="w-12 h-12 rounded-xl flex items-center justify-center"
                                                                    style={{
                                                                        background: `linear-gradient(135deg, #f97316, #fb923c)`,
                                                                        color: '#ffffff',
                                                                    }}
                                                                >
                                                                    <User size={20} />
                                                                </div>
                                                            )}
                                                        </>
                                                    )}
                                                </div>

                                                {/* Conteúdo */}
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                        <span className="text-xs font-medium" style={{ color: textSecondary }}>
                                                            {isToday ? 'Hoje' : dateStr}
                                                        </span>
                                                        <StatusBadge status={status} />
                                                        {isPast && status !== 'cancelled' && (
                                                            <span className="text-[10px] font-bold text-red-400 bg-red-500/20 px-2 py-0.5 rounded-full">
                                                                Passado
                                                            </span>
                                                        )}
                                                    </div>

                                                    <div className="flex items-center gap-1 mb-1">
                                                        <h4 className="font-bold text-sm truncate" style={{ color: textPrimary }}>{serviceName}</h4>
                                                        {duration && (
                                                            <span className="text-[10px] font-semibold whitespace-nowrap" style={{ color: textSecondary }}>
                                                                · {duration} min
                                                            </span>
                                                        )}
                                                    </div>

                                                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                        <p className="text-xs flex items-center gap-1" style={{ color: textSecondary }}>
                                                            <User size={10} />@{customerName}
                                                        </p>
                                                        {appointment.is_public !== undefined && (
                                                            <VisibilityBadge isPublic={appointment.is_public} textColor={textSecondary} />
                                                        )}
                                                    </div>

                                                    <div className="flex items-center justify-between mt-2 pt-2 border-t" style={{ borderColor: `${borderColor}15` }}>
                                                        <span className="text-sm font-black flex items-center gap-1" style={{ color: '#f97316' }}>
                                                            <Clock size={14} />
                                                            {formatTime(appointment.time)}
                                                        </span>
                                                        <div className="flex items-center gap-1">
                                                            {isPending ? (
                                                                <>
                                                                    <button
                                                                        onClick={(e) => handleAccept(appointment.id, e)}
                                                                        className="p-1.5 rounded-full transition-all hover:scale-110 active:scale-95"
                                                                        style={{ background: 'rgba(16,185,129,0.2)', color: '#34d399' }}
                                                                    >
                                                                        <Check size={14} />
                                                                    </button>
                                                                    <button
                                                                        onClick={(e) => handleDecline(appointment.id, e)}
                                                                        className="p-1.5 rounded-full transition-all hover:scale-110 active:scale-95"
                                                                        style={{ background: 'rgba(239,68,68,0.2)', color: '#f87171' }}
                                                                    >
                                                                        <X size={14} />
                                                                    </button>
                                                                </>
                                                            ) : (
                                                                <button
                                                                    onClick={(e) => handleDelete(appointment.id, e)}
                                                                    className="p-1.5 rounded-full transition-all hover:scale-110 active:scale-95 opacity-40 hover:opacity-100"
                                                                    style={{ color: textSecondary }}
                                                                >
                                                                    <X size={14} />
                                                                </button>
                                                            )}
                                                        </div>
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
                .scroll-container {
                    scrollbar-width: thin;
                    scrollbar-color: ${scrollbarThumbColor} transparent;
                }
            `}</style>
        </div>
    )
}