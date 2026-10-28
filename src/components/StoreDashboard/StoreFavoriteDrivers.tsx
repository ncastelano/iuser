// src/components/StoreDashboard/StoreFavoriteDrivers.tsx
//
// "Entregadores favoritos" (2.0 e 3.0): a loja convida motoristas iUser e, ao chamar uma entrega, eles recebem a oferta PRIMEIRO (janela de exclusividade de 1, 2, 3 ou
// 5 min; se nenhum favorito está disponível a oferta já abre para todos). O motorista aceita ou recusa o convite. Aqui só se apresenta e se convida: a regra (quem vê,
// quem aceita, quando abre) mora no banco; os textos e os tempos, em modules/favorites.
'use client'

import { useCallback, useEffect, useState } from 'react'
import { Search, Star, UserPlus, X } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { supabase } from '@/lib/supabase/client'
import { getAvatarUrl } from '@/lib/avatar'
import { toast } from '@/lib/toast'
import {
    WINDOW_CHOICES, fetchStoreFavorites, inviteDriver, removeDriver, saveSettings, slotsLeft, suggestDrivers, summaryLine, windowLabel,
    type DriverSuggestion, type FavoritesState,
} from '@/modules/favorites'

const ORANGE = '#f97316', GREEN = '#22c55e'

