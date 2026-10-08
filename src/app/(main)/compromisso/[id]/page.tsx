// app/(main)/compromisso/[id]/page.tsx
// Um agendamento compartilhado: público = qualquer um vê; privado = só quem participa (logado).
'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Calendar, Clock3, Lock, Globe, Store as StoreIcon, User, Users } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { Spinner } from '@/components/Spinner'
import PlanAvatarRing from '@/components/PlanAvatarRing'
import ShareAppointmentButton from '@/components/ShareAppointmentButton'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

interface SharedAppointment {
    id: string
    date: string
    time: string
    durationMinutes: number | null
    title: string
    status: 'confirmed' | 'pending' | 'cancelled' | 'completed'
    isPublic: boolean
    store: { name: string | null; slug: string | null; logoUrl: string | null } | null
    people: { id: string; name: string | null; profileSlug: string | null; avatarUrl: string | null; isViewer: boolean }[]
    viewerIsParticipant: boolean
}

type State = { kind: 'loading' } | { kind: 'ok'; data: SharedAppointment } | { kind: 'login' } | { kind: 'private' } | { kind: 'missing' } | { kind: 'error' }

const STATUS: Record<string, { label: string; bg: string; color: string }> = {
    confirmed: { label: 'Confirmado', bg: 'rgba(16,185,129,0.2)', color: '#10b981' },
    pending: { label: 'Pendente', bg: 'rgba(234,179,8,0.2)', color: '#d4a106' },
    cancelled: { label: 'Cancelado', bg: 'rgba(239,68,68,0.2)', color: '#ef4444' },
    completed: { label: 'Concluído', bg: 'rgba(96,165,250,0.2)', color: '#60a5fa' },
}

function formatDateLong(date: string) {
    const d = new Date(`${date}T12:00:00`)
    const txt = d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
    return txt.charAt(0).toUpperCase() + txt.slice(1)
}

