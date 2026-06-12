// components/AtalhoCompromissosDaLoja.tsx
import { ReactNode, useMemo, useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Clock3, Plus, Check, X, Store, MapPin } from 'lucide-react'
import { useAppointments, useDeleteAppointment } from '@/app/(main)/compromissos/dadosDoCompromisso'
import { supabase } from '@/lib/supabase/client'

interface AtalhoCompromissosDaLojaProps {
    dragHandle?: ReactNode
}

function parseDateTime(date: string, time: string) {
    const [y, m, d] = date.split('-').map(Number)
    const [h, min] = time.split(':').map(Number)
    return new Date(y, m - 1, d, h, min).getTime()
}

function formatTime(time: string) {
    return time.slice(0, 5)
}

function AppointmentAvatar({ url, name, size = 40 }: { url: string | null; name: string; size?: number }) {
    const hasValidUrl = url && url.trim().length > 0
    if (hasValidUrl) return <img src={url} alt={name} style={{ width: size, height: size, borderRadius: 10, objectFit: 'cover' }} />
    return (
        <div style={{ width: size, height: size, borderRadius: 10, background: 'linear-gradient(135deg, #f97316, #fbbf24)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: size * 0.35 }}>
            {name?.charAt(0)?.toUpperCase() || '?'}
        </div>
    )
}

export default function AtalhoCompromissosDaLoja({ dragHandle }: AtalhoCompromissosDaLojaProps) {
    const { appointments, loading, refetch } = useAppointments()
    const { deleteAppointment } = useDeleteAppointment()

    const [userId, setUserId] = useState<string | null>(null)
    const [storeIds, setStoreIds] = useState<string[]>([])
    const [showPending, setShowPending] = useState(true)

    useEffect(() => {
        supabase.auth.getSession().then(async ({ data: { session } }) => {
            if (session?.user) {
                setUserId(session.user.id)
                const { data: ownedStores } = await supabase.from('stores').select('id').eq('owner_id', session.user.id)
                const ids = new Set<string>()
                ownedStores?.forEach(s => ids.add(s.id))
                setStoreIds(Array.from(ids))
            }
        })
    }, [])

    const storeAppointments = useMemo(() => {
        if (!storeIds.length) return []
        return appointments.filter(a => a.store_id && storeIds.includes(a.store_id))
    }, [appointments, storeIds])

    const filtered = useMemo(() => {
        if (!showPending) return storeAppointments.filter(a => a.status !== 'pending')
        return storeAppointments
    }, [storeAppointments, showPending])

    const sorted = useMemo(() => {
        return [...filtered].sort((a, b) => parseDateTime(a.date, a.time) - parseDateTime(b.date, b.time))
    }, [filtered])

    const grouped = useMemo(() => {
        const groups: Record<string, typeof sorted> = {}
        sorted.forEach(appt => {
            const key = appt.store_id!
            if (!groups[key]) groups[key] = []
            groups[key].push(appt)
        })
        return groups
    }, [sorted])

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

    if (loading) {
        return (
            <section>
                <div className="flex items-center gap-2 mb-3">
                    {dragHandle}

                    <h2 className="text-xl font-black text-white">Compromissos das Lojas</h2>
                </div>
                <div className="flex flex-col gap-3">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="h-20 rounded-xl animate-pulse w-full" style={{ background: 'rgba(255, 255, 255, 0.06)' }} />
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
                    <h2 className="text-xl font-black text-white">Compromissos das Lojas</h2>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-white/70 font-medium select-none">Pendentes</span>
                        <label className="relative inline-flex items-center cursor-pointer" style={{ width: 44, height: 24 }}>
                            <input type="checkbox" className="sr-only peer" checked={showPending} onChange={e => setShowPending(e.target.checked)} />
                            <span className={`absolute inset-0 rounded-full transition-colors duration-200 ${showPending ? 'bg-purple-500' : 'bg-gray-600'}`} />
                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${showPending ? 'translate-x-5' : 'translate-x-0'}`} />
                        </label>
                    </div>
                    {sorted.length > 0 && (
                        <Link href="/compromissos" className="text-xs font-bold text-purple-300 bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-full transition-colors whitespace-nowrap" style={{ backdropFilter: 'blur(10px)' }}>Ver todos</Link>
                    )}
                </div>
            </div>

            {Object.keys(grouped).length === 0 ? (
                <div className="rounded-2xl p-5 flex items-center justify-between" style={{ background: 'rgba(255, 255, 255, 0.06)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                    <p className="text-white/70 font-medium text-sm">Nenhum compromisso nas lojas.</p>
                    <Link href="/compromissos/agendar" className="inline-flex items-center gap-1.5 px-4 py-2 bg-purple-600 text-white rounded-full font-bold text-sm hover:bg-purple-700 transition-colors shadow-md whitespace-nowrap">
                        <Plus size={14} /> Criar
                    </Link>
                </div>
            ) : (
                <div className="flex flex-col gap-6">
                    {Object.entries(grouped).map(([storeId, storeApps]) => {
                        const storeName = storeApps[0]?.store_name || 'Loja'
                        return (
                            <div key={storeId}>
                                <div className="flex items-center gap-2 mb-2">
                                    <Store className="w-4 h-4 text-orange-400" />
                                    <h3 className="text-sm font-semibold text-white/80">{storeName}</h3>
                                </div>
                                <div className="flex flex-col gap-2">
                                    {storeApps.map(appointment => {
                                        const isIncomingPending = appointment.direction === 'incoming' && appointment.status === 'pending'
                                        const statusColor = appointment.status === 'confirmed' ? 'bg-green-400/20 text-green-300' : appointment.status === 'pending' ? 'bg-yellow-400/20 text-yellow-300' : 'bg-red-400/20 text-red-300'
                                        return (
                                            <Link key={appointment.id} href="/compromissos" className="flex items-center gap-3 p-3 rounded-xl border shadow-sm hover:shadow-md transition-all"
                                                style={{
                                                    background: 'rgba(255, 255, 255, 0.06)',
                                                    backdropFilter: 'blur(12px)',
                                                    WebkitBackdropFilter: 'blur(12px)',
                                                    borderColor: isIncomingPending ? 'rgba(251, 191, 36, 0.4)' : 'rgba(255, 255, 255, 0.1)',
                                                    textDecoration: 'none',
                                                    color: 'inherit',
                                                }}>
                                                <div className="flex-shrink-0">
                                                    <AppointmentAvatar url={appointment.store_logo_url ?? null} name={appointment.store_name || 'Loja'} size={44} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs font-medium text-white/50">{new Date(appointment.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</span>
                                                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${statusColor}`}>{appointment.status === 'confirmed' ? 'Confirmado' : appointment.status === 'pending' ? 'Pendente' : appointment.status}</span>
                                                        {isIncomingPending && <span className="text-[10px] font-bold text-amber-300 bg-amber-400/20 px-1.5 py-0.5 rounded-full">Convite</span>}
                                                    </div>
                                                    <h4 className="font-bold text-white text-sm mt-0.5 truncate">{appointment.service_name}</h4>
                                                    <p className="text-xs text-white/50 truncate flex items-center gap-1 mt-0.5"><MapPin size={10} /> {appointment.store_name}</p>
                                                </div>
                                                <div className="flex-shrink-0 flex flex-col items-end gap-1.5">
                                                    <span className="text-base font-black text-purple-300 tabular-nums">{formatTime(appointment.time)}</span>
                                                    {isIncomingPending ? (
                                                        <div className="flex items-center gap-1">
                                                            <button onClick={e => handleAccept(appointment.id, e)} className="p-1 bg-green-500 text-white rounded-full hover:bg-green-600 transition-colors"><Check size={12} /></button>
                                                            <button onClick={e => handleDecline(appointment.id, e)} className="p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"><X size={12} /></button>
                                                        </div>
                                                    ) : (
                                                        <button onClick={e => handleDelete(appointment.id, e)} className="text-white/50 hover:text-red-400 transition-colors p-0.5"><X size={14} /></button>
                                                    )}
                                                </div>
                                            </Link>
                                        )
                                    })}
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </section>
    )
}