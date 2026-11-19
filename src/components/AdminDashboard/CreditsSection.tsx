// src/components/AdminDashboard/CreditsSection.tsx — Admin → Créditos: os CARTÕES DE CRÉDITO do iUser (migration 20261130000085).
// O iUser paga o desconto: cria a campanha (valor, pedido mínimo, validade, quantos cartões), IMPRIME os cartões (cada um com o QR para
// /resgatar?codigo=...), acompanha quantos foram usados e quanto o iUser deve a cada loja, e marca "pago" depois de mandar o Pix à loja.
'use client'

import { useCallback, useEffect, useState } from 'react'
import { creditCardsPdf } from '@/lib/printCards'
import { Gift, Printer, Plus, Copy, Check } from 'lucide-react'
import { toast } from '@/lib/toast'
import { callAdminApi } from '@/lib/callAdminApi'
import { Spinner } from '@/components/Spinner'
import type { ThemeColors } from '@/app/contexts/theme'

type Campaign = { id: string; name: string; value: number; min_order: number; ends_at: string | null; active: boolean; created_at: string; codes: number; used: number; spent: number }
type StoreRow = { store_id: string; name: string; slug: string; due: number; pending: number; paid: number; pix_key: string | null }
type Overview = { campaigns: Campaign[]; stores: StoreRow[]; totals: { due: number; pending: number; paid: number } }

const brl = (n: number) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const ORANGE = '#f97316'
/** baixa o PDF dos cartões (8 por folha A4, tamanho de cartão de visita), cada um com o QR para /resgatar?codigo=... */
async function printCards(c: Campaign, codes: string[]) {
    const origin = window.location.origin
    const until = c.ends_at ? `Vale até ${new Date(c.ends_at).toLocaleDateString('pt-BR')}` : 'Sem data de validade'
    const min = c.min_order > 0 ? ` · pedido a partir de ${brl(c.min_order)}` : ''
    await creditCardsPdf({
        title: 'de desconto no seu pedido em qualquer loja do iUser',
        value: brl(c.value),
        footer: `${until}${min} · 1 por pessoa · iuser.com.br/resgatar`,
        codes: codes.map((k) => ({ code: k, url: `${origin}/resgatar?codigo=${k}` })),
    })
    toast.success('PDF dos cartões baixado')
}

