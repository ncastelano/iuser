// src/components/club/ClubOwnerPanel.tsx — a dona da loja define a MENSALIDADE do clube e se ele inclui as músicas, confere os Pix que chegaram ("Recebi" / "Não recebi") e vê quem está pagando e quando vence.
// Painel do Club VIP (2.0 e 3.0). O iUser não movimenta o dinheiro: o Pix vai direto para a chave da loja. Pré-pago sem taxa; pós-pago R$ 0,50 por pagamento confirmado. Regras no banco (migration 20261130000034).
'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTheme } from '@/app/contexts/theme'
import { toast } from '@/lib/toast'
import { daysLeft, fetchClubPanel, monthlyEstimateCents, moneyText, parsePriceCents, PAYMENT_STATUS_LABEL, resolveClubPayment, saveClubSettings, validateClubPrice, CLUB_RENEW_WARNING_DAYS, type ClubPanel } from '@/modules/club'

const GRADIENT = 'linear-gradient(135deg, #a855f7, #6366f1)'

export default function ClubOwnerPanel({ storeId }: { storeId: string }) {
    const { colors } = useTheme()
    const [panel, setPanel] = useState<ClubPanel | null>(null)
    const [price, setPrice] = useState('')
    const [music, setMusic] = useState(false)
    const [busy, setBusy] = useState(false)
    const load = useCallback(async () => {
        const p = await fetchClubPanel(storeId)
        setPanel(p)
        if (p) { setPrice(p.priceCents == null ? '' : (p.priceCents / 100).toFixed(2).replace('.', ',')); setMusic(p.includesMusic) }
    }, [storeId])
    useEffect(() => { load() }, [load])
    if (!panel) return null

    const cents = price.trim() ? parsePriceCents(price) : null
    const priceError = price.trim() ? validateClubPrice(cents) : null
    const changed = (price.trim() ? cents : null) !== panel.priceCents || music !== panel.includesMusic
    const save = async () => {
        if (priceError) { toast.error(priceError); return }
        setBusy(true)
        try { await saveClubSettings(storeId, price.trim() ? cents : null, music); toast.success(price.trim() ? 'Mensalidade do clube salva ✓' : 'Clube grátis salvo ✓'); await load() } catch (e: any) { toast.error(e?.message || 'Não deu certo.') } finally { setBusy(false) }
    }
    const decide = async (id: string, confirm: boolean) => {
        setBusy(true)
        try { await resolveClubPayment(id, confirm); toast.success(confirm ? 'Confirmado: +30 dias para o membro ✓' : 'Pagamento recusado'); await load() } catch (e: any) { toast.error(e?.message || 'Não deu certo.') } finally { setBusy(false) }
    }
    const soft = { background: `${colors.border}20` }
    const toCheck = panel.rows.filter((r) => r.status === 'reported')
    const field = { background: `${colors.border}26`, color: colors.textPrimary, border: `1px solid ${colors.border}` }

    return (
        <div className="rounded-2xl p-4 flex flex-col gap-3" style={{ border: `1px solid ${colors.border}`, background: `${colors.border}12` }}>
            <div>
                <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>Mensalidade do clube</p>
                <p className="text-[11px]" style={{ color: colors.textSecondary }}>Deixe vazio para o clube ser grátis. Com valor, a pessoa paga por Pix direto para a sua chave e você confirma aqui: cada pagamento vale 30 dias. Pré-pago: sem taxa do iUser. Pós-pago: R$ 0,50 por pagamento confirmado.</p>
            </div>
            <div className="flex gap-2 items-center">
                <span className="text-sm font-black" style={{ color: colors.textSecondary }}>R$</span>
                <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="Mensalidade (ex.: 19,90) — vazio = grátis" className="flex-1 h-11 rounded-full px-4 text-sm outline-none" style={field} />
            </div>
            {priceError && <p className="text-[11px] font-bold" style={{ color: '#ef4444' }}>{priceError}</p>}
            {price.trim() && !panel.hasPix && <p className="text-[11px] font-bold" style={{ color: '#f59e0b' }}>Cadastre a chave Pix da loja (em pagamento) para cobrar mensalidade.</p>}
            <label className="flex items-start gap-2 text-[12px] font-bold cursor-pointer" style={{ color: colors.textPrimary }}>
                <input type="checkbox" className="w-4 h-4 mt-0.5 accent-purple-500" checked={music} onChange={(e) => setMusic(e.target.checked)} />
                <span>Inclui ouvir <b>todas as músicas</b> da loja ({panel.tracks} {panel.tracks === 1 ? 'faixa' : 'faixas'} hoje). Só músicas (produto digital só de áudio); curso, e-book e programa não entram.</span>
            </label>
            <button type="button" disabled={busy || !changed || !!priceError} onClick={save} className="h-11 rounded-full text-sm font-black text-white disabled:opacity-40" style={{ background: GRADIENT }}>{busy ? 'Salvando…' : 'Salvar'}</button>
            {!panel.enabled && <p className="text-[11px]" style={{ color: colors.textSecondary }}>O clube está desligado: ligue acima para os clientes verem e assinarem.</p>}

            {panel.priceCents != null && (
                <>
                    <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-xl p-2.5" style={soft}><p className="text-lg font-black" style={{ color: colors.textPrimary }}>{panel.activePaid}</p><p className="text-[9px] uppercase font-bold" style={{ color: colors.textSecondary }}>Pagando agora</p></div>
                        <div className="rounded-xl p-2.5" style={soft}><p className="text-lg font-black" style={{ color: colors.textPrimary }}>{moneyText(monthlyEstimateCents(panel.activePaid, panel.priceCents))}</p><p className="text-[9px] uppercase font-bold" style={{ color: colors.textSecondary }}>Por mês (estimado)</p></div>
                        <div className="rounded-xl p-2.5" style={soft}><p className="text-lg font-black" style={{ color: colors.textPrimary }}>{moneyText(panel.confirmedCents30d)}</p><p className="text-[9px] uppercase font-bold" style={{ color: colors.textSecondary }}>Entrou em 30 dias</p></div>
                    </div>
                    <p className="text-[10px]" style={{ color: colors.textSecondary }}>Estimativa = quem está pagando agora × mensalidade. Não é garantia: não há renovação automática, cada pessoa paga de novo todo mês.</p>

                    <div className="flex flex-col gap-1.5">
                        <p className="text-[11px] font-black uppercase tracking-wide" style={{ color: colors.textSecondary }}>Pix a conferir {toCheck.length > 0 && <span className="ml-1 rounded-full px-1.5 py-0.5 text-white" style={{ background: '#a855f7' }}>{toCheck.length}</span>}</p>
                        {toCheck.length === 0 ? <p className="text-[12px]" style={{ color: colors.textSecondary }}>Nada a conferir agora.</p> : toCheck.map((r) => (
                            <div key={r.id} className="rounded-xl p-3 flex flex-col gap-2" style={soft}>
                                <p className="text-[13px] font-bold" style={{ color: colors.textPrimary }}>{r.payerName}{r.payerSlug ? <span className="font-normal" style={{ color: colors.textSecondary }}> @{r.payerSlug}</span> : null} · {moneyText(r.amountCents)}</p>
                                <p className="text-[11px]" style={{ color: colors.textSecondary }}>Diz que pagou. Confira no app do seu banco antes de confirmar.</p>
                                <div className="flex gap-2">
                                    <button disabled={busy} onClick={() => decide(r.id, true)} className="flex-1 h-10 rounded-full text-xs font-black text-white disabled:opacity-50" style={{ background: '#16a34a' }}>Recebi</button>
                                    <button disabled={busy} onClick={() => decide(r.id, false)} className="flex-1 h-10 rounded-full text-xs font-black disabled:opacity-50" style={{ background: `${colors.border}55`, color: colors.textPrimary }}>Não recebi</button>
                                </div>
                            </div>
                        ))}
                    </div>

                    {panel.members.length > 0 && (
                        <div className="flex flex-col gap-1">
                            <p className="text-[11px] font-black uppercase tracking-wide" style={{ color: colors.textSecondary }}>Quem está pagando ({panel.members.length})</p>
                            {panel.members.slice(0, 20).map((m) => { const d = daysLeft(m.periodEnd); return (
                                <div key={m.profileId} className="flex items-center justify-between gap-2 text-[12px] rounded-lg px-2.5 py-1.5" style={soft}>
                                    <span className="truncate" style={{ color: colors.textPrimary }}>{m.name}{m.slug ? ` @${m.slug}` : ''}</span>
                                    <span className="flex-shrink-0 font-bold" style={{ color: d <= CLUB_RENEW_WARNING_DAYS ? '#f59e0b' : colors.textSecondary }}>{d <= 1 ? 'vence amanhã' : `${d} dias`}</span>
                                </div>
                            ) })}
                        </div>
                    )}

                    {panel.rows.filter((r) => r.status !== 'reported').length > 0 && (
                        <div className="flex flex-col gap-1">
                            <p className="text-[11px] font-black uppercase tracking-wide" style={{ color: colors.textSecondary }}>Últimos pagamentos</p>
                            {panel.rows.filter((r) => r.status !== 'reported').slice(0, 8).map((r) => (
                                <div key={r.id} className="flex items-center justify-between gap-2 text-[12px]" style={{ color: colors.textSecondary }}>
                                    <span className="truncate">{r.payerName} · {moneyText(r.amountCents)}</span>
                                    <span className="flex-shrink-0 font-bold" style={{ color: r.status === 'confirmed' ? '#16a34a' : r.status === 'refused' ? '#ef4444' : colors.textSecondary }}>{PAYMENT_STATUS_LABEL[r.status]}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    )
}
