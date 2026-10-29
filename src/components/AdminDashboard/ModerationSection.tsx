// src/components/AdminDashboard/ModerationSection.tsx
//
// Admin → Denúncias: o conteúdo que as pessoas denunciaram (com o que diz, quem é o autor, por quê e quantas pessoas denunciaram) e o que está OCULTO agora. Três pessoas diferentes
// denunciando já ocultam sozinho até aqui; o admin decide: Ocultar, Manter (o conteúdo está certo: nunca mais é ocultado por denúncias) ou Restaurar. Cada decisão pede confirmação.
'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from '@/lib/toast'
import { callAdminApi } from '@/lib/callAdminApi'
import { Spinner } from '@/components/Spinner'
import type { ThemeColors } from '@/app/contexts/theme'
import { ADMIN_ACTIONS, reasonSummary, TARGET_LABEL, type ModerationAction, type ReportReason, type ReportTarget } from '@/modules/moderation'

interface Item { type: ReportTarget; id: string; text: string; image: string | null; extra: string | null; author: string | null; authorHiddenCount: number; reasons: ReportReason[]; notes: string[]; reporters: number; lastReportAt: string | null; status: 'hidden' | 'cleared' | null; source: 'reports' | 'admin' | null; decidedAt: string | null; modNote: string | null }

const fmt = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