export default function CompromissoPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params)
    const router = useRouter()
    const { colors } = useTheme()
    const { loading: profileLoading, profileSlug } = useProfile()
    const [state, setState] = useState<State>({ kind: 'loading' })

    useEffect(() => {
        if (profileLoading) return
        let cancelled = false
        ;(async () => {
            const { data: { session } } = await supabase.auth.getSession()
            const res = await fetch(`/api/appointments/${id}/share`, {
                headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
            })
            if (cancelled) return
            if (res.ok) return setState({ kind: 'ok', data: await res.json() })
            if (res.status === 401) return setState({ kind: 'login' })
            if (res.status === 403) return setState({ kind: 'private' })
            if (res.status === 404) return setState({ kind: 'missing' })
            setState({ kind: 'error' })
        })().catch(() => { if (!cancelled) setState({ kind: 'error' }) })
        return () => { cancelled = true }
    }, [id, profileLoading])

    const card: React.CSSProperties = { background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 24, boxShadow: colors.shadow }
    const loginHref = `/login?redirect=${encodeURIComponent(`/compromisso/${id}`)}`

    const message = (icon: React.ReactNode, title: string, text: string, action?: React.ReactNode) => (
        <div style={{ ...card, padding: 28, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            {icon}
            <h1 style={{ fontSize: 20, fontWeight: 900, color: colors.textPrimary }}>{title}</h1>
            <p style={{ color: colors.textSecondary, fontSize: 14, maxWidth: 320 }}>{text}</p>
            {action}
        </div>
    )
    const primary = (label: string, onClick: () => void) => (
        <button onClick={onClick} style={{ background: GRADIENT, color: '#fff', border: 'none', borderRadius: 16, padding: '12px 24px', fontWeight: 800, cursor: 'pointer' }}>{label}</button>
    )

    return (
        <main style={{ minHeight: '100vh', background: colors.background, padding: '32px 16px 80px' }}>
            <div style={{ maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
                <Link href="/" style={{ color: colors.accent, fontWeight: 900, fontSize: 18, textDecoration: 'none' }}>iUser</Link>

                {state.kind === 'loading' && <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner size={28} /></div>}

                {state.kind === 'login' && message(<Lock size={36} color={colors.textSecondary} />, 'Compromisso privado', 'Entre na sua conta para ver. Só quem participa do compromisso consegue abrir.', primary('Entrar', () => router.push(loginHref)))}
                {state.kind === 'private' && message(<Lock size={36} color={colors.textSecondary} />, 'Compromisso privado', 'Esse compromisso é privado e só quem participa dele pode ver.')}
                {state.kind === 'missing' && message(<Calendar size={36} color={colors.textSecondary} />, 'Compromisso não encontrado', 'O link pode estar errado ou o compromisso foi excluído.')}
                {state.kind === 'error' && message(<Calendar size={36} color={colors.textSecondary} />, 'Não foi possível abrir', 'Tente de novo em instantes.')}

                {state.kind === 'ok' && (() => {
                    const a = state.data
                    const st = STATUS[a.status] || STATUS.pending
                    return (
                        <div style={{ ...card, padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 800, color: colors.textSecondary }}>
                                    {a.isPublic ? <><Globe size={14} /> Público</> : <><Lock size={14} /> Privado · só quem participa vê</>}
                                </span>
                                <span style={{ background: st.bg, color: st.color, padding: '4px 12px', borderRadius: 12, fontWeight: 800, fontSize: 12 }}>{st.label}</span>
                            </div>

                            <h1 style={{ fontSize: 24, fontWeight: 900, color: colors.textPrimary, lineHeight: 1.2 }}>{a.title}</h1>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, color: colors.textSecondary }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Calendar size={16} /> {formatDateLong(a.date)}</span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <Clock3 size={16} /> {a.time.slice(0, 5)}{a.durationMinutes ? ` · ${a.durationMinutes} min` : ''}
                                </span>
                                {a.store && (
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        {a.store.logoUrl ? <img src={a.store.logoUrl} alt="" style={{ width: 20, height: 20, borderRadius: '50%', objectFit: 'cover' }} /> : <StoreIcon size={16} />}
                                        {a.store.slug ? <Link href={`/${a.store.slug}`} style={{ color: colors.accent, fontWeight: 700 }}>{a.store.name}</Link> : a.store.name}
                                    </span>
                                )}
                            </div>

                            {a.people.length > 0 && (
                                <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 14 }}>
                                    <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 800, color: colors.textSecondary, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                        <Users size={14} /> Quem participa
                                    </p>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                        {a.people.map((p) => {
                                            const inner = (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                    <PlanAvatarRing userId={p.id}>
                                                        {p.avatarUrl
                                                            ? <img src={p.avatarUrl} alt="" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover' }} />
                                                            : <span style={{ width: 44, height: 44, borderRadius: '50%', background: GRADIENT, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><User size={20} /></span>}
                                                    </PlanAvatarRing>
                                                    <div style={{ minWidth: 0 }}>
                                                        <p style={{ fontWeight: 800, color: colors.textPrimary, fontSize: 15 }}>{p.isViewer ? 'Você' : (p.name || (p.profileSlug ? `@${p.profileSlug}` : 'Usuário'))}</p>
                                                        {p.profileSlug && <p style={{ fontSize: 12, color: colors.textSecondary }}>@{p.profileSlug}</p>}
                                                    </div>
                                                </div>
                                            )
                                            return p.profileSlug ? <Link key={p.id} href={`/${p.profileSlug}`} style={{ textDecoration: 'none' }}>{inner}</Link> : <div key={p.id}>{inner}</div>
                                        })}
                                    </div>
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', borderTop: `1px solid ${colors.border}`, paddingTop: 14 }}>
                                <ShareAppointmentButton appointmentId={a.id} isPublic={a.isPublic} title={a.title} dateLabel={`${a.date.split('-').reverse().join('/')} às ${a.time.slice(0, 5)}`} variant="pill" color={colors.accent} />
                                {a.viewerIsParticipant && profileSlug && (
                                    <Link href={`/compromissos/${profileSlug}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: GRADIENT, color: '#fff', borderRadius: 14, padding: '10px 14px', fontWeight: 800, fontSize: 13, textDecoration: 'none' }}>
                                        <Calendar size={14} /> Abrir minha agenda
                                    </Link>
                                )}
                            </div>
                        </div>
                    )
                })()}
            </div>
        </main>
    )
}
