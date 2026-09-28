// components/ProfileDashboard/MyTasks.tsx
//
// "Tarefas" — pra quem é funcionário (vinculado por conta, não só nome/
// telefone) de uma ou mais lojas: mesmas entregas que antes só davam pra
// ver pelo link mágico do WhatsApp (/entregador/[token]), agora direto no
// próprio perfil, autenticado pela conta. Só aparece pra quem realmente
// tem alguma tarefa ativa (employees.user_id = essa pessoa).
'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePersistedExpanded } from '@/hooks/usePersistedExpanded'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { toast } from 'sonner'
import { hexToRgb } from '@/lib/color'
import { paymentMethodLabel } from '@/lib/payment'
import { Briefcase, ChevronDown, ChevronUp, CheckCircle2, MapPin, Store } from 'lucide-react'
import { Spinner } from '@/components/Spinner'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

interface Stop {
    assignmentId: string
    sequence: number
    status: 'pending' | 'in_transit' | 'delivered'
    orderStatus: string
    address: string
    buyerName: string
    paymentMethod: string
    cashChangeFor: number | null
    totalAmount: number
    deliveryFee: number
    items: { productName: string; quantity: number }[]
}

interface Job {
    employeeId: string
    storeId: string
    storeName: string
    stops: Stop[]
}

const STATUS_INFO: Record<Stop['status'], { label: string; color: string }> = {
    pending: { label: 'Pendente', color: '#94a3b8' },
    in_transit: { label: 'A caminho', color: '#f59e0b' },
    delivered: { label: 'Entregue', color: '#22c55e' },
}

