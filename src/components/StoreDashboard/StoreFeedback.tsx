// src/components/StoreDashboard/StoreFeedback.tsx
//
// "Avaliações e comentários": o retorno que a loja recebe dos clientes sobre o que vende (produtos) e o que presta (serviços) — a nota média, a
// distribuição das estrelas e o que as pessoas escreveram, do mais novo para o mais antigo. Vem das avaliações de compra e de serviço
// (`product_reviews`, públicas); só leitura. Parte do painel da loja (o painel é o "feedback do que está acontecendo").
'use client'

import { useEffect, useMemo, useState } from 'react'
import { Star } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { useInsideShell } from '@/components/InsideShell'
import { useProfilesById } from '@/hooks/useProfilesById'
import { hexToRgb } from '@/lib/color'
import V3Section from './V3Section'
import { usePersistedExpanded } from '@/hooks/usePersistedExpanded'

interface Review { id: string; rating: number; comment: string | null; created_at: string; profile_id: string | null; product_id: string | null; is_anonymous: boolean | null }
interface Item { id: string; name: string; type: string | null; slug: string | null }

const fmtAvg = (n: number) => n.toFixed(1).replace('.', ',')
const ago = (iso: string) => {
    const s = (Date.now() - new Date(iso).getTime()) / 1000
    if (s < 3600) return `há ${Math.max(1, Math.round(s / 60))} min`
    if (s < 86400) return `há ${Math.round(s / 3600)} h`
    if (s < 86400 * 30) return `há ${Math.round(s / 86400)} d`
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

export default function StoreFeedback({ storeId }: { storeId: string }) {
    const { colors } = useTheme()
    const v3 = useInsideShell()
    const surfaceRgb = hexToRgb(colors.surface)
    const [expanded, setExpanded] = usePersistedExpanded('storeFeedback', true)
    const [reviews, setReviews] = useState<Review[]>([])
    const [items, setItems] = useState<Map<string, Item>>(new Map())
    const [loading, setLoading] = useState(true)
    const [tab, setTab] = useState<'all' | 'product' | 'service'>('all')

    useEffect(() => {
        let cancelled = false
        const load = async () => {
            const { data } = await supabase
                .from('product_reviews')
                .select('id, rating, comment, created_at, profile_id, product_id, is_anonymous')
                .eq('store_id', storeId)
                .order('created_at', { ascending: false })
                .limit(120)
            const list = (data || []) as Review[]
            const ids = Array.from(new Set(list.map((r) => r.product_id).filter((x): x is string => !!x)))
            const prods = ids.length ? ((await supabase.from('products').select('id, name, type, slug').in('id', ids)).data || []) as Item[] : []
            if (cancelled) return
            setReviews(list)
            setItems(new Map(prods.map((p) => [p.id, p])))
            setLoading(false)
        }
        load()
        const ch = supabase
            .channel(`store-feedback-${storeId}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'product_reviews', filter: `store_id=eq.${storeId}` }, () => load())
            .subscribe()
        return () => { cancelled = true; supabase.removeChannel(ch) }
    }, [storeId])

    const people = useProfilesById(reviews.map((r) => (r.is_anonymous ? null : r.profile_id)))
    const kindOf = (r: Review) => (items.get(r.product_id || '')?.type === 'service' ? 'service' : 'product')
    const shown = useMemo(() => reviews.filter((r) => tab === 'all' || kindOf(r) === tab), [reviews, tab, items])
    const count = (k: 'product' | 'service') => reviews.filter((r) => kindOf(r) === k).length
    const avg = shown.length ? shown.reduce((a, r) => a + r.rating, 0) / shown.length : 0
    const dist = [5, 4, 3, 2, 1].map((n) => ({ n, c: shown.filter((r) => r.rating === n).length }))
    const withComment = shown.filter((r) => (r.comment || '').trim())

    const body = loading ? (
        <div className="flex flex-col gap-2" aria-hidden>
            {[0, 1, 2].map((i) => <span key={i} className="block h-14 rounded-2xl animate-pulse" style={{ background: `${colors.border}40` }} />)}
        </div>
    ) : reviews.length === 0 ? (
        <div className="rounded-xl p-6 text-center" style={{ background: `${colors.border}20`, border: `1px dashed ${colors.border}` }}>
            <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>Ainda sem avaliações</p>
            <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>Quando um cliente receber um pedido ou concluir um serviço, o que ele achar aparece aqui.</p>
        </div>
    ) : (
        <div className="flex flex-col gap-3">
            <div className="flex gap-1.5">
                {([['all', `Tudo (${reviews.length})`], ['product', `Produtos (${count('product')})`], ['service', `Serviços (${count('service')})`]] as const).map(([k, label]) => (
                    <button key={k} onClick={() => setTab(k)} className="h-8 px-3 rounded-full text-[11px] font-black transition active:scale-95"
                        style={tab === k ? { background: '#f97316', color: '#fff' } : { background: `${colors.border}40`, color: colors.textPrimary }}>{label}</button>
                ))}
            </div>

            {shown.length > 0 && (
                <div className="flex items-center gap-4 rounded-2xl p-3" style={{ background: `${colors.border}20` }}>
                    <div className="text-center flex-shrink-0">
                        <p className="text-3xl font-black leading-none" style={{ color: colors.textPrimary }}>{fmtAvg(avg)}</p>
                        <p className="flex justify-center gap-0.5 mt-1">{[1, 2, 3, 4, 5].map((s) => <Star key={s} size={11} style={{ color: '#f59e0b', fill: s <= Math.round(avg) ? '#f59e0b' : 'transparent' }} />)}</p>
                        <p className="text-[10px] mt-0.5" style={{ color: colors.textSecondary }}>{shown.length} {shown.length === 1 ? 'avaliação' : 'avaliações'}</p>
                    </div>
                    <div className="flex-1 flex flex-col gap-1">
                        {dist.map((d) => (
                            <div key={d.n} className="flex items-center gap-2 text-[10px]" style={{ color: colors.textSecondary }}>
                                <span className="w-3 text-right font-bold">{d.n}</span>
                                <span className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: `${colors.border}60` }}>
                                    <span className="block h-full rounded-full" style={{ width: `${shown.length ? (d.c / shown.length) * 100 : 0}%`, background: '#f59e0b' }} />
                                </span>
                                <span className="w-5 font-bold">{d.c}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {withComment.length === 0 ? (
                <p className="text-xs text-center py-2" style={{ color: colors.textSecondary }}>Ninguém escreveu comentário nessa seleção ainda.</p>
            ) : (
                <div className="flex flex-col gap-2">
                    {withComment.slice(0, 12).map((r) => {
                        const person = r.is_anonymous ? null : people.get(r.profile_id || '')
                        const item = items.get(r.product_id || '')
                        return (
                            <div key={r.id} className="rounded-2xl p-3" style={{ background: v3 ? colors.surface : `${colors.border}15`, border: `1px solid ${colors.border}` }}>
                                <div className="flex items-center gap-2.5">
                                    <span className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center text-xs font-black flex-shrink-0" style={{ background: `${colors.border}60`, color: colors.textPrimary }}>
                                        {person?.avatarUrl ? <img src={person.avatarUrl} alt="" className="w-full h-full object-cover" /> : (person?.name || '?').charAt(0).toUpperCase()}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-[13px] font-black truncate" style={{ color: colors.textPrimary }}>{person?.name || (r.is_anonymous ? 'Cliente anônimo' : 'Cliente')}</span>
                                        <span className="flex items-center gap-1.5 text-[10px]" style={{ color: colors.textSecondary }}>
                                            <span className="flex gap-px">{[1, 2, 3, 4, 5].map((s) => <Star key={s} size={10} style={{ color: '#f59e0b', fill: s <= r.rating ? '#f59e0b' : 'transparent' }} />)}</span>
                                            · {ago(r.created_at)}
                                        </span>
                                    </span>
                                    {item && <span className="text-[10px] font-black px-2 py-0.5 rounded-full max-w-[40%] truncate" style={{ background: item.type === 'service' ? '#7c3aed20' : '#f9731620', color: item.type === 'service' ? '#7c3aed' : '#f97316' }}>{item.name}</span>}
                                </div>
                                <p className="text-[13px] mt-2 leading-snug" style={{ color: colors.textPrimary }}>{r.comment}</p>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )

    if (v3) {
        const all = reviews.length ? reviews.reduce((a, r) => a + r.rating, 0) / reviews.length : 0
        return (
            <V3Section
                title="Avaliações e comentários"
                subtitle={reviews.length ? <><span style={{ color: '#f59e0b', fontWeight: 800 }}>★ {fmtAvg(all)}</span> · {reviews.length} {reviews.length === 1 ? 'avaliação' : 'avaliações'}</> : 'O que os clientes acham'}
                expanded={expanded}
                onToggle={() => setExpanded(!expanded)}
            >
                {body}
            </V3Section>
        )
    }
    return (
        <div className="mb-6 rounded-2xl p-5 flex flex-col gap-4" style={{ background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`, border: `1px solid ${colors.border}` }}>
            <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>Avaliações e comentários</h3>
            {body}
        </div>
    )
}
