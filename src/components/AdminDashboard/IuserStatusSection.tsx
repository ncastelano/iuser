// src/components/AdminDashboard/IuserStatusSection.tsx
//
// Admin → iUser status: o ranking de pontos do maior pro menor, e, ao abrir uma pessoa, o extrato do PORQUÊ de cada ponto
// (o que foi, quantos pontos, dia e hora, e a quem/ao que se refere). Só leitura: os pontos vêm do livro-caixa do banco.
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Search } from 'lucide-react'
import { toast } from '@/lib/toast'
import { callAdminApi } from '@/lib/callAdminApi'
import { Spinner } from '@/components/Spinner'
import type { ThemeColors } from '@/app/contexts/theme'

interface RankRow { position: number; profileId: string; total: number; name: string | null; slug: string | null; avatarUrl: string | null; events: number; lastAt: string | null }
interface EventRow { id: string; at: string; action: string; label: string; points: number; detail: string | null }

const fmt = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })

export default function IuserStatusSection({ cardStyle, colors }: { cardStyle: React.CSSProperties; colors: ThemeColors }) {
    const [loading, setLoading] = useState(true)
    const [rows, setRows] = useState<RankRow[]>([])
    const [query, setQuery] = useState('')
    const [openId, setOpenId] = useState<string | null>(null)
    const [events, setEvents] = useState<Record<string, EventRow[] | 'loading'>>({})

    useEffect(() => {
        callAdminApi<{ ranking: RankRow[] }>('/api/admin/iuser-status', { action: 'list' })
            .then((r) => setRows(r.ranking))
            .catch((err) => toast.error(err.message || 'Erro ao carregar o ranking'))
            .finally(() => setLoading(false))
    }, [])

    const toggle = useCallback(async (id: string) => {
        if (openId === id) { setOpenId(null); return }
        setOpenId(id)
        if (events[id]) return
        setEvents((p) => ({ ...p, [id]: 'loading' }))
        try {
            const r = await callAdminApi<{ events: EventRow[] }>('/api/admin/iuser-status', { action: 'events', profileId: id })
            setEvents((p) => ({ ...p, [id]: r.events }))
        } catch (err: any) {
            toast.error(err.message || 'Erro ao carregar o extrato')
            setEvents((p) => { const n = { ...p }; delete n[id]; return n })
        }
    }, [openId, events])

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase().replace(/^@/, '')
        return q ? rows.filter((r) => (r.name || '').toLowerCase().includes(q) || (r.slug || '').toLowerCase().includes(q)) : rows
    }, [rows, query])

    if (loading) return <div style={cardStyle} className="flex justify-center py-8"><Spinner size={24} color={colors.accent} /></div>

    return (
        <div className="space-y-4">
            <div style={cardStyle} className="space-y-1">
                <p className="text-sm font-black" style={{ color: colors.textPrimary }}>iUser status</p>
                <p className="text-xs" style={{ color: colors.textSecondary }}>
                    Quem tem mais pontos primeiro. Toque numa pessoa para ver de onde vieram os pontos: o que ela fez, quantos pontos valeu, o dia e a hora, e quem ou o que estava envolvido.
                    O valor de cada ganho fica congelado na hora em que aconteceu; mudar a regra em Pontuação só vale daqui pra frente.
                </p>
                <div className="relative pt-2">
                    <Search size={14} className="absolute left-3 top-1/2 translate-y-[-30%]" style={{ color: colors.textSecondary }} />
                    <input
                        value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nome ou @usuário"
                        style={{ background: colors.background, border: `1px solid ${colors.border}`, color: colors.textPrimary, borderRadius: 12, padding: '8px 12px 8px 32px', fontSize: 13, width: '100%' }}
                    />
                </div>
            </div>

            {filtered.length === 0 ? (
                <div style={cardStyle}><p className="text-xs" style={{ color: colors.textSecondary }}>Ninguém encontrado.</p></div>
            ) : filtered.map((r) => {
                const open = openId === r.profileId
                const ev = events[r.profileId]
                return (
                    <div key={r.profileId} style={cardStyle} className="space-y-2">
                        <button onClick={() => toggle(r.profileId)} className="w-full flex items-center gap-3 text-left">
                            <span className="w-7 text-center text-xs font-black flex-shrink-0" style={{ color: colors.textSecondary }}>{r.position}º</span>
                            {r.avatarUrl
                                // eslint-disable-next-line @next/next/no-img-element
                                ? <img src={r.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                                : <span className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-black text-white" style={{ background: colors.accent }}>{(r.name || r.slug || '?').charAt(0).toUpperCase()}</span>}
                            <span className="min-w-0 flex-1">
                                <span className="block text-sm font-black truncate" style={{ color: colors.textPrimary }}>{r.name || 'Perfil'}</span>
                                <span className="block text-[11px] truncate" style={{ color: colors.textSecondary }}>
                                    {r.slug ? `@${r.slug} · ` : ''}{r.events} {r.events === 1 ? 'ganho' : 'ganhos'}{r.lastAt ? ` · último em ${fmt(r.lastAt)}` : ''}
                                </span>
                            </span>
                            <span className="text-sm font-black flex-shrink-0" style={{ color: '#f97316' }}>{r.total.toLocaleString('pt-BR')} pts</span>
                            {open ? <ChevronUp size={16} style={{ color: colors.textSecondary }} /> : <ChevronDown size={16} style={{ color: colors.textSecondary }} />}
                        </button>

                        {open && (
                            <div className="pt-2 space-y-1.5" style={{ borderTop: `1px solid ${colors.border}` }}>
                                {ev === 'loading' || !ev ? (
                                    <div className="flex justify-center py-3"><Spinner size={18} color={colors.accent} /></div>
                                ) : ev.length === 0 ? (
                                    <p className="text-xs" style={{ color: colors.textSecondary }}>Nenhum ganho registrado.</p>
                                ) : ev.map((e) => (
                                    <div key={e.id} className="flex items-start justify-between gap-3 text-xs">
                                        <span className="min-w-0">
                                            <span className="block font-bold" style={{ color: colors.textPrimary }}>{e.label}</span>
                                            {e.detail && <span className="block truncate" style={{ color: colors.textSecondary }}>{e.detail}</span>}
                                            <span className="block text-[10px]" style={{ color: colors.textSecondary }}>{fmt(e.at)}</span>
                                        </span>
                                        <span className="font-black flex-shrink-0" style={{ color: '#f97316' }}>+{e.points}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )
            })}
        </div>
    )
}
