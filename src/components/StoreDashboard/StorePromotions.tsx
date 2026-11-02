// src/components/StoreDashboard/StorePromotions.tsx
//
// "Promoções" da loja (2.0 e 3.0): a loja monta COMBOS com itens que já tem no catálogo — 1 ou mais, cada um com a sua quantidade —, vê a SOMA de tudo, escolhe quanto quer
// receber pelo conjunto e o desconto que deu aparece calculado. O combo vira um produto da loja (categoria "Promoções") e aparece na seção horizontal de promoções do catálogo e
// na vitrine da home. A conta de verdade (soma, desconto, limites) é do banco (`save_store_combo`); aqui só se monta e se mostra (regras puras em modules/promotions).
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Flame, Minus, Pause, Pencil, Play, Plus, Search, Tag, Trash2, X } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { toast } from '@/lib/toast'
import FallbackImage from '@/components/FallbackImage'
import {
    COMBO_ERROR_TEXT, DISCOUNT_SHORTCUTS, comboDiscount, comboTotal, deleteCombo, describeItems, listComboCandidates, listStoreCombos, priceForDiscountPct, saveCombo,
    setComboActive, validateCombo, type CandidateItem, type StoreCombo,
} from '@/modules/promotions'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'
const ORANGE = '#f97316'
const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

/** "59,90" / "59.90" / "R$ 1.059,90" → 59.9 (NaN se não der) */
function parseMoney(text: string): number {
    const t = text.replace(/[^\d,.]/g, '')
    if (!t) return NaN
    const n = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t
    return parseFloat(n)
}

