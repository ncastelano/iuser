// src/components/AdminDashboard/ForumAdminSection.tsx — Admin → Fórum (migration 20261130000087).
// Publicar a NOVIDADE de uma versão (o que entrou, melhorou e saiu: uma linha por item) e cuidar das IDEIAS: situação
// (em análise, planejada, fazendo, já entrou, não vai entrar), a resposta do iUser, ligar à versão em que entrou e esconder.
'use client'

import { useCallback, useEffect, useState } from 'react'
import { MessageSquare, Megaphone, EyeOff, Eye } from 'lucide-react'
import { toast } from '@/lib/toast'
import { callAdminApi } from '@/lib/callAdminApi'
import { Spinner } from '@/components/Spinner'
import type { ThemeColors } from '@/app/contexts/theme'
import { STATUS_INFO, score, type IdeaStatus } from '@/modules/forum/domain'

const ORANGE = '#f97316'
type Rel = { id: string; version: string; title: string; summary: string | null; added: string[]; improved: string[]; removed: string[]; released_at: string }
type AdminIdea = { id: string; title: string; body: string | null; status: IdeaStatus; status_note: string | null; release_id: string | null; up_count: number; down_count: number; comment_count: number; hidden: boolean; created_at: string; profiles: { name: string; profileSlug: string | null } | null }