export default function StoreFavoriteDrivers({ storeId, v3 = false }: { storeId: string; v3?: boolean }) {
    const { colors } = useTheme()
    const [enabled, setEnabled] = useState<boolean | null>(null)
    const [state, setState] = useState<FavoritesState | null>(null)
    const [q, setQ] = useState('')
    const [found, setFound] = useState<DriverSuggestion[]>([])
    const [busy, setBusy] = useState<string | null>(null)

    useEffect(() => {
        supabase.from('stores').select('iuser_delivery_enabled').eq('id', storeId).maybeSingle().then(({ data }) => setEnabled(!!data?.iuser_delivery_enabled))
    }, [storeId])

    const load = useCallback(async () => { try { setState(await fetchStoreFavorites(storeId)) } catch { /* mantém o que já está na tela */ } }, [storeId])
    useEffect(() => { if (!enabled) return; load(); const t = setInterval(load, 15000); return () => clearInterval(t) }, [enabled, load])

    // sem texto: quem já entregou para a loja; com texto: busca por nome ou @ (um respiro para não consultar a cada letra)
    useEffect(() => {
        if (!enabled) return
        let cancelled = false
        const t = setTimeout(async () => {
            try { const r = await suggestDrivers(storeId, q); if (!cancelled) setFound(r) } catch { if (!cancelled) setFound([]) }
        }, q ? 250 : 0)
        return () => { cancelled = true; clearTimeout(t) }
    }, [enabled, storeId, q, state?.items.length])

    if (!enabled || !state) return null
    const left = slotsLeft(state.items)
    const soft = `${colors.border}40`

    const run = async (key: string, fn: () => Promise<void>, ok?: string) => {
        setBusy(key)
        try { await fn(); if (ok) toast.success(ok); await load() } catch (e: any) { toast.error(e?.message || 'Não deu certo.') } finally { setBusy(null) }
    }
    const photo = (p: string | null, size: number) => p
        ? <img src={getAvatarUrl(supabase, p)} alt="" className="rounded-full object-cover flex-shrink-0" style={{ width: size, height: size }} />
        : <span className="rounded-full flex items-center justify-center text-white flex-shrink-0" style={{ width: size, height: size, background: ORANGE }}><Star size={size / 2} /></span>

    return (
        <section className={`rounded-3xl p-4 flex flex-col gap-3 ${v3 ? 'mb-6' : 'mb-6'}`} style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
            <div>
                <h2 className="text-base font-black flex items-center gap-1.5" style={{ color: colors.textPrimary }}><Star size={16} style={{ color: ORANGE }} /> Entregadores favoritos</h2>
                <p className="text-[11px]" style={{ color: colors.textSecondary }}>{summaryLine(state.items)}. Eles recebem suas entregas primeiro; se nenhum estiver disponível, vai para todos.</p>
            </div>

            {/* ajustes */}
            <div className="rounded-2xl p-3 flex flex-col gap-2" style={{ background: soft }}>
                <label className="flex items-center justify-between gap-3 cursor-pointer">
                    <span className="text-[13px] font-black" style={{ color: colors.textPrimary }}>Favoritos primeiro</span>
                    <input type="checkbox" className="w-5 h-5 accent-orange-500" checked={state.favoritesFirst} disabled={busy === 'settings'}
                        onChange={(e) => run('settings', () => saveSettings(storeId, e.target.checked, state.windowSeconds))} />
                </label>
                <div className="flex items-center gap-1.5">
                    <span className="text-[11px] flex-1" style={{ color: colors.textSecondary }}>Tempo exclusivo</span>
                    {WINDOW_CHOICES.map((w) => (
                        <button key={w} disabled={!state.favoritesFirst || busy === 'settings'} onClick={() => run('settings', () => saveSettings(storeId, state.favoritesFirst, w))}
                            className="h-7 px-2.5 rounded-full text-[11px] font-black transition active:scale-95 disabled:opacity-40"
                            style={state.windowSeconds === w ? { background: ORANGE, color: '#fff' } : { background: `${colors.border}60`, color: colors.textSecondary }}>{windowLabel(w)}</button>
                    ))}
                </div>
            </div>

            {/* lista */}
            {state.items.length > 0 && (
                <div className="flex flex-col gap-1.5">
                    {state.items.map((d) => (
                        <div key={d.driverId} className="rounded-2xl px-3 py-2 flex items-center gap-2.5" style={{ background: soft }}>
                            {photo(d.photo, 36)}
                            <div className="min-w-0 flex-1">
                                <p className="text-[13px] font-black truncate" style={{ color: colors.textPrimary }}>
                                    {d.name}
                                    {d.status === 'accepted'
                                        ? <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full ml-1.5" style={{ background: d.online ? `${GREEN}22` : `${colors.border}80`, color: d.online ? GREEN : colors.textSecondary }}>{d.online ? '● online' : 'offline'}</span>
                                        : <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full ml-1.5" style={{ background: '#f9731622', color: ORANGE }}>convite enviado</span>}
                                </p>
                                <p className="text-[11px] truncate" style={{ color: colors.textSecondary }}>
                                    {d.slug ? `@${d.slug} · ` : ''}{d.deliveries} {d.deliveries === 1 ? 'entrega sua' : 'entregas suas'}{d.ratingAvg != null && d.ratingCount > 0 ? ` · ★ ${d.ratingAvg.toFixed(1)} (${d.ratingCount})` : ''}
                                </p>
                            </div>
                            <button aria-label="Remover" disabled={busy === d.driverId} onClick={() => run(d.driverId, () => removeDriver(storeId, d.driverId))} className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 active:scale-95" style={{ color: colors.textSecondary }}><X size={16} /></button>
                        </div>
                    ))}
                </div>
            )}

            {/* convidar */}
            <div className="flex flex-col gap-1.5">
                <p className="text-[11px] font-black uppercase tracking-wide" style={{ color: colors.textSecondary }}>{left > 0 ? `Convidar (${left} ${left === 1 ? 'vaga' : 'vagas'})` : 'Você chegou ao limite de 10 entregadores'}</p>
                {left > 0 && (
                    <>
                        <div className="flex items-center gap-2 h-10 px-3 rounded-full" style={{ background: soft }}>
                            <Search size={14} style={{ color: colors.textSecondary }} />
                            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar motorista por nome ou @" className="flex-1 bg-transparent outline-none text-[13px]" style={{ color: colors.textPrimary }} />
                        </div>
                        {found.length === 0 ? (
                            <p className="text-[11px]" style={{ color: colors.textSecondary }}>{q ? 'Nenhum motorista encontrado.' : 'Quando alguém entregar para você, aparece aqui. Ou busque pelo nome.'}</p>
                        ) : (
                            found.map((s) => (
                                <div key={s.driverId} className="rounded-2xl px-3 py-2 flex items-center gap-2.5" style={{ border: `1px solid ${colors.border}` }}>
                                    {photo(s.photo, 32)}
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[13px] font-black truncate" style={{ color: colors.textPrimary }}>{s.name}</p>
                                        <p className="text-[11px] truncate" style={{ color: colors.textSecondary }}>{s.slug ? `@${s.slug} · ` : ''}{s.deliveries > 0 ? `${s.deliveries} entregas suas` : 'nunca entregou para você'}{s.ratingAvg != null && s.ratingCount > 0 ? ` · ★ ${s.ratingAvg.toFixed(1)}` : ''}</p>
                                    </div>
                                    <button disabled={busy === s.driverId} onClick={() => run(s.driverId, () => inviteDriver(storeId, s.driverId), 'Convite enviado!')}
                                        className="h-8 px-3 rounded-full text-[11px] font-black text-white flex items-center gap-1 active:scale-95 disabled:opacity-50 flex-shrink-0" style={{ background: ORANGE }}><UserPlus size={12} /> Convidar</button>
                                </div>
                            ))
                        )}
                    </>
                )}
            </div>
        </section>
    )
}