export default function StorePromotions({ storeId }: { storeId: string }) {
    const { colors } = useTheme()
    const [combos, setCombos] = useState<StoreCombo[] | null>(null)
    const [dialog, setDialog] = useState<{ combo: StoreCombo | null } | null>(null)
    const [busy, setBusy] = useState<string | null>(null)

    const load = useCallback(async () => {
        try { setCombos(await listStoreCombos(storeId)) } catch { setCombos((prev) => prev ?? []) }
    }, [storeId])
    useEffect(() => { load() }, [load])

    const toggle = async (c: StoreCombo) => {
        setBusy(c.id)
        try { await setComboActive(c.id, !c.is_active); await load(); toast.success(c.is_active ? 'Promoção pausada' : 'Promoção no ar') }
        catch { toast.error('Não foi possível mudar a promoção agora.') }
        setBusy(null)
    }
    const remove = async (c: StoreCombo) => {
        if (!window.confirm(`Apagar a promoção "${c.name}"? Os itens continuam no catálogo.`)) return
        setBusy(c.id)
        try { await deleteCombo(c.id); await load(); toast.success('Promoção apagada') }
        catch { toast.error('Não foi possível apagar agora.') }
        setBusy(null)
    }

    return (
        <section className="rounded-3xl p-4 mb-6 flex flex-col gap-3" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h2 className="text-base font-black flex items-center gap-1.5" style={{ color: colors.textPrimary }}><Flame size={16} style={{ color: '#dc2626' }} /> Promoções</h2>
                    <p className="text-[11px] leading-snug" style={{ color: colors.textSecondary }}>
                        Monte combos com os itens que você já vende e escolha o valor. Aparecem em destaque no catálogo e na página inicial do iUser.
                    </p>
                </div>
                <button
                    onClick={() => setDialog({ combo: null })}
                    className="h-10 px-4 rounded-full text-xs font-black flex items-center gap-1.5 flex-shrink-0 transition active:scale-95"
                    style={{ background: GRADIENT, color: '#fff' }}
                >
                    <Plus size={15} /> Montar promoção
                </button>
            </div>

            {combos === null ? (
                <p className="text-xs py-2" style={{ color: colors.textSecondary }}>Carregando…</p>
            ) : combos.length === 0 ? (
                <div className="rounded-2xl p-4 text-center" style={{ border: `1px dashed ${colors.border}` }}>
                    <Tag size={20} className="mx-auto mb-1" style={{ color: colors.textSecondary }} />
                    <p className="text-xs font-semibold" style={{ color: colors.textPrimary }}>Nenhuma promoção ainda</p>
                    <p className="text-[11px]" style={{ color: colors.textSecondary }}>Escolha 1 ou mais itens, defina o valor e o desconto aparece sozinho.</p>
                </div>
            ) : (
                <div className="flex flex-col gap-2">
                    {combos.map((c) => {
                        const total = c.compare_at_price ?? comboTotal(c.items)
                        const d = comboDiscount(total, c.price)
                        return (
                            <div key={c.id} className="flex items-center gap-3 p-2.5 rounded-2xl" style={{ border: `1px solid ${colors.border}`, opacity: c.is_active ? 1 : 0.6 }}>
                                <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0" style={{ background: GRADIENT }}>
                                    <FallbackImage srcs={[c.image_url]} alt={c.name} name={c.name} className="w-full h-full object-cover" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-[13px] font-black leading-tight truncate" style={{ color: colors.textPrimary }}>
                                        {c.name}{!c.is_active && <span className="ml-1.5 text-[10px] font-bold" style={{ color: colors.textSecondary }}>pausada</span>}
                                    </p>
                                    <p className="text-[11px] truncate" style={{ color: colors.textSecondary }}>{describeItems(c.items)}</p>
                                    <p className="text-xs mt-0.5 flex items-baseline gap-1.5 flex-wrap">
                                        <span className="font-black" style={{ color: ORANGE }}>{brl(c.price)}</span>
                                        {d.pct > 0 && <span className="line-through text-[10px]" style={{ color: colors.textSecondary }}>{brl(total)}</span>}
                                        {d.pct > 0 && <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full text-white" style={{ background: '#dc2626' }}>-{d.pct}%</span>}
                                    </p>
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                    <button onClick={() => toggle(c)} disabled={busy === c.id} aria-label={c.is_active ? 'Pausar promoção' : 'Colocar no ar'} title={c.is_active ? 'Pausar' : 'Colocar no ar'}
                                        className="w-9 h-9 rounded-full flex items-center justify-center transition active:scale-90" style={{ background: `${colors.border}40`, color: colors.textPrimary }}>
                                        {c.is_active ? <Pause size={15} /> : <Play size={15} />}
                                    </button>
                                    <button onClick={() => setDialog({ combo: c })} aria-label="Editar promoção" title="Editar"
                                        className="w-9 h-9 rounded-full flex items-center justify-center transition active:scale-90" style={{ background: `${colors.border}40`, color: colors.textPrimary }}>
                                        <Pencil size={15} />
                                    </button>
                                    <button onClick={() => remove(c)} disabled={busy === c.id} aria-label="Apagar promoção" title="Apagar"
                                        className="w-9 h-9 rounded-full flex items-center justify-center transition active:scale-90" style={{ background: '#ef444418', color: '#ef4444' }}>
                                        <Trash2 size={15} />
                                    </button>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            {dialog && <ComboDialog storeId={storeId} combo={dialog.combo} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); load() }} />}
        </section>
    )
}

// ===== Montar / editar um combo =====
function ComboDialog({ storeId, combo, onClose, onSaved }: { storeId: string; combo: StoreCombo | null; onClose: () => void; onSaved: () => void }) {
    const { colors } = useTheme()
    const [items, setItems] = useState<CandidateItem[] | null>(null)
    const [qty, setQty] = useState<Record<string, number>>(() => Object.fromEntries((combo?.items || []).map((i) => [i.item_id, i.quantity])))
    const [name, setName] = useState(combo?.name || '')
    const [note, setNote] = useState(() => (combo?.description || '').split('\n').slice(1).join('\n'))
    const [priceText, setPriceText] = useState(combo ? String(combo.price).replace('.', ',') : '')
    const [search, setSearch] = useState('')
    const [saving, setSaving] = useState(false)
    const [mounted, setMounted] = useState(false)

    useEffect(() => { setMounted(true) }, [])
    useEffect(() => { listComboCandidates(storeId).then(setItems).catch(() => setItems([])) }, [storeId])
    useEffect(() => {
        const prev = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => { document.body.style.overflow = prev }
    }, [])

    const byId = useMemo(() => new Map((items || []).map((i) => [i.id, i])), [items])
    const lines = useMemo(() => Object.entries(qty).filter(([, q]) => q > 0).map(([id, q]) => ({ id, price: byId.get(id)?.price ?? combo?.items.find((i) => i.item_id === id)?.price ?? 0, quantity: q })), [qty, byId, combo])
    const total = comboTotal(lines)
    const price = parseMoney(priceText)
    const discount = comboDiscount(total, Number.isFinite(price) ? price : 0)
    const error = validateCombo({ name, lines, price: Number.isFinite(price) ? price : 0 })
    const picked = lines.reduce((n, l) => n + l.quantity, 0)

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase()
        return (items || []).filter((i) => !q || i.name.toLowerCase().includes(q) || (i.category || '').toLowerCase().includes(q))
    }, [items, search])

    const setItemQty = (id: string, q: number) => setQty((prev) => ({ ...prev, [id]: Math.max(0, Math.min(20, q)) }))

    const save = async () => {
        if (error || saving) return
        setSaving(true)
        try {
            await saveCombo({ storeId, comboId: combo?.id ?? null, name: name.trim(), note: note.trim(), price, items: lines.map((l) => ({ product_id: l.id, quantity: l.quantity })) })
            toast.success(combo ? 'Promoção atualizada' : 'Promoção criada')
            onSaved()
        } catch (e: any) {
            toast.error(e?.message || 'Não foi possível salvar a promoção.')
            setSaving(false)
        }
    }

    if (!mounted) return null
    const fieldStyle = { background: `${colors.border}30`, color: colors.textPrimary, border: `1px solid ${colors.border}` }

    return createPortal(
        <div className="fixed inset-0 z-[400] bg-black/60 backdrop-blur-md flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
            <div className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl flex flex-col max-h-[94vh]" style={{ background: colors.surface }} onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 pt-4 pb-2">
                    <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>{combo ? 'Editar promoção' : 'Montar promoção'}</h3>
                    <button onClick={onClose} aria-label="Fechar" className="p-1.5 rounded-full" style={{ color: colors.textSecondary }}><X size={20} /></button>
                </div>

                <div className="px-5 pb-3 overflow-y-auto flex flex-col gap-4">
                    <label className="flex flex-col gap-1">
                        <span className="text-xs font-bold" style={{ color: colors.textPrimary }}>Nome da promoção</span>
                        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Ex.: Combo Casal" className="h-11 px-3.5 rounded-xl text-sm outline-none" style={fieldStyle} />
                    </label>

                    <div className="flex flex-col gap-2">
                        <span className="text-xs font-bold" style={{ color: colors.textPrimary }}>Itens do combo <span className="font-normal" style={{ color: colors.textSecondary }}>(escolha um ou mais e a quantidade de cada)</span></span>
                        <div className="flex items-center gap-2 h-10 px-3.5 rounded-full" style={{ background: `${colors.border}30` }}>
                            <Search size={15} style={{ color: colors.textSecondary }} />
                            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar item da loja" className="flex-1 min-w-0 bg-transparent outline-none text-sm" style={{ color: colors.textPrimary }} />
                        </div>
                        <div className="rounded-2xl overflow-y-auto max-h-[34vh]" style={{ border: `1px solid ${colors.border}` }}>
                            {items === null ? (
                                <p className="text-xs p-3" style={{ color: colors.textSecondary }}>Carregando itens…</p>
                            ) : filtered.length === 0 ? (
                                <p className="text-xs p-3" style={{ color: colors.textSecondary }}>{items.length === 0 ? 'Cadastre produtos na loja para montar um combo.' : 'Nenhum item encontrado.'}</p>
                            ) : filtered.map((i, idx) => {
                                const q = qty[i.id] || 0
                                return (
                                    <div key={i.id} className="flex items-center gap-2.5 p-2" style={{ borderTop: idx === 0 ? 'none' : `1px solid ${colors.border}55`, background: q > 0 ? `${ORANGE}12` : 'transparent' }}>
                                        <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0" style={{ background: GRADIENT }}>
                                            <FallbackImage srcs={[i.image_url]} alt={i.name} name={i.name} className="w-full h-full object-cover" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[13px] font-bold leading-tight truncate" style={{ color: colors.textPrimary }}>{i.name}</p>
                                            <p className="text-[11px]" style={{ color: colors.textSecondary }}>{brl(i.price)}{i.category ? ` · ${i.category}` : ''}</p>
                                        </div>
                                        {q === 0 ? (
                                            <button onClick={() => setItemQty(i.id, 1)} aria-label={`Colocar ${i.name} no combo`} className="w-8 h-8 rounded-full flex items-center justify-center text-white flex-shrink-0 transition active:scale-90" style={{ background: GRADIENT }}><Plus size={15} strokeWidth={3} /></button>
                                        ) : (
                                            <span className="flex items-center gap-0.5 rounded-full p-0.5 flex-shrink-0" style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}` }}>
                                                <button onClick={() => setItemQty(i.id, q - 1)} aria-label="Tirar uma unidade" className="w-7 h-7 rounded-full flex items-center justify-center" style={q === 1 ? { background: '#ef444418', color: '#ef4444' } : { background: colors.surface, color: colors.textPrimary, border: `1px solid ${colors.border}` }}>
                                                    {q === 1 ? <Trash2 size={13} /> : <Minus size={14} />}
                                                </button>
                                                <span className="min-w-[22px] text-center text-[13px] font-black" style={{ color: colors.textPrimary }}>{q}</span>
                                                <button onClick={() => setItemQty(i.id, q + 1)} aria-label="Colocar mais uma unidade" className="w-7 h-7 rounded-full flex items-center justify-center text-white" style={{ background: GRADIENT }}><Plus size={14} strokeWidth={3} /></button>
                                            </span>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    {/* A soma e o valor do combo: o desconto aparece na hora */}
                    <div className="rounded-2xl p-3.5 flex flex-col gap-2.5" style={{ border: `1px solid ${colors.border}` }}>
                        <div className="flex items-center justify-between text-sm">
                            <span style={{ color: colors.textSecondary }}>{picked === 0 ? 'Nenhum item escolhido' : `${picked} ${picked === 1 ? 'item' : 'itens'} · soma de tudo`}</span>
                            <span className="font-black" style={{ color: colors.textPrimary }}>{brl(total)}</span>
                        </div>
                        <label className="flex flex-col gap-1">
                            <span className="text-xs font-bold" style={{ color: colors.textPrimary }}>Quanto você quer receber pelo combo</span>
                            <div className="flex items-center h-12 px-3.5 rounded-xl gap-2" style={fieldStyle}>
                                <span className="text-sm font-bold" style={{ color: colors.textSecondary }}>R$</span>
                                <input value={priceText} onChange={(e) => setPriceText(e.target.value)} inputMode="decimal" placeholder="0,00" className="flex-1 min-w-0 bg-transparent outline-none text-lg font-black" style={{ color: colors.textPrimary }} />
                            </div>
                        </label>
                        {total > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                                {DISCOUNT_SHORTCUTS.map((p) => (
                                    <button key={p} onClick={() => setPriceText(String(priceForDiscountPct(total, p)).replace('.', ','))} className="h-8 px-3 rounded-full text-[11px] font-black transition active:scale-95" style={{ border: `1.5px solid ${colors.border}`, color: colors.textPrimary }}>
                                        -{p}%
                                    </button>
                                ))}
                            </div>
                        )}
                        {Number.isFinite(price) && price > 0 && total > 0 && (
                            price > total ? (
                                <p className="text-xs font-bold" style={{ color: '#ef4444' }}>{COMBO_ERROR_TEXT.above_total}</p>
                            ) : discount.pct > 0 ? (
                                <p className="text-sm font-black" style={{ color: '#16a34a' }}>
                                    Desconto de {brl(discount.amount)} ({discount.pct}%) <span className="font-semibold" style={{ color: colors.textSecondary }}>· o cliente vê &quot;De {brl(total)} por {brl(price)}&quot;</span>
                                </p>
                            ) : (
                                <p className="text-xs" style={{ color: colors.textSecondary }}>Mesmo valor da soma: sem desconto.</p>
                            )
                        )}
                    </div>

                    <label className="flex flex-col gap-1">
                        <span className="text-xs font-bold" style={{ color: colors.textPrimary }}>Recado para o cliente <span className="font-normal" style={{ color: colors.textSecondary }}>(opcional)</span></span>
                        <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={2} placeholder="Ex.: Válido só hoje" className="px-3.5 py-2.5 rounded-xl text-sm outline-none resize-none" style={fieldStyle} />
                    </label>
                </div>

                <div className="px-5 py-3 flex flex-col gap-2" style={{ borderTop: `1px solid ${colors.border}55` }}>
                    {error && (name.trim() || picked > 0 || priceText) && <p className="text-[11px]" style={{ color: colors.textSecondary }}>{COMBO_ERROR_TEXT[error]}</p>}
                    <div className="flex gap-2">
                        <button onClick={onClose} className="flex-1 h-12 rounded-full text-sm font-bold" style={{ border: `1.5px solid ${colors.border}`, color: colors.textSecondary }}>Cancelar</button>
                        <button onClick={save} disabled={!!error || saving} className="flex-[1.4] h-12 rounded-full text-sm font-black text-white transition active:scale-95 disabled:opacity-40" style={{ background: GRADIENT }}>
                            {saving ? 'Salvando…' : combo ? 'Salvar alterações' : 'Criar promoção'}
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    )
}