export default function CreditsSection({ cardStyle, colors }: { cardStyle: React.CSSProperties; colors: ThemeColors }) {
    const [data, setData] = useState<Overview | null>(null)
    const [busy, setBusy] = useState<string | null>(null)
    const [form, setForm] = useState({ name: '', value: '10', minOrder: '0', codes: '100', endsAt: '' })

    const load = useCallback(async () => {
        try { setData(await callAdminApi<Overview>('/api/admin/credits', { action: 'load' })) }
        catch (e: any) { toast.error(e?.message || 'Não foi possível carregar') }
    }, [])
    useEffect(() => { void load() }, [load])

    const act = async (key: string, body: Record<string, unknown>, ok: string) => {
        setBusy(key)
        try { await callAdminApi('/api/admin/credits', body); toast.success(ok); await load() }
        catch (e: any) { toast.error(e?.message || 'Não deu certo') }
        finally { setBusy(null) }
    }
    const print = async (c: Campaign, onlyFree: boolean) => {
        setBusy('print-' + c.id)
        try {
            const r = await callAdminApi<{ codes: { code: string; status: string }[] }>('/api/admin/credits', { action: 'codes', campaign: c.id })
            const list = r.codes.filter((k) => !onlyFree || k.status === 'available').map((k) => k.code)
            if (!list.length) { toast.info('Nenhum cartão para imprimir.'); return }
            await printCards(c, list)
        } catch (e: any) { toast.error(e?.message || 'Não deu para gerar os cartões') }
        finally { setBusy(null) }
    }

    const input = { background: colors.background, border: `1px solid ${colors.border}`, color: colors.textPrimary }
    if (!data) return <div style={cardStyle} className="flex justify-center py-8"><Spinner size={24} color={ORANGE} /></div>

    return (
        <div className="flex flex-col gap-3">
            <div style={cardStyle}>
                <p className="text-sm font-black flex items-center gap-2" style={{ color: colors.textPrimary }}><Gift size={17} style={{ color: ORANGE }} /> Cartões de crédito do iUser</p>
                <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>
                    Cartões impressos para divulgação: o cliente ganha o desconto no pedido e o <b>iUser paga esse valor à loja</b> (por Pix, por fora). Vale em qualquer loja, 1 por pessoa por campanha, nunca na própria loja.
                </p>
                <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                    {([['A pagar às lojas', data.totals.due, '#dc2626'], ['Em pedidos abertos', data.totals.pending, '#ca8a04'], ['Já pago', data.totals.paid, '#16a34a']] as const).map(([l, v, c]) => (
                        <div key={l} className="rounded-xl p-2" style={{ background: `${colors.border}25` }}>
                            <p className="text-[15px] font-black" style={{ color: c }}>{brl(v)}</p>
                            <p className="text-[10.5px]" style={{ color: colors.textSecondary }}>{l}</p>
                        </div>
                    ))}
                </div>
            </div>

            <div style={cardStyle} className="flex flex-col gap-2">
                <p className="text-sm font-black" style={{ color: colors.textPrimary }}>Nova campanha</p>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value.slice(0, 80) })} placeholder="Nome (ex.: Feira do bairro Cohab)" className="h-10 px-3 rounded-xl text-sm" style={input} />
                <div className="grid grid-cols-2 gap-2">
                    <label className="text-[11px]" style={{ color: colors.textSecondary }}>Valor (R$)<input inputMode="decimal" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} className="mt-0.5 w-full h-10 px-3 rounded-xl text-sm" style={input} /></label>
                    <label className="text-[11px]" style={{ color: colors.textSecondary }}>Pedido mínimo (R$)<input inputMode="decimal" value={form.minOrder} onChange={(e) => setForm({ ...form, minOrder: e.target.value })} className="mt-0.5 w-full h-10 px-3 rounded-xl text-sm" style={input} /></label>
                    <label className="text-[11px]" style={{ color: colors.textSecondary }}>Quantos cartões<input inputMode="numeric" value={form.codes} onChange={(e) => setForm({ ...form, codes: e.target.value })} className="mt-0.5 w-full h-10 px-3 rounded-xl text-sm" style={input} /></label>
                    <label className="text-[11px]" style={{ color: colors.textSecondary }}>Vale até (opcional)<input type="date" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} className="mt-0.5 w-full h-10 px-3 rounded-xl text-sm" style={input} /></label>
                </div>
                <p className="text-[11px]" style={{ color: colors.textSecondary }}>
                    Custo máximo se todos forem usados: <b>{brl((Number(form.value.replace(',', '.')) || 0) * (Number(form.codes) || 0))}</b>.
                </p>
                <button disabled={busy === 'create'} onClick={() => act('create', { action: 'create', ...form, endsAt: form.endsAt ? `${form.endsAt}T23:59:59-04:00` : null }, 'Campanha criada')}
                    className="h-10 rounded-full text-sm font-black text-white flex items-center justify-center gap-1.5 disabled:opacity-60" style={{ background: ORANGE }}>
                    {busy === 'create' ? <Spinner size={16} color="#fff" /> : <><Plus size={16} /> Criar e gerar os códigos</>}
                </button>
            </div>

            {data.campaigns.map((c) => (
                <div key={c.id} style={cardStyle} className="flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                            <p className="text-sm font-black truncate" style={{ color: colors.textPrimary }}>{c.name}</p>
                            <p className="text-xs" style={{ color: colors.textSecondary }}>
                                {brl(c.value)}{c.min_order > 0 ? ` · mínimo ${brl(c.min_order)}` : ''} · {c.ends_at ? `até ${new Date(c.ends_at).toLocaleDateString('pt-BR')}` : 'sem validade'}
                            </p>
                        </div>
                        <button onClick={() => act('act-' + c.id, { action: 'set_active', campaign: c.id, active: !c.active }, c.active ? 'Campanha pausada' : 'Campanha ligada')}
                            className="h-8 px-3 rounded-full text-[11.5px] font-black flex-shrink-0" style={c.active ? { background: '#16a34a1f', color: '#16a34a' } : { background: `${colors.border}40`, color: colors.textSecondary }}>
                            {c.active ? 'Ligada' : 'Pausada'}
                        </button>
                    </div>
                    <p className="text-xs" style={{ color: colors.textPrimary }}><b>{c.used}</b> de {c.codes} usados · {brl(c.spent)} em descontos</p>
                    <div className="flex flex-wrap gap-2">
                        <button onClick={() => print(c, true)} disabled={busy === 'print-' + c.id} className="h-9 px-3 rounded-full text-[12px] font-black flex items-center gap-1.5" style={{ background: `${ORANGE}1f`, color: ORANGE }}>
                            {busy === 'print-' + c.id ? <Spinner size={14} color={ORANGE} /> : <Printer size={14} />} PDF dos não usados
                        </button>
                        <button onClick={() => { const n = prompt('Quantos cartões a mais?', '50'); if (n) void act('add-' + c.id, { action: 'add_codes', campaign: c.id, codes: Number(n) }, 'Cartões gerados') }}
                            className="h-9 px-3 rounded-full text-[12px] font-black" style={{ background: `${colors.border}40`, color: colors.textPrimary }}>+ Gerar mais</button>
                    </div>
                </div>
            ))}

            <div style={cardStyle} className="flex flex-col gap-2">
                <p className="text-sm font-black" style={{ color: colors.textPrimary }}>O que o iUser deve a cada loja</p>
                {data.stores.length === 0 && <p className="text-xs" style={{ color: colors.textSecondary }}>Nenhum cartão usado ainda.</p>}
                {data.stores.map((s) => (
                    <div key={s.store_id} className="rounded-xl p-3 flex flex-col gap-1.5" style={{ background: `${colors.border}20` }}>
                        <div className="flex items-baseline justify-between gap-2">
                            <p className="text-[13px] font-black truncate" style={{ color: colors.textPrimary }}>{s.name}</p>
                            <p className="text-[14px] font-black" style={{ color: s.due > 0 ? '#dc2626' : colors.textSecondary }}>{brl(s.due)}</p>
                        </div>
                        <p className="text-[11px]" style={{ color: colors.textSecondary }}>Em pedidos abertos {brl(s.pending)} · já pago {brl(s.paid)}</p>
                        {s.due > 0 && (
                            <div className="flex flex-wrap gap-2 items-center">
                                {s.pix_key
                                    ? <button onClick={() => { void navigator.clipboard.writeText(s.pix_key!); toast.success('Chave Pix copiada') }} className="h-8 px-3 rounded-full text-[11.5px] font-bold flex items-center gap-1" style={{ background: colors.surface, border: `1px solid ${colors.border}`, color: colors.textPrimary }}><Copy size={13} /> Pix da loja</button>
                                    : <span className="text-[11px]" style={{ color: '#ca8a04' }}>A loja não cadastrou chave Pix</span>}
                                <button disabled={busy === 'pay-' + s.store_id} onClick={() => { if (confirm(`Confirmar que o iUser já mandou ${brl(s.due)} para ${s.name}?`)) void act('pay-' + s.store_id, { action: 'mark_paid', store: s.store_id, note: 'Pix' }, 'Marcado como pago') }}
                                    className="h-8 px-3 rounded-full text-[11.5px] font-black text-white flex items-center gap-1" style={{ background: '#16a34a' }}><Check size={13} /> Já paguei</button>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    )
}
