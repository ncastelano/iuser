// src/components/AdminDashboard/CampaignsSection.tsx — Admin → Avisos. Escreve um aviso (título, texto e um link do iUser),
// escolhe quem recebe (todos, lojistas ou pessoas pelo @), vê quantas pessoas recebem e envia. Só recebe quem ligou "Ofertas".
'use client'

import { useCallback, useEffect, useState } from 'react'
import { Send, Users } from 'lucide-react'
import { toast } from '@/lib/toast'
import { callAdminApi } from '@/lib/callAdminApi'
import { Spinner } from '@/components/Spinner'
import type { ThemeColors } from '@/app/contexts/theme'
import { validateCampaign, type CampaignAudience } from '@/modules/campaigns/domain'

const ORANGE = '#f97316'
type Campaign = { id: string; title: string; body: string; url: string; audience: string; recipients: number; sent_count: number; created_at: string; finished_at: string | null }
const AUDIENCES: { id: CampaignAudience; label: string }[] = [
    { id: 'all', label: 'Todos' },
    { id: 'lojistas', label: 'Lojistas' },
    { id: 'people', label: 'Pessoas escolhidas' },
]

export default function CampaignsSection({ cardStyle, colors }: { cardStyle: React.CSSProperties; colors: ThemeColors }) {
    const [list, setList] = useState<Campaign[] | null>(null)
    const [audience, setAudience] = useState<CampaignAudience>('all')
    const [title, setTitle] = useState('')
    const [body, setBody] = useState('')
    const [url, setUrl] = useState('/')
    const [slugs, setSlugs] = useState('')
    const [people, setPeople] = useState<{ id: string; name: string; profileSlug: string }[]>([])
    const [count, setCount] = useState<number | null>(null)
    const [busy, setBusy] = useState<string | null>(null)
    const [progress, setProgress] = useState<{ sent: number; remaining: number } | null>(null)

    const load = useCallback(async () => {
        try { const r: any = await callAdminApi('/api/admin/campaigns', { action: 'list' }); setList(r.campaigns || []) }
        catch (e: any) { toast.error(e?.message || 'Não foi possível carregar') }
    }, [])
    useEffect(() => { void load() }, [load])

    const input = { background: colors.background, border: `1px solid ${colors.border}`, color: colors.textPrimary }
    const pickIds = () => people.map((p) => p.id)

    const resolvePeople = async () => {
        const list = slugs.split(/[\s,]+/).filter(Boolean)
        setBusy('resolve')
        try { const r: any = await callAdminApi('/api/admin/campaigns', { action: 'resolve', slugs: list }); setPeople(r.people || []); setCount(null) }
        catch (e: any) { toast.error(e?.message || 'Não foi possível buscar') }
        finally { setBusy(null) }
    }

    const preview = async () => {
        setBusy('preview')
        try {
            const r: any = await callAdminApi('/api/admin/campaigns', { action: 'preview', audience, ids: pickIds() })
            setCount(r.recipients ?? 0)
        } catch (e: any) { toast.error(e?.message || 'Não foi possível calcular') }
        finally { setBusy(null) }
    }

    const send = async () => {
        const bad = validateCampaign({ title, body, url })
        if (bad) { toast.error(bad); return }
        if (audience === 'people' && people.length === 0) { toast.error('Escolha pelo menos uma pessoa.'); return }
        if (!window.confirm(`Enviar "${title.trim()}" para ${count ?? 'as'} pessoas? Não dá para desfazer.`)) return
        setBusy('send')
        try {
            const created: any = await callAdminApi('/api/admin/campaigns', { action: 'create', title, body, url, audience, ids: pickIds() })
            let sent = 0
            let remaining = Infinity
            while (remaining > 0) {
                const step: any = await callAdminApi('/api/admin/campaigns', { action: 'send', id: created.id })
                sent += step.sent ?? 0
                remaining = step.remaining ?? 0
                setProgress({ sent, remaining })
                if ((step.sent ?? 0) === 0 && remaining > 0) break
            }
            toast.success(remaining === 0 ? `Aviso enviado para ${sent} aparelho(s)` : `Enviado ${sent}; faltam ${remaining}. Toque em enviar de novo para continuar.`)
            setTitle(''); setBody(''); setUrl('/'); setCount(null)
            await load()
        } catch (e: any) {
            toast.error(e?.message || 'Não foi possível enviar')
        } finally {
            setBusy(null)
            setProgress(null)
        }
    }

    return (
        <div className="flex flex-col gap-3">
            <div style={cardStyle} className="rounded-3xl p-4 flex flex-col gap-3">
                <p className="text-sm font-black flex items-center gap-2" style={{ color: colors.textPrimary }}><Send size={17} style={{ color: ORANGE }} /> Buzina</p>
                <p className="text-xs" style={{ color: colors.textSecondary }}>Vai para a barra do aparelho de quem ligou "Ofertas e promoções". O link tem que ser uma página do iUser (começa com /).</p>

                <div className="flex gap-2 flex-wrap">
                    {AUDIENCES.map((a) => (
                        <button key={a.id} onClick={() => { setAudience(a.id); setCount(null) }}
                            className="h-9 px-3.5 rounded-full text-[12.5px] font-black"
                            style={audience === a.id ? { background: ORANGE, color: '#fff' } : { background: `${colors.border}40`, color: colors.textPrimary }}>{a.label}</button>
                    ))}
                </div>

                {audience === 'people' && (
                    <div className="flex flex-col gap-2">
                        <div className="flex gap-2">
                            <input value={slugs} onChange={(e) => setSlugs(e.target.value)} placeholder="@pessoa1, @pessoa2" className="flex-1 h-10 px-3 rounded-xl text-sm" style={input} />
                            <button disabled={busy === 'resolve'} onClick={resolvePeople} className="h-10 px-4 rounded-full text-sm font-black text-white disabled:opacity-60" style={{ background: ORANGE }}>Buscar</button>
                        </div>
                        {people.length > 0 && <p className="text-xs" style={{ color: colors.textSecondary }}>Escolhidas: {people.map((p) => p.name || `@${p.profileSlug}`).join(', ')}</p>}
                    </div>
                )}

                <input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 80))} placeholder="Título (ex.: Promoção de fim de semana)" className="h-11 px-3.5 rounded-xl text-sm" style={input} />
                <textarea value={body} onChange={(e) => setBody(e.target.value.slice(0, 240))} rows={3} placeholder="Texto do aviso (até 240 letras)" className="px-3.5 py-2.5 rounded-xl text-sm resize-none" style={input} />
                <input value={url} onChange={(e) => setUrl(e.target.value.slice(0, 300))} placeholder="/publicacao-ou-loja" className="h-11 px-3.5 rounded-xl text-sm" style={input} />

                <div className="flex items-center gap-2 flex-wrap">
                    <button disabled={!!busy} onClick={preview} className="h-10 px-4 rounded-full text-sm font-black disabled:opacity-60 flex items-center gap-1.5" style={{ background: `${colors.border}40`, color: colors.textPrimary }}>
                        <Users size={15} /> {busy === 'preview' ? 'Contando…' : 'Ver quantas pessoas'}
                    </button>
                    {count !== null && <span className="text-sm font-black" style={{ color: colors.textPrimary }}>{count} {count === 1 ? 'pessoa vai receber' : 'pessoas vão receber'}</span>}
                </div>

                <button disabled={!!busy || count === null || count === 0} onClick={send}
                    className="h-12 rounded-full text-sm font-black text-white disabled:opacity-50 flex items-center justify-center gap-2" style={{ background: ORANGE }}>
                    {busy === 'send' && progress ? `Enviando… ${progress.sent} · faltam ${progress.remaining}` : busy === 'send' ? 'Enviando…' : 'Tocar a buzina'}
                </button>
                {count === null && <p className="text-[11px]" style={{ color: colors.textSecondary }}>Veja quantas pessoas recebem antes de enviar.</p>}
            </div>

            <div style={cardStyle} className="rounded-3xl p-4 flex flex-col gap-2">
                <p className="text-sm font-black" style={{ color: colors.textPrimary }}>Últimos avisos</p>
                {list === null ? <div className="flex justify-center py-6"><Spinner size={22} color={ORANGE} /></div>
                    : list.length === 0 ? <p className="text-xs" style={{ color: colors.textSecondary }}>Nenhum aviso enviado ainda.</p>
                        : list.map((c) => (
                            <div key={c.id} className="rounded-2xl px-3 py-2" style={{ background: `${colors.border}25` }}>
                                <p className="text-[13px] font-black" style={{ color: colors.textPrimary }}>{c.title}</p>
                                <p className="text-[11.5px]" style={{ color: colors.textSecondary }}>
                                    {new Date(c.created_at).toLocaleString('pt-BR')} · {c.audience} · {c.sent_count}/{c.recipients} enviados{c.finished_at ? '' : ' · em envio'}
                                </p>
                            </div>
                        ))}
            </div>
        </div>
    )
}
