// src/components/tips/StoreTips.tsx — "Apoios recebidos" no painel da LOJA (2.0 e 3.0): o total já confirmado, os apoios que esperam conferência ("Já fiz o Pix" → Recebi / Não recebi),
// o histórico recente e o interruptor de receber apoio. O iUser só registra: a loja confere na conta e confirma. Só aparece para a loja que tem chave Pix.
'use client'

import { useCallback, useEffect, useState } from 'react'
import { Heart } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { toast } from '@/lib/toast'
import { fetchTipsPanel, formatCents, resolveTip, setTipsEnabled, TIP_STATUS_LABEL, type TipsPanel } from '@/modules/tips'

export default function StoreTips({ storeId, hasPix, v3 = false }: { storeId: string; hasPix: boolean; v3?: boolean }) {
    const { colors } = useTheme()
    const [panel, setPanel] = useState<TipsPanel | null>(null)
    const [busy, setBusy] = useState<string | null>(null)
    const load = useCallback(async () => { setPanel(await fetchTipsPanel(storeId)) }, [storeId])
    useEffect(() => { load(); const t = setInterval(() => { if (!document.hidden) load() }, 20000); return () => clearInterval(t) }, [load])

    const run = async (key: string, fn: () => Promise<void>, ok?: string) => {
        setBusy(key)
        try { await fn(); if (ok) toast.success(ok); await load() } catch (e: any) { toast.error(e?.message || 'Não deu certo.') } finally { setBusy(null) }
    }
    if (!panel) return null
    // sem apoio nenhum e sem chave Pix: nada para mostrar (o artista cadastra a chave em Editar loja → Pagamento)
    if (panel.rows.length === 0 && !hasPix) return null
    const soft = `${colors.border}40`
    const pending = panel.rows.filter((r) => r.status === 'reported' || r.status === 'awaiting')
    const done = panel.rows.filter((r) => r.status !== 'reported' && r.status !== 'awaiting').slice(0, 8)

    const Row = ({ r, actions }: { r: TipsPanel['rows'][number]; actions?: boolean }) => (
        <div className="rounded-2xl p-3 flex flex-col gap-2" style={{ background: soft }}>
            <div className="flex items-start gap-2.5">
                <span className="w-9 h-9 rounded-xl flex items-center justify-center text-white flex-shrink-0" style={{ background: '#ec4899' }}><Heart size={16} fill="#fff" /></span>
                <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-black leading-tight" style={{ color: colors.textPrimary }}>{formatCents(r.amountCents)} · {r.tipperName || 'Alguém'}{r.tipperSlug ? <span className="font-normal" style={{ color: colors.textSecondary }}> @{r.tipperSlug}</span> : null}</p>
                    <p className="text-[11px]" style={{ color: colors.textSecondary }}>{TIP_STATUS_LABEL[r.status]}{r.productName ? ` · ${r.productName}` : ''} · {new Date(r.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
                    {r.message && <p className="text-[12px] mt-1" style={{ color: colors.textPrimary }}>“{r.message}”</p>}
                </div>
            </div>
            {actions && (
                <div className="flex gap-2">
                    <button disabled={busy === r.id} onClick={() => run(r.id, () => resolveTip(r.id, true), 'Apoio confirmado ✓')} className="flex-1 h-9 rounded-full text-xs font-black text-white disabled:opacity-50 active:scale-95" style={{ background: '#22c55e' }}>Recebi</button>
                    <button disabled={busy === r.id} onClick={() => run(r.id, () => resolveTip(r.id, false), 'Marcado como não recebido')} className="flex-1 h-9 rounded-full text-xs font-black disabled:opacity-50 active:scale-95" style={{ background: soft, color: colors.textPrimary, border: `1px solid ${colors.border}` }}>Não recebi</button>
                </div>
            )}
        </div>
    )

    return (
        <section className={`rounded-3xl p-4 flex flex-col gap-3 ${v3 ? '' : 'mb-6'}`} style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
            <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                    <h2 className="text-base font-black flex items-center gap-1.5" style={{ color: colors.textPrimary }}><Heart size={16} style={{ color: '#ec4899' }} /> Apoios recebidos</h2>
                    <p className="text-[11px]" style={{ color: colors.textSecondary }}>
                        Gorjetas de quem curte o seu trabalho, por Pix direto na sua chave. {panel.confirmedCount > 0 ? <>Já confirmados: <b style={{ color: '#ec4899' }}>{formatCents(panel.confirmedCents)}</b> ({panel.confirmedCount}).</> : 'Nenhum confirmado ainda.'}
                    </p>
                </div>
                <button disabled={busy === 'toggle' || !hasPix} onClick={() => run('toggle', () => setTipsEnabled(storeId, !panel.enabled), panel.enabled ? 'Apoio desligado' : 'Apoio ligado')} role="switch" aria-checked={panel.enabled} aria-label="Receber apoio" className="relative w-12 h-7 rounded-full flex-shrink-0 transition disabled:opacity-40" style={{ background: panel.enabled && hasPix ? '#ec4899' : colors.border }}>
                    <span className="absolute top-1 w-5 h-5 rounded-full bg-white transition-all" style={{ left: panel.enabled && hasPix ? 24 : 4 }} />
                </button>
            </div>
            {!hasPix && <p className="text-[12px] font-bold" style={{ color: '#c2410c' }}>Cadastre a chave Pix da loja (Editar loja → Pagamento) para receber apoio.</p>}
            {pending.length > 0 && (
                <div className="flex flex-col gap-2">
                    <p className="text-[11px] font-black uppercase tracking-wide" style={{ color: '#ec4899' }}>A conferir ({pending.filter((p) => p.status === 'reported').length})</p>
                    {pending.map((r) => <Row key={r.id} r={r} actions={r.status === 'reported' || r.status === 'awaiting'} />)}
                </div>
            )}
            {done.length > 0 && (
                <div className="flex flex-col gap-2">
                    <p className="text-[11px] font-black uppercase tracking-wide" style={{ color: colors.textSecondary }}>Recentes</p>
                    {done.map((r) => <Row key={r.id} r={r} />)}
                </div>
            )}
            {panel.rows.length === 0 && hasPix && <p className="text-[12px]" style={{ color: colors.textSecondary }}>Quando alguém apoiar, aparece aqui. O botão "Apoiar o artista" já está nas páginas dos seus produtos digitais.</p>}
        </section>
    )
}