export default function MyTasks() {
    const { colors } = useTheme()
    const surfaceRgb = hexToRgb(colors.surface)

    const [isExpanded, setIsExpanded] = usePersistedExpanded('myTasks', true)
    const [jobs, setJobs] = useState<Job[]>([])
    const [loading, setLoading] = useState(true)
    const [updatingId, setUpdatingId] = useState<string | null>(null)

    const load = useCallback(async () => {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) { setLoading(false); return }
        try {
            const res = await fetch('/api/employee/my-tasks', {
                headers: { Authorization: `Bearer ${session.access_token}` },
            })
            const json = await res.json()
            setJobs(json.jobs || [])
        } catch {
            // silencioso — se der erro, a seção some (não tem tarefa nenhuma exibida)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        load()
        const poll = setInterval(load, 30000)
        return () => clearInterval(poll)
    }, [load])

    const updateStatus = async (stop: Stop, nextStatus: 'in_transit' | 'delivered') => {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return
        setUpdatingId(stop.assignmentId)
        try {
            const res = await fetch('/api/employee/my-tasks/status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
                body: JSON.stringify({ assignmentId: stop.assignmentId, status: nextStatus }),
            })
            if (!res.ok) {
                const json = await res.json().catch(() => ({}))
                throw new Error(json.error || '')
            }
            await load()
        } catch (err: any) {
            toast.error(err.message || 'Não foi possível atualizar. Tenta de novo.')
        } finally {
            setUpdatingId(null)
        }
    }

    const textPrimary = colors.textPrimary
    const textSecondary = colors.textSecondary

    const totalOpen = jobs.reduce((sum, j) => sum + j.stops.filter((s) => s.status !== 'delivered').length, 0)

    // Sem tarefa nenhuma (não é funcionário de ninguém, ou nada pendente hoje) —
    // a seção nem aparece, pra não poluir o perfil de quem não usa isso.
    if (!loading && jobs.length === 0) return null

    return (
        <div className="mb-6">
            <div
                className="rounded-2xl p-6 pt-7 flex flex-col gap-5 relative"
                style={{
                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
                    backdropFilter: 'blur(12px)',
                    border: `1px solid ${colors.border}`,
                    boxShadow: colors.shadow,
                }}
            >
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="w-full flex items-center justify-between text-left"
                    style={{ padding: '0.5rem 0.75rem', borderRadius: '9999px', background: 'transparent', border: 'none', cursor: 'pointer' }}
                >
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: GRADIENT, color: '#ffffff' }}>
                            <Briefcase size={24} />
                        </div>
                        <div>
                            <h3 className="text-lg font-black" style={{ color: textPrimary }}>Tarefas</h3>
                            <p className="text-xs mt-0.5" style={{ color: textSecondary }}>
                                {loading ? 'Carregando...' : `${totalOpen} entrega${totalOpen !== 1 ? 's' : ''} pra fazer`}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {totalOpen > 0 && (
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: '#f9731620', color: '#f97316' }}>
                                {totalOpen}
                            </span>
                        )}
                        {isExpanded ? <ChevronUp size={22} style={{ color: textSecondary }} /> : <ChevronDown size={22} style={{ color: textSecondary }} />}
                    </div>
                </button>

                {isExpanded && (
                    loading ? (
                        <div className="flex justify-center py-6"><Spinner size={22} color={colors.accent} /></div>
                    ) : (
                        <div className="flex flex-col gap-5">
                            {jobs.map((job) => (
                                <div key={job.employeeId} className="flex flex-col gap-2">
                                    <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider" style={{ color: textSecondary }}>
                                        <Store size={13} /> {job.storeName}
                                    </div>

                                    {job.stops.length === 0 ? (
                                        <p className="text-xs" style={{ color: textSecondary }}>Nenhuma entrega no momento.</p>
                                    ) : (
                                        job.stops.map((stop) => {
                                            const payment = paymentMethodLabel(stop.paymentMethod)
                                            const status = STATUS_INFO[stop.status]
                                            const isUpdating = updatingId === stop.assignmentId
                                            const readyToPickUp = stop.orderStatus === 'ready' || stop.status !== 'pending'
                                            const troco = stop.cashChangeFor != null ? stop.cashChangeFor - Number(stop.totalAmount || 0) : null
                                            return (
                                                <div
                                                    key={stop.assignmentId}
                                                    className="rounded-2xl p-3"
                                                    style={{ background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`, border: `1px solid ${colors.border}` }}
                                                >
                                                    <div className="flex items-center justify-between mb-1.5">
                                                        <div className="flex items-center gap-2">
                                                            <span
                                                                className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black text-white flex-shrink-0"
                                                                style={{ background: '#f97316' }}
                                                            >
                                                                {stop.sequence}
                                                            </span>
                                                            <span className="text-xs font-bold" style={{ color: textPrimary }}>{stop.buyerName}</span>
                                                        </div>
                                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: `${status.color}20`, color: status.color }}>
                                                            {status.label}
                                                        </span>
                                                    </div>

                                                    <div className="flex items-start gap-1.5 text-[11px] mb-1.5" style={{ color: textPrimary }}>
                                                        <MapPin size={12} className="flex-shrink-0 mt-0.5" style={{ color: '#f97316' }} />
                                                        <span>{stop.address}</span>
                                                    </div>

                                                    {stop.items.length > 0 && (
                                                        <ul className="text-[10px] list-disc list-inside mb-1.5" style={{ color: textSecondary }}>
                                                            {stop.items.map((item, i) => (
                                                                <li key={i}>{item.quantity}x {item.productName}</li>
                                                            ))}
                                                        </ul>
                                                    )}

                                                    <div className="text-[10px] mb-2" style={{ color: textSecondary }}>
                                                        {payment.text} · Total R$ {Number(stop.totalAmount || 0).toFixed(2)}
                                                        {stop.deliveryFee > 0 && ` · Frete R$ ${Number(stop.deliveryFee).toFixed(2)}`}
                                                    </div>

                                                    {payment.warning && (
                                                        <div className="text-[10px] font-bold mb-2" style={{ color: '#ef4444' }}>
                                                            {payment.warning}
                                                            {troco != null && troco > 0 && ` · Levar R$ ${troco.toFixed(2)} de troco`}
                                                        </div>
                                                    )}

                                                    {stop.status !== 'delivered' && (
                                                        <div className="flex gap-2">
                                                            {stop.status === 'pending' && !readyToPickUp && (
                                                                <div className="flex-1 py-2 rounded-full text-[10px] font-bold text-center opacity-70" style={{ background: colors.border, color: textSecondary }}>
                                                                    Aguardando a loja preparar
                                                                </div>
                                                            )}
                                                            {stop.status === 'pending' && readyToPickUp && (
                                                                <button
                                                                    onClick={() => updateStatus(stop, 'in_transit')}
                                                                    disabled={isUpdating}
                                                                    className="flex-1 py-2 rounded-full text-[10px] font-bold disabled:opacity-50"
                                                                    style={{ background: colors.border, color: textPrimary }}
                                                                >
                                                                    {isUpdating ? <Spinner size={12} /> : 'Peguei o pedido'}
                                                                </button>
                                                            )}
                                                            {readyToPickUp && (
                                                                <button
                                                                    onClick={() => updateStatus(stop, 'delivered')}
                                                                    disabled={isUpdating}
                                                                    className="flex-1 py-2 rounded-full text-[10px] font-bold text-white disabled:opacity-50 flex items-center justify-center gap-1"
                                                                    style={{ background: GRADIENT }}
                                                                >
                                                                    {isUpdating ? <Spinner size={12} /> : <><CheckCircle2 size={12} /> Entreguei</>}
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        })
                                    )}
                                </div>
                            ))}
                        </div>
                    )
                )}
            </div>
        </div>
    )
}
