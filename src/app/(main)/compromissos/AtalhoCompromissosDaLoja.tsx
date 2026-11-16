// components/AtalhoCompromissosDaLoja.tsx
'use client'

import { ReactNode, useMemo, useEffect } from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { usePersistedExpanded } from '@/hooks/usePersistedExpanded'
import { useAppointments } from '@/app/(main)/compromissos/dadosDoCompromisso'
import { useProfilesById } from '@/hooks/useProfilesById'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { hexToRgb } from '@/lib/color'
import V3Section from '@/components/StoreDashboard/V3Section'
import StatChips from '@/components/StoreDashboard/StatChips'

/* ─── Helpers ─── */

function formatTime(time: string) {
    return time.slice(0, 5)
}

interface AtalhoCompromissosDaLojaProps {
    dragHandle?: ReactNode
    profileSlug?: string | null
    /** Qual loja é esta agenda: sem isso, misturaria os agendamentos de todas as lojas da pessoa */
    storeId?: string | null
    storeSlug?: string | null
    onHasItemsChange?: (hasItems: boolean) => void
}

export default function AtalhoCompromissosDaLoja({
    dragHandle,
    profileSlug,
    storeId,
    storeSlug,
    onHasItemsChange,
}: AtalhoCompromissosDaLojaProps) {
    const { colors } = useTheme()
    const { appointments, loading } = useAppointments()
    const { userId } = useProfile()
    const [isExpanded, setIsExpanded] = usePersistedExpanded('atalhoCompromissosLoja', false)

    // Filtra apenas compromissos da loja (com store_id)
    const storeAppointments = useMemo(() => {
        if (!userId) return []
        return appointments.filter(
            (a) =>
                (a.owner_id === userId || a.provider_profile_id === userId) &&
                (storeId ? a.store_id === storeId : !!a.store_id) &&
                // O PEDIDO de serviço fica em "Pedidos na loja" (aba Serviços): só o que a loja ACEITOU entra na agenda
                a.status !== 'pending'
        )
    }, [appointments, userId, storeId])

    // Foto/nome ATUAIS dos clientes (a cópia salva no agendamento fica velha)
    const people = useProfilesById(storeAppointments.map((a) => a.customer_id))
    const agendaHref = storeSlug ? `/compromissos/${storeSlug}` : '/compromissos'

    useEffect(() => {
        onHasItemsChange?.(storeAppointments.length > 0)
    }, [storeAppointments, onHasItemsChange]) // pendentes não entram na agenda (são pedidos de serviço, aceitos em "Pedidos na loja")
    const completedCount = storeAppointments.filter(a => a.status === 'completed').length
    const confirmedCount = storeAppointments.filter(a => a.status === 'confirmed').length

    const surfaceRgb = hexToRgb(colors.surface)
    const textPrimary = colors.textPrimary
    const textSecondary = colors.textSecondary
    const borderColor = colors.border

    // Skeleton
    if (loading) {
        return (
            <div className="mt-6 mb-6">
                <div
                    className="rounded-2xl p-6 pt-7 w-full"
                    style={{
                        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
                        backdropFilter: 'blur(12px)',
                        WebkitBackdropFilter: 'blur(12px)',
                        border: `1px solid ${borderColor}`,
                        boxShadow: colors.shadow,
                    }}
                >
                    <div className="flex items-center gap-2 mb-4">
                        {dragHandle}
                        <h2 className="text-xl font-black" style={{ color: textPrimary }}>Agenda da Loja</h2>
                    </div>
                    <div className="flex gap-3 overflow-x-auto pb-2">
                        {[1, 2, 3].map((i) => (
                            <div
                                key={i}
                                className="flex-shrink-0 w-[280px] h-24 rounded-xl animate-pulse"
                                style={{ background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)` }}
                            />
                        ))}
                    </div>
                </div>
            </div>
        )
    }

    // 3.0: o mesmo desenho do cartão "Pedidos na loja" — números coloridos, botões em pílula e linhas com a cor do estado na lateral
    const todayStr = new Date().toDateString()
    const todayCount = storeAppointments.filter((a) => a.status === 'confirmed' && new Date(`${a.date}T12:00:00`).toDateString() === todayStr).length
    const upcoming = storeAppointments
        .filter((a) => a.status === 'confirmed' && new Date(`${a.date}T${a.time}`).getTime() >= Date.now() - 60 * 60 * 1000)
        .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`))
        .slice(0, 6)
    const bodyV3 = (
        <>
            <StatChips items={[
                { label: 'Hoje', n: todayCount, color: '#d97706' },
                { label: 'Na agenda', n: confirmedCount, color: '#7c3aed' },
                { label: 'Feitos', n: completedCount, color: '#2563eb' },
            ]} />

            <div className="grid grid-cols-2 gap-2">
                <Link href={agendaHref} className="h-10 rounded-full text-[13px] font-black flex items-center justify-center transition active:scale-95" style={{ background: '#f97316', color: '#fff', textDecoration: 'none' }}>Ver agenda</Link>
                <Link href="/compromissos/agendar" className="h-10 rounded-full text-[13px] font-black flex items-center justify-center gap-1.5 transition active:scale-95" style={{ background: `${borderColor}40`, color: textPrimary, textDecoration: 'none' }}><Plus size={14} /> Novo compromisso</Link>
            </div>

            {upcoming.length === 0 ? (
                <div className="rounded-xl p-5 text-center" style={{ background: `${borderColor}20`, border: `1px dashed ${borderColor}` }}>
                    <p className="text-sm font-bold" style={{ color: textPrimary }}>Nenhum serviço na agenda pela frente</p>
                    <p className="text-xs mt-1" style={{ color: textSecondary }}>Os serviços que você aceitar em Pedidos na loja aparecem aqui.</p>
                </div>
            ) : (
                <div className="flex flex-col gap-2">
                    {upcoming.map((a) => {
                        const person = people.get(a.customer_id)
                        const isToday = new Date(`${a.date}T12:00:00`).toDateString() === todayStr
                        const dateStr = new Date(`${a.date}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }).replace('.', '')
                        return (
                            <Link
                                key={a.id}
                                href={agendaHref}
                                className="w-full rounded-2xl flex items-center gap-3 px-3.5 py-3 transition active:scale-[0.99]"
                                style={{ background: colors.surface, border: `1px solid ${borderColor}`, borderLeft: '4px solid #7c3aed', textDecoration: 'none' }}
                            >
                                <span className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 text-sm font-black" style={{ background: `${borderColor}60`, color: textPrimary }}>
                                    {person?.avatarUrl ? <img src={person.avatarUrl} alt="" className="w-full h-full object-cover" /> : (a.customer_slug || '?').charAt(0).toUpperCase()}
                                </span>
                                <span className="min-w-0 flex-1 flex flex-col gap-0.5">
                                    <span className="flex items-center gap-2 min-w-0">
                                        <span className="text-sm font-black truncate" style={{ color: textPrimary }}>@{a.customer_slug}</span>
                                        <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wide flex-shrink-0" style={{ background: '#7c3aed1f', color: '#7c3aed' }}>{isToday ? 'Hoje' : dateStr}</span>
                                    </span>
                                    <span className="text-xs truncate" style={{ color: textSecondary }}>{a.service_name}{a.duration_minutes ? ` · ${a.duration_minutes} min` : ''}</span>
                                </span>
                                <span className="text-sm font-black tabular-nums flex-shrink-0" style={{ color: textPrimary }}>{formatTime(a.time)}</span>
                            </Link>
                        )
                    })}
                </div>
            )}
        </>
    )

    // 3.0: o mesmo cartão de seção das outras partes do painel
    return (
            <>
            <V3Section
                title="Agenda da loja"
                subtitle={<><span style={{ color: '#7c3aed', fontWeight: 800 }}>{confirmedCount}</span> na agenda · <span style={{ color: '#2563eb', fontWeight: 800 }}>{completedCount}</span> feito{completedCount !== 1 ? 's' : ''}</>}
                expanded={isExpanded}
                onToggle={() => setIsExpanded(!isExpanded)}
                className="mb-6"
            >
                {bodyV3}
            </V3Section>

            {/* Estilos do scroll */}
            <style jsx>{`
                .scroll-container::-webkit-scrollbar {
                    height: 6px;
                }
                .scroll-container::-webkit-scrollbar-track {
                    background: transparent;
                }
                .scroll-container::-webkit-scrollbar-thumb {
                    background-color: #f9731640;
                    border-radius: 9999px;
                }
                .scroll-container::-webkit-scrollbar-thumb:hover {
                    background-color: #f97316;
                }
                .scroll-container {
                    scrollbar-width: thin;
                    scrollbar-color: #f9731640 transparent;
                }
            `}</style>
            </>
        )
}