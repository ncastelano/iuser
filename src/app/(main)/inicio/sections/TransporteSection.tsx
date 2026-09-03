// src/app/(main)/inicio/sections/TransporteSection.tsx
'use client'

import { ReactNode, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Briefcase, Loader2, Wrench, PaintRoller, Leaf, Zap, Sparkles, Hammer } from 'lucide-react'
import { useTheme } from '@/app/theme'
import { supabase } from '@/lib/supabase/client'
import { toast } from 'sonner'

// ===== GRADIENTE FIXO LARANJA-VERMELHO =====
const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

const SERVICE_ICONS: Record<string, any> = {
    pintor: PaintRoller,
    encanador: Wrench,
    jardineiro: Leaf,
    eletricista: Zap,
    diarista: Sparkles,
    montador: Hammer,
    outro: Briefcase,
}

const SERVICE_LABELS: Record<string, string> = {
    pintor: 'Pintor',
    encanador: 'Encanador',
    jardineiro: 'Jardineiro',
    eletricista: 'Eletricista',
    diarista: 'Diarista',
    montador: 'Montador de móveis',
}

function shortAddress(address: string): string {
    const firstPart = address.split(',')[0].trim()
    return firstPart.length > 24 ? firstPart.substring(0, 22) + '...' : firstPart
}

/* ─── Helper para converter hex em RGB ─── */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
    const clean = hex.replace('#', '')
    const bigint = parseInt(clean, 16)
    return {
        r: (bigint >> 16) & 255,
        g: (bigint >> 8) & 255,
        b: bigint & 255,
    }
}

interface JobRequest {
    id: string
    service_type: string
    custom_service: string | null
    location_address: string
    description: string
    created_at: string
}

interface TransporteSectionProps {
    dragHandle?: ReactNode
    onBreveStatusChange?: (isBreve: boolean) => void
}

export default function TransporteSection({ dragHandle, onBreveStatusChange }: TransporteSectionProps) {
    const { colors } = useTheme()
    const router = useRouter()
    const [loading, setLoading] = useState(true)
    const [loggedIn, setLoggedIn] = useState(false)
    const [jobs, setJobs] = useState<JobRequest[]>([])
    const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set())
    const [applyingId, setApplyingId] = useState<string | null>(null)

    useEffect(() => {
        onBreveStatusChange?.(false)
    }, [onBreveStatusChange])

    useEffect(() => {
        const load = async () => {
            setLoading(true)
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
                setLoggedIn(false)
                setLoading(false)
                return
            }
            setLoggedIn(true)

            const { data: requests } = await supabase
                .from('service_requests')
                .select('id, service_type, custom_service, location_address, description, created_at')
                .eq('status', 'pending')
                .neq('requester_id', user.id)
                .order('created_at', { ascending: false })
                .limit(10)

            setJobs(requests || [])

            const { data: myApplications } = await supabase
                .from('service_applications')
                .select('service_request_id')
                .eq('applicant_id', user.id)

            setAppliedIds(new Set((myApplications || []).map((a) => a.service_request_id)))
            setLoading(false)
        }
        load()
    }, [])

    const handleApply = async (jobId: string) => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            router.push('/login')
            return
        }

        setApplyingId(jobId)
        try {
            const { error } = await supabase.from('service_applications').insert({
                service_request_id: jobId,
                applicant_id: user.id,
            })
            if (error) throw error
            setAppliedIds((prev) => new Set(prev).add(jobId))
            toast.success('Candidatura enviada!')
        } catch (err: any) {
            toast.error('Erro ao se candidatar: ' + (err.message || 'tente novamente'))
        } finally {
            setApplyingId(null)
        }
    }

    const surfaceRgb = hexToRgb(colors.surface)

    return (
        <section>
            <div
                className="rounded-2xl p-6 relative"
                style={{
                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    border: `1px solid ${colors.border}`,
                    boxShadow: colors.shadow,
                    transform: 'translateZ(0)',
                    willChange: 'transform',
                }}
            >
                <div className="flex items-center gap-4 mb-4">
                    {dragHandle && <div>{dragHandle}</div>}

                    <div
                        className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{
                            background: GRADIENT,
                            color: '#ffffff',
                            boxShadow: `0 4px 12px #f9731640`,
                        }}
                    >
                        <Briefcase size={28} />
                    </div>

                    <div>
                        <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>
                            Pedidos de serviço abertos
                        </h3>
                        <p className="text-sm mt-1" style={{ color: colors.textSecondary }}>
                            Candidate-se e comece a ganhar dinheiro
                        </p>
                    </div>
                </div>

                {loading && (
                    <div className="flex justify-center py-4">
                        <Loader2 className="animate-spin" size={20} style={{ color: colors.textSecondary }} />
                    </div>
                )}

                {!loading && !loggedIn && (
                    <button
                        onClick={() => router.push('/login')}
                        className="w-full py-3 rounded-xl font-bold text-sm transition-all hover:scale-[1.02] active:scale-95"
                        style={{ background: GRADIENT, color: '#fff' }}
                    >
                        Entrar pra ver as vagas disponíveis
                    </button>
                )}

                {!loading && loggedIn && jobs.length === 0 && (
                    <p className="text-sm" style={{ color: colors.textSecondary }}>
                        Nenhum pedido de serviço aberto no momento.
                    </p>
                )}

                {!loading && loggedIn && jobs.length > 0 && (
                    <div className="flex flex-col gap-2">
                        {jobs.map((job) => {
                            const Icon = SERVICE_ICONS[job.service_type] || Briefcase
                            const label = job.service_type === 'outro' ? (job.custom_service || 'Outro') : (SERVICE_LABELS[job.service_type] || job.service_type)
                            const applied = appliedIds.has(job.id)
                            return (
                                <div
                                    key={job.id}
                                    className="rounded-xl px-3 py-3 flex items-center gap-3"
                                    style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}` }}
                                >
                                    <div
                                        className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                                        style={{ background: GRADIENT, color: '#fff' }}
                                    >
                                        <Icon size={16} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-bold truncate" style={{ color: colors.textPrimary }}>{label}</p>
                                        <p className="text-[11px] truncate" style={{ color: colors.textSecondary }}>{shortAddress(job.location_address)}</p>
                                    </div>
                                    <button
                                        onClick={() => handleApply(job.id)}
                                        disabled={applied || applyingId === job.id}
                                        className="flex-shrink-0 px-3 py-2 rounded-full text-[11px] font-bold transition-all disabled:opacity-70"
                                        style={
                                            applied
                                                ? { background: `${colors.border}30`, color: colors.textSecondary, border: `1px solid ${colors.border}` }
                                                : { background: GRADIENT, color: '#fff' }
                                        }
                                    >
                                        {applyingId === job.id ? (
                                            <Loader2 size={12} className="animate-spin" />
                                        ) : applied ? (
                                            'Candidatura enviada'
                                        ) : (
                                            'Candidatar-se'
                                        )}
                                    </button>
                                </div>
                            )
                        })}
                    </div>
                )}

                <button
                    onClick={() => router.push('/ser-parceiro-iuser')}
                    className="text-xs font-bold mt-3"
                    style={{ color: colors.accent }}
                >
                    ou cadastre-se como parceiro
                </button>
            </div>
        </section>
    )
}
