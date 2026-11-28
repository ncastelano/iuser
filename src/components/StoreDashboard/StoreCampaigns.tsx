// Avisos da loja: a dona manda um aviso (barra do aparelho) para os seguidores ou para quem já comprou da loja.
// Só recebe quem ligou "Ofertas e promoções". O banco confere a dona, o público e o limite por dia.
'use client'

import { useState } from 'react'
import { Send } from 'lucide-react'
import { toast } from '@/lib/toast'
import { validateCampaign, type CampaignAudience } from '@/modules/campaigns/domain'

const ORANGE = '#f97316'
const AUDIENCES: { id: CampaignAudience; label: string; hint: string }[] = [
    { id: 'store_followers', label: 'Seguidores', hint: 'Quem segue a loja' },
    { id: 'store_customers', label: 'Compradores', hint: 'Quem já comprou daqui' },
]

async function call(action: string, store: string, extra: Record<string, unknown>) {
    const r = await fetch('/api/store/campaigns', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, store, ...extra }),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.error || 'Não foi possível enviar.')
    return j
}

export default function StoreCampaigns({ storeId, colors, card }: { storeId: string; colors: any; card?: React.CSSProperties }) {
    const [audience, setAudience] = useState<CampaignAudience>('store_followers')
    const [title, setTitle] = useState('')
    const [body, setBody] = useState('')
    const [url, setUrl] = useState('/')
    const [count, setCount] = useState<number | null>(null)
    const [busy, setBusy] = useState<string | null>(null)
    const [progress, setProgress] = useState<{ sent: number; remaining: number } | null>(null)
    const input = { background: colors.background, border: `1px solid ${colors.border}`, color: colors.textPrimary }

    const preview = async () => {
        setBusy('preview')
        try { const r = await call('preview', storeId, { audience }); setCount(r.recipients ?? 0) }
        catch (e: any) { toast.error(e?.message || 'Não foi possível calcular') }
        finally { setBusy(null) }
    }

    const send = async () => {
        const bad = validateCampaign({ title, body, url })
        if (bad) { toast.error(bad); return }
        if (!window.confirm(`Enviar "${title.trim()}" para ${count} ${count === 1 ? 'pessoa' : 'pessoas'}? Não dá para desfazer.`)) return
        setBusy('send')
        try {
            const created = await call('create', storeId, { audience, title, body, url })
            let sent = 0
            let remaining = Infinity
            while (remaining > 0) {
                const step = await call('send', storeId, { audience, id: created.id })
                sent += step.sent ?? 0
                remaining = step.remaining ?? 0
                setProgress({ sent, remaining })
                if ((step.sent ?? 0) === 0 && remaining > 0) break
            }
            toast.success(remaining === 0 ? `Aviso enviado para ${sent} aparelho(s)` : `Enviado ${sent}; faltam ${remaining}.`)
            setTitle(''); setBody(''); setUrl('/'); setCount(null)
        } catch (e: any) {
            toast.error(e?.message || 'Não foi possível enviar')
        } finally {
            setBusy(null); setProgress(null)
        }
    }

    return (
        <section className="rounded-3xl p-4 flex flex-col gap-3" style={card ?? { background: colors.surface, border: `1px solid ${colors.border}` }}>
            <p className="text-sm font-black flex items-center gap-2" style={{ color: colors.textPrimary }}><Send size={16} style={{ color: ORANGE }} /> Mandar um aviso</p>
            <p className="text-xs" style={{ color: colors.textSecondary }}>Chega na barra do aparelho de quem ligou "Ofertas e promoções". Um aviso por dia.</p>
            <div className="flex gap-2 flex-wrap">
                {AUDIENCES.map((a) => (
                    <button key={a.id} onClick={() => { setAudience(a.id); setCount(null) }} title={a.hint}
                        className="h-9 px-3.5 rounded-full text-[12.5px] font-black"
                        style={audience === a.id ? { background: ORANGE, color: '#fff' } : { background: `${colors.border}40`, color: colors.textPrimary }}>{a.label}</button>
                ))}
            </div>
            <input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 80))} placeholder="Título (ex.: Oferta do dia)" className="h-11 px-3.5 rounded-xl text-sm" style={input} />
            <textarea value={body} onChange={(e) => setBody(e.target.value.slice(0, 240))} rows={3} placeholder="Texto (até 240 letras)" className="px-3.5 py-2.5 rounded-xl text-sm resize-none" style={input} />
            <input value={url} onChange={(e) => setUrl(e.target.value.slice(0, 300))} placeholder="/sua-loja ou /sua-loja/produto" className="h-11 px-3.5 rounded-xl text-sm" style={input} />
            <div className="flex items-center gap-2 flex-wrap">
                <button disabled={!!busy} onClick={preview} className="h-10 px-4 rounded-full text-sm font-black disabled:opacity-60" style={{ background: `${colors.border}40`, color: colors.textPrimary }}>
                    {busy === 'preview' ? 'Contando…' : 'Ver quantas pessoas'}
                </button>
                {count !== null && <span className="text-sm font-black" style={{ color: colors.textPrimary }}>{count} {count === 1 ? 'pessoa vai receber' : 'pessoas vão receber'}</span>}
            </div>
            <button disabled={!!busy || count === null || count === 0} onClick={send}
                className="h-12 rounded-full text-sm font-black text-white disabled:opacity-50" style={{ background: ORANGE }}>
                {busy === 'send' && progress ? `Enviando… ${progress.sent} · faltam ${progress.remaining}` : busy === 'send' ? 'Enviando…' : 'Enviar aviso'}
            </button>
        </section>
    )
}