export default function ForumAdminSection({ cardStyle, colors }: { cardStyle: React.CSSProperties; colors: ThemeColors }) {
    const [data, setData] = useState<{ releases: Rel[]; ideas: AdminIdea[] } | null>(null)
    const [busy, setBusy] = useState<string | null>(null)
    const empty = { id: '', version: '', title: '', summary: '', added: '', improved: '', removed: '' }
    const [rel, setRel] = useState(empty)

    const load = useCallback(async () => {
        try { setData(await callAdminApi('/api/admin/forum', { action: 'load' })) } catch (e: any) { toast.error(e?.message || 'Não foi possível carregar') }
    }, [])
    useEffect(() => { void load() }, [load])

    const act = async (key: string, body: Record<string, unknown>, ok: string) => {
        setBusy(key)
        try { await callAdminApi('/api/admin/forum', body); toast.success(ok); await load(); return true }
        catch (e: any) { toast.error(e?.message || 'Não deu certo'); return false }
        finally { setBusy(null) }
    }

    const input = { background: colors.background, border: `1px solid ${colors.border}`, color: colors.textPrimary }
    if (!data) return <div style={cardStyle} className="flex justify-center py-8"><Spinner size={24} color={ORANGE} /></div>
    const ideas = [...data.ideas].sort((a, b) => score({ up: b.up_count, down: b.down_count }) - score({ up: a.up_count, down: a.down_count }))

    return (
        <div className="flex flex-col gap-3">
            <div style={cardStyle} className="flex flex-col gap-2">
                <p className="text-sm font-black flex items-center gap-2" style={{ color: colors.textPrimary }}><Megaphone size={17} style={{ color: ORANGE }} /> {rel.id ? 'Editar novidade' : 'Publicar novidade de versão'}</p>
                <p className="text-xs" style={{ color: colors.textSecondary }}>Aparece em /forum → Novidades. Uma linha por item em cada lista.</p>
                <div className="grid grid-cols-[90px_1fr] gap-2">
                    <input value={rel.version} onChange={(e) => setRel({ ...rel, version: e.target.value.slice(0, 30) })} placeholder="3.1" className="h-10 px-3 rounded-xl text-sm" style={input} />
                    <input value={rel.title} onChange={(e) => setRel({ ...rel, title: e.target.value.slice(0, 120) })} placeholder="Título (ex.: Pedidos mais rápidos)" className="h-10 px-3 rounded-xl text-sm" style={input} />
                </div>
                <textarea value={rel.summary} onChange={(e) => setRel({ ...rel, summary: e.target.value.slice(0, 600) })} rows={2} placeholder="Resumo (opcional)" className="px-3 py-2 rounded-xl text-sm resize-none" style={input} />
                {([['added', 'O que entrou', '#16a34a'], ['improved', 'O que melhorou', '#0ea5e9'], ['removed', 'O que saiu', '#ef4444']] as const).map(([k, l, c]) => (
                    <label key={k} className="text-[11px] font-bold" style={{ color: c }}>{l}
                        <textarea value={(rel as any)[k]} onChange={(e) => setRel({ ...rel, [k]: e.target.value })} rows={3} className="mt-0.5 w-full px-3 py-2 rounded-xl text-sm resize-none font-normal" style={input} />
                    </label>
                ))}
                <div className="flex gap-2">
                    <button disabled={busy === 'rel'} onClick={async () => { if (await act('rel', { action: 'release', ...rel, id: rel.id || null }, rel.id ? 'Novidade atualizada' : 'Novidade publicada')) setRel(empty) }}
                        className="flex-1 h-10 rounded-full text-sm font-black text-white disabled:opacity-60" style={{ background: ORANGE }}>{busy === 'rel' ? 'Salvando…' : rel.id ? 'Salvar' : 'Publicar'}</button>
                    {rel.id && <button onClick={() => setRel(empty)} className="h-10 px-4 rounded-full text-sm font-bold" style={{ background: `${colors.border}40`, color: colors.textPrimary }}>Cancelar</button>}
                </div>
                {data.releases.length > 0 && (
                    <div className="mt-1 flex flex-col gap-1">
                        {data.releases.map((r) => (
                            <button key={r.id} onClick={() => setRel({ id: r.id, version: r.version, title: r.title, summary: r.summary || '', added: r.added.join('\n'), improved: r.improved.join('\n'), removed: r.removed.join('\n') })}
                                className="text-left text-xs px-3 py-2 rounded-xl" style={{ background: `${colors.border}20`, color: colors.textPrimary }}>
                                <b>v{r.version}</b> · {r.title} <span style={{ color: colors.textSecondary }}>· {new Date(r.released_at).toLocaleDateString('pt-BR')} · editar</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <div style={cardStyle} className="flex flex-col gap-2">
                <p className="text-sm font-black" style={{ color: colors.textPrimary }}>Ideias ({ideas.length}) · mais votadas primeiro</p>
                {ideas.length === 0 && <p className="text-xs" style={{ color: colors.textSecondary }}>Nenhuma ideia ainda.</p>}
                {ideas.map((i) => <IdeaAdmin key={i.id} i={i} releases={data.releases} colors={colors} busy={busy} act={act} input={input} />)}
            </div>
        </div>
    )
}

function IdeaAdmin({ i, releases, colors, busy, act, input }: { i: AdminIdea; releases: Rel[]; colors: ThemeColors; busy: string | null; act: (k: string, b: Record<string, unknown>, ok: string) => Promise<boolean>; input: React.CSSProperties }) {
    const [status, setStatus] = useState<IdeaStatus>(i.status)
    const [note, setNote] = useState(i.status_note || '')
    const [release, setRelease] = useState(i.release_id || '')
    const [reply, setReply] = useState('')
    const save = (hidden = i.hidden) => act('idea-' + i.id, { action: 'idea', idea: i.id, status, note, release: release || null, hidden }, hidden !== i.hidden ? (hidden ? 'Ideia escondida' : 'Ideia visível de novo') : 'Ideia atualizada')
    return (
        <div className="rounded-xl p-3 flex flex-col gap-2" style={{ background: `${colors.border}20`, opacity: i.hidden ? 0.6 : 1 }}>
            <div className="flex items-start gap-2">
                <span className="text-[14px] font-black w-10 text-center flex-shrink-0" style={{ color: ORANGE }}>{i.up_count - i.down_count}</span>
                <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-black" style={{ color: colors.textPrimary }}>{i.title}{i.hidden && ' (escondida)'}</p>
                    <p className="text-[11px]" style={{ color: colors.textSecondary }}>{i.profiles?.profileSlug ? `@${i.profiles.profileSlug}` : i.profiles?.name} · ▲{i.up_count} ▼{i.down_count} · {i.comment_count} comentários</p>
                    {i.body && <p className="text-[12px] mt-1" style={{ color: colors.textPrimary }}>{i.body}</p>}
                </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
                <select value={status} onChange={(e) => setStatus(e.target.value as IdeaStatus)} className="h-9 px-2 rounded-lg text-xs" style={input}>
                    {(Object.keys(STATUS_INFO) as IdeaStatus[]).map((s) => <option key={s} value={s}>{STATUS_INFO[s].label}</option>)}
                </select>
                <select value={release} onChange={(e) => setRelease(e.target.value)} className="h-9 px-2 rounded-lg text-xs" style={input}>
                    <option value="">Entrou em qual versão?</option>
                    {releases.map((r) => <option key={r.id} value={r.id}>v{r.version} · {r.title}</option>)}
                </select>
            </div>
            <input value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} placeholder="Resposta do iUser que aparece na ideia (opcional)" className="h-9 px-3 rounded-lg text-xs" style={input} />
            <div className="flex flex-wrap gap-2">
                <button disabled={busy === 'idea-' + i.id} onClick={() => save()} className="h-8 px-3 rounded-full text-[11.5px] font-black text-white" style={{ background: ORANGE }}>Salvar</button>
                <button onClick={() => save(!i.hidden)} className="h-8 px-3 rounded-full text-[11.5px] font-black flex items-center gap-1" style={{ background: `${colors.border}40`, color: colors.textPrimary }}>
                    {i.hidden ? <><Eye size={13} /> Mostrar</> : <><EyeOff size={13} /> Esconder</>}
                </button>
            </div>
            <div className="flex gap-2">
                <input value={reply} onChange={(e) => setReply(e.target.value.slice(0, 600))} placeholder="Comentar como Equipe iUser" className="flex-1 min-w-0 h-9 px-3 rounded-lg text-xs" style={input} />
                <button disabled={!reply.trim()} onClick={async () => { if (await act('team-' + i.id, { action: 'team_comment', idea: i.id, body: reply }, 'Resposta publicada')) setReply('') }}
                    className="h-9 px-3 rounded-lg text-[11.5px] font-black flex items-center gap-1 disabled:opacity-50" style={{ background: `${ORANGE}1f`, color: ORANGE }}><MessageSquare size={13} /> Enviar</button>
            </div>
        </div>
    )
}