export default function ModerationSection({ cardStyle, colors }: { cardStyle: React.CSSProperties; colors: ThemeColors }) {
    const [loading, setLoading] = useState(true)
    const [pending, setPending] = useState<Item[]>([])
    const [hidden, setHidden] = useState<Item[]>([])
    const [notes, setNotes] = useState<Record<string, string>>({})
    const [pick, setPick] = useState<{ key: string; action: ModerationAction } | null>(null)
    const [busy, setBusy] = useState(false)
    const [done, setDone] = useState<string | null>(null)

    const load = useCallback(async () => {
        try { const r = await callAdminApi<{ pending: Item[]; hidden: Item[] }>('/api/admin/moderation', { action: 'list' }); setPending(r.pending); setHidden(r.hidden) }
        catch (e: any) { toast.error(e?.message || 'Erro ao carregar') } finally { setLoading(false) }
    }, [])
    useEffect(() => { load() }, [load])

    const decide = async (it: Item, action: ModerationAction) => {
        setBusy(true)
        try {
            await callAdminApi('/api/admin/moderation', { action: 'decide', type: it.type, id: it.id, moderation: action, note: notes[`${it.type}:${it.id}`] || '' })
            const label = ADMIN_ACTIONS.find((a) => a.code === action)?.label
            toast.success(`Decisão registrada: ${label}.`); setDone(`Decisão registrada: ${label} (${TARGET_LABEL[it.type]}).`); setPick(null); await load()
        } catch (e: any) { toast.error(e?.message || 'Não deu certo.') } finally { setBusy(false) }
    }

    if (loading) return <div className="p-8 flex justify-center"><Spinner size={22} /></div>
    const soft = `${colors.border}40`

    const card = (it: Item) => {
        const key = `${it.type}:${it.id}`
        const chosen = pick?.key === key ? ADMIN_ACTIONS.find((a) => a.code === pick.action) : null
        return (
            <div key={key} className="rounded-2xl p-3 flex flex-col gap-1.5" style={{ background: soft, border: it.status === 'hidden' ? '1.5px solid #ef4444' : 'none' }}>
                <p className="text-[11px] font-black uppercase" style={{ color: '#f97316' }}>{TARGET_LABEL[it.type]}{it.extra ? ` · ${it.extra}` : ''}{it.status === 'hidden' ? ` · OCULTO (${it.source === 'reports' ? 'por denúncias' : 'pelo admin'})` : it.status === 'cleared' ? ' · mantido' : ''}</p>
                <p className="text-[13px] break-words" style={{ color: colors.textPrimary }}>{it.text || '(sem texto)'}</p>
                {it.image && <img src={it.image} alt="" className="w-28 h-28 object-cover rounded-xl" />}
                <p className="text-[11px]" style={{ color: colors.textSecondary }}>
                    Autor: <b>{it.author || 'desconhecido'}</b>{it.authorHiddenCount > 1 ? ` · ${it.authorHiddenCount} conteúdos dele já foram ocultados` : ''}
                    {it.reporters > 0 ? ` · ${it.reporters} pessoa(s) denunciaram: ${reasonSummary(it.reasons)}` : ''}{it.lastReportAt ? ` · última ${fmt(it.lastReportAt)}` : ''}
                </p>
                {it.notes.length > 0 && <p className="text-[11px] italic" style={{ color: colors.textSecondary }}>“{it.notes.join('” · “')}”</p>}
                {chosen ? (
                    <div className="rounded-2xl p-2.5 flex flex-col gap-2" style={{ background: colors.surface, border: '1.5px solid #f97316' }}>
                        <p className="text-[13px] font-black" style={{ color: colors.textPrimary }}>Confirmar: {chosen.label}</p>
                        <p className="text-[12px]" style={{ color: colors.textSecondary }}>{chosen.hint}</p>
                        <div className="grid grid-cols-2 gap-1.5">
                            <button onClick={() => setPick(null)} className="h-10 rounded-full text-[12px] font-black active:scale-95" style={{ background: soft, color: colors.textPrimary }}>Voltar</button>
                            <button onClick={() => decide(it, chosen.code)} disabled={busy} className="h-10 rounded-full text-[12px] font-black text-white active:scale-95 disabled:opacity-50" style={{ background: '#f97316' }}>{busy ? 'Enviando…' : 'Confirmar'}</button>
                        </div>
                    </div>
                ) : (
                    <>
                        <input value={notes[key] || ''} onChange={(e) => setNotes((n) => ({ ...n, [key]: e.target.value }))} placeholder="Motivo (o autor vê, se ocultar)" maxLength={500} className="h-10 px-3 rounded-full text-[13px] outline-none" style={{ background: colors.surface, color: colors.textPrimary }} />
                        <div className="grid grid-cols-3 gap-1.5">
                            {ADMIN_ACTIONS.filter((a) => (it.status === 'hidden' ? a.code !== 'hide' : a.code !== 'restore')).map((a) => (
                                <button key={a.code} title={a.hint} onClick={() => setPick({ key, action: a.code })} className="h-10 rounded-full text-[12px] font-black active:scale-95" style={a.code === 'hide' ? { background: '#ef4444', color: '#fff' } : { background: colors.surface, color: colors.textPrimary, border: `1.5px solid ${colors.border}` }}>{a.label}</button>
                            ))}
                        </div>
                    </>
                )}
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-4">
            <div style={cardStyle} className="p-4">
                <h2 className="text-lg font-black" style={{ color: colors.textPrimary }}>Denúncias</h2>
                <p className="text-xs" style={{ color: colors.textSecondary }}>Três pessoas diferentes denunciando ocultam o conteúdo até você decidir. Ocultar some para todos e avisa o autor; Manter diz que está certo e impede nova ocultação por denúncias.</p>
            </div>
            {done && (
                <div className="rounded-2xl p-3 flex items-center justify-between gap-2" style={{ background: '#22c55e18', border: '1.5px solid #22c55e' }}>
                    <p className="text-[13px] font-black" style={{ color: colors.textPrimary }}>✓ {done}</p>
                    <button onClick={() => setDone(null)} className="text-[11px] font-bold underline" style={{ color: colors.textSecondary }}>Ok</button>
                </div>
            )}
            <div style={cardStyle} className="p-4 flex flex-col gap-3">
                <h3 className="text-sm font-black" style={{ color: colors.textPrimary }}>Para analisar ({pending.length})</h3>
                {pending.length === 0 && <p className="text-xs" style={{ color: colors.textSecondary }}>Nenhuma denúncia nova.</p>}
                {pending.map(card)}
            </div>
            <div style={cardStyle} className="p-4 flex flex-col gap-3">
                <h3 className="text-sm font-black" style={{ color: colors.textPrimary }}>Ocultos agora ({hidden.length})</h3>
                {hidden.length === 0 && <p className="text-xs" style={{ color: colors.textSecondary }}>Nada oculto.</p>}
                {hidden.map(card)}
            </div>
        </div>
    )
}
