'use client'

// AVALIAÇÃO RÁPIDA da 3.0 (decisão do dono, 10/11/2026): no lugar do cartão grande "Corrida finalizada! · Avaliar agora" + um segundo
// diálogo, UMA folha que sobe de baixo e já resolve tudo: as ESTRELAS para tocar, o comentário e — na COMPRA e no SERVIÇO — uma foto
// opcional (corrida de motorista não tem foto). Junta as três pendências numa fila só (corrida → compra → serviço, uma por vez,
// "1 de 3"); "Depois" esconde aquela (mesma memória do aparelho que os avisos antigos usavam).
// Onde grava: corrida → ride_reviews; compra → product_reviews (uma linha por produto do pedido, até 5); serviço → submit_appointment_review.
// A foto vai para o bucket público `posts`, na pasta da própria pessoa (`<id>/avaliacao-<hora>.<ext>`); o banco confere (migration 20261130000063).
// A 2.0 continua com os avisos de sempre (FinishedRideTrigger / FinishedOrderTrigger).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname } from 'next/navigation'
import { Camera, Car, ShoppingBag, Star, Wrench, X } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { toast } from '@/lib/toast'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { useIsV3 } from '@/components/MaintenanceNotice'
import { submitReview } from '@/lib/appointmentReviews'

type Kind = 'ride' | 'order' | 'service'
interface Pending { key: string; kind: Kind; title: string; sub: string; dismissKey: string; dismissId: string; photo: boolean; submit: (r: { rating: number; comment: string; photo: string | null }) => Promise<void> }

const ORANGE = '#f97316'
const NOTA = ['', 'Ruim', 'Pode melhorar', 'Ok', 'Boa', 'Excelente!']
const ICON: Record<Kind, typeof Car> = { ride: Car, order: ShoppingBag, service: Wrench }
const readDismissed = (k: string): Set<string> => { try { return new Set(JSON.parse(localStorage.getItem(k) || '[]')) } catch { return new Set() } }
const addDismissed = (k: string, id: string) => { try { const s = readDismissed(k); s.add(id); localStorage.setItem(k, JSON.stringify([...s].slice(-500))) } catch { /* sem armazenamento */ } }

async function loadPending(userId: string): Promise<Pending[]> {
    const out: Pending[] = []
    // só o que é recente (14 dias): pedir para avaliar algo de meses atrás é ruído
    const desde = new Date(Date.now() - 14 * 86400000).toISOString()
    // ---- corridas concluídas que eu ainda não avaliei (entrega de loja: quem avalia é o cliente, não o entregador) ----
    const { data: rides } = await supabase.from('ride_requests').select('id, requester_id, driver_id, order_id, created_at')
        .or(`requester_id.eq.${userId},driver_id.eq.${userId}`).eq('status', 'completed').gte('created_at', desde).order('created_at', { ascending: false }).limit(60)
    const rideList = (rides || []).filter((r: any) => r.driver_id && !(r.order_id && r.driver_id === userId))
    if (rideList.length) {
        const { data: done } = await supabase.from('ride_reviews').select('ride_request_id').eq('reviewer_id', userId).in('ride_request_id', rideList.map((r: any) => r.id))
        const reviewed = new Set((done || []).map((r: any) => r.ride_request_id)); const dism = readDismissed('dismissed_ride_reviews')
        const todo = rideList.filter((r: any) => !reviewed.has(r.id) && !dism.has(r.id))
        const ids = [...new Set(todo.map((r: any) => (r.requester_id === userId ? r.driver_id : r.requester_id)))]
        const { data: profs } = ids.length ? await supabase.from('profiles').select('id, name, profileSlug').in('id', ids) : { data: [] }
        const nameOf = new Map((profs || []).map((p: any) => [p.id, p.name || (p.profileSlug ? `@${p.profileSlug}` : '')]))
        for (const r of todo as any[]) {
            const other = r.requester_id === userId ? r.driver_id : r.requester_id
            const souPassageiro = r.requester_id === userId
            const nome = nameOf.get(other) || (souPassageiro ? 'o motorista' : 'o passageiro')
            out.push({
                key: `ride:${r.id}`, kind: 'ride', dismissKey: 'dismissed_ride_reviews', dismissId: r.id, photo: false,
                title: r.order_id ? `Como foi a entrega com ${nome}?` : `Como foi a corrida com ${nome}?`, sub: r.order_id ? 'Entrega concluída' : 'Corrida finalizada',
                submit: async ({ rating, comment }) => {
                    const { error } = await supabase.from('ride_reviews').insert({ ride_request_id: r.id, reviewer_id: userId, reviewee_id: other, rating, comment: comment || null })
                    if (error && error.code !== '23505') throw new Error(error.message)
                },
            })
        }
    }
    // ---- compras pagas sem avaliação (product_reviews.order_id guarda o checkout) ----
    const { data: orders } = await supabase.from('orders').select('checkout_id, store_id, created_at, stores(name), order_items(product_id, product_name)')
        .eq('buyer_id', userId).eq('status', 'paid').gte('created_at', desde).order('created_at', { ascending: false }).limit(40)
    if (orders?.length) {
        const { data: revs } = await supabase.from('product_reviews').select('order_id').eq('profile_id', userId).in('order_id', orders.map((o: any) => o.checkout_id))
        const reviewed = new Set((revs || []).map((r: any) => r.order_id)); const dism = readDismissed('dismissed_reviews')
        const seen = new Set<string>()
        for (const o of orders as any[]) {
            if (seen.has(o.checkout_id) || reviewed.has(o.checkout_id) || dism.has(o.checkout_id)) continue
            seen.add(o.checkout_id)
            const itens = [...new Map((o.order_items || []).filter((i: any) => i.product_id).map((i: any) => [i.product_id, i])).values()] as any[]
            if (!itens.length) continue
            out.push({
                key: `order:${o.checkout_id}`, kind: 'order', dismissKey: 'dismissed_reviews', dismissId: o.checkout_id, photo: true,
                title: `O que achou da compra na ${o.stores?.name || 'loja'}?`, sub: itens.length > 1 ? `${itens[0].product_name} +${itens.length - 1}` : itens[0].product_name,
                submit: async ({ rating, comment, photo }) => {
                    const rows = itens.slice(0, 5).map((i) => ({ store_id: o.store_id, product_id: i.product_id, profile_id: userId, order_id: o.checkout_id, rating, comment: comment || null, is_anonymous: false, photo_path: photo }))
                    const { error } = await supabase.from('product_reviews').insert(rows)
                    if (error && error.code !== '23505') throw new Error(error.message)
                },
            })
        }
    }
    // ---- serviços agendados que a loja/profissional marcou como feitos e eu não avaliei ----
    const { data: apts } = await supabase.from('appointments').select('id, service_name, store_name, owner_slug, status, completed_at, customer_id')
        .eq('customer_id', userId).eq('status', 'completed').gte('completed_at', desde).order('completed_at', { ascending: false }).limit(20)
    if (apts?.length) {
        const { data: revs } = await supabase.from('appointment_reviews').select('appointment_id').eq('reviewer_id', userId).eq('kind', 'service').in('appointment_id', apts.map((a: any) => a.id))
        const reviewed = new Set((revs || []).map((r: any) => r.appointment_id)); const dism = readDismissed('dismissed_service_reviews')
        for (const a of apts as any[]) {
            if (reviewed.has(a.id) || dism.has(a.id)) continue
            out.push({
                key: `service:${a.id}`, kind: 'service', dismissKey: 'dismissed_service_reviews', dismissId: a.id, photo: true,
                title: `Como foi o serviço${a.store_name ? ` na ${a.store_name}` : a.owner_slug ? ` com @${a.owner_slug}` : ''}?`, sub: a.service_name || 'Serviço finalizado',
                submit: async ({ rating, comment, photo }) => { await submitReview(a.id, rating, comment, photo) },
            })
        }
    }
    return out
}

export function QuickReviewHost() {
    const isV3 = useIsV3()
    const { userId, loading } = useProfile()
    const pathname = usePathname()
    const quiet = !!pathname?.startsWith('/administrador') || !!pathname?.startsWith('/tres-telas')
    const [fila, setFila] = useState<Pending[]>([])
    const busy = useRef(false)

    const load = useCallback(async () => {
        if (!userId || busy.current) return
        busy.current = true
        try { setFila(await loadPending(userId)) } catch { /* fica como estava */ } finally { busy.current = false }
    }, [userId])
    useEffect(() => {
        if (!isV3 || loading || !userId) return
        load()
        const again = () => { if (!document.hidden) load() }
        window.addEventListener('iuser-orders-changed', again)
        window.addEventListener('focus', again)
        return () => { window.removeEventListener('iuser-orders-changed', again); window.removeEventListener('focus', again) }
    }, [isV3, loading, userId, load])

    if (!isV3 || quiet || !userId || fila.length === 0) return null
    const atual = fila[0]
    return <QuickReviewCard key={atual.key} item={atual} userId={userId} posicao={fila.length > 1 ? `mais ${fila.length - 1} para avaliar` : null}
        onDone={() => setFila((f) => f.slice(1))}
        onLater={() => { addDismissed(atual.dismissKey, atual.dismissId); setFila((f) => f.slice(1)) }} />
}

function QuickReviewCard({ item, userId, posicao, onDone, onLater }: { item: Pending; userId: string; posicao: string | null; onDone: () => void; onLater: () => void }) {
    const { colors: c } = useTheme()
    const [rating, setRating] = useState(0)
    const [comment, setComment] = useState('')
    const [file, setFile] = useState<File | null>(null)
    const [sending, setSending] = useState(false)
    const [mounted, setMounted] = useState(false)
    const input = useRef<HTMLInputElement>(null)
    useEffect(() => setMounted(true), [])
    const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
    useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])
    const Icon = ICON[item.kind]

    const enviar = async () => {
        if (!rating || sending) return
        setSending(true)
        try {
            let photo: string | null = null
            if (file && item.photo) {
                const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z]/g, '') || 'jpg'
                const { data, error } = await supabase.storage.from('posts').upload(`${userId}/avaliacao-${Date.now()}.${ext === 'jpeg' ? 'jpg' : ext}`, file, { contentType: file.type || undefined })
                if (error || !data) throw new Error(error?.message || 'Não deu para enviar a foto')
                photo = data.path
            }
            await item.submit({ rating, comment: comment.trim().slice(0, 500), photo })
            toast.success('Obrigado pela avaliação!', { description: rating >= 4 ? 'Isso ajuda outras pessoas a escolher.' : 'Seu retorno ajuda a melhorar.' })
            onDone()
        } catch (e: any) {
            toast.error('Não deu para enviar', { description: e?.message })
            setSending(false)
        }
    }

    if (!mounted) return null
    return createPortal(
        <div className="fixed inset-x-0 top-0 z-[110] flex items-end justify-center" style={{ bottom: 'var(--staging-banner-h, 0px)' }}>
            <style>{`@keyframes qrSobe { from { opacity: 0; transform: translateY(40px) } to { opacity: 1; transform: none } } @media (prefers-reduced-motion: reduce) { .qr-card { animation: none !important } }`}</style>
            <button aria-label="Avaliar depois" onClick={onLater} className="absolute inset-0" style={{ background: 'rgba(0,0,0,.35)' }} />
            <div role="dialog" aria-modal="true" aria-label="Avaliar" className="qr-card relative w-full max-w-md rounded-t-[28px] px-4 pt-3 pb-[calc(14px+env(safe-area-inset-bottom))]"
                style={{ background: c.background, border: `1px solid ${c.border}`, boxShadow: '0 -16px 40px rgba(0,0,0,.25)', color: c.textPrimary, animation: 'qrSobe .28s ease-out' }}>
                <div className="flex justify-center mb-2"><span className="w-10 h-1.5 rounded-full" style={{ background: c.border }} /></div>
                <div className="flex items-start gap-3">
                    <span className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: `${ORANGE}1f`, color: ORANGE }}><Icon size={19} /></span>
                    <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-black uppercase tracking-wide" style={{ color: c.textSecondary }}>{item.sub}{posicao ? ` · ${posicao}` : ''}</p>
                        <p className="text-[16px] font-black leading-tight">{item.title}</p>
                    </div>
                    <button onClick={onLater} aria-label="Avaliar depois" className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ border: `1px solid ${c.border}` }}><X size={16} /></button>
                </div>

                <div className="flex justify-center gap-1.5 mt-4" role="radiogroup" aria-label="Nota">
                    {[1, 2, 3, 4, 5].map((n) => (
                        <button key={n} role="radio" aria-checked={rating === n} aria-label={`${n} ${n === 1 ? 'estrela' : 'estrelas'}`} onClick={() => setRating(n)} className="p-1 active:scale-90 transition">
                            <Star size={38} strokeWidth={1.6} fill={n <= rating ? '#eab308' : 'transparent'} style={{ color: n <= rating ? '#eab308' : c.border }} />
                        </button>
                    ))}
                </div>
                <p className="text-center text-[12.5px] font-black h-5 mt-0.5" style={{ color: rating ? '#a16207' : c.textSecondary }}>{rating ? NOTA[rating] : 'Toque nas estrelas'}</p>

                {rating > 0 && (
                    <div className="mt-2">
                        <div className="flex gap-2 items-stretch">
                            <textarea value={comment} onChange={(e) => setComment(e.target.value.slice(0, 500))} rows={2} placeholder="Quer contar como foi? (opcional)"
                                className="flex-1 min-w-0 rounded-2xl px-3 py-2.5 text-[13px] outline-none resize-none" style={{ background: c.surface, border: `1px solid ${c.border}`, color: c.textPrimary }} />
                            {item.photo && (
                                <button onClick={() => (file ? setFile(null) : input.current?.click())} aria-label={file ? 'Tirar a foto' : 'Adicionar foto'} className="w-[68px] rounded-2xl flex-shrink-0 overflow-hidden flex flex-col items-center justify-center gap-0.5 text-[10.5px] font-black relative"
                                    style={{ border: `1.5px dashed ${file ? ORANGE : c.border}`, color: c.textSecondary }}>
                                    {preview ? <><img src={preview} alt="" className="absolute inset-0 w-full h-full object-cover" /><span className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center"><X size={11} /></span></> : <><Camera size={18} />Foto</>}
                                </button>
                            )}
                            <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                        </div>
                    </div>
                )}

                <div className="flex gap-2 mt-3">
                    <button onClick={onLater} className="h-12 px-4 rounded-full text-[13px] font-black" style={{ border: `1px solid ${c.border}`, color: c.textSecondary }}>Depois</button>
                    <button onClick={enviar} disabled={!rating || sending} className="flex-1 h-12 rounded-full text-[14px] font-black text-white disabled:opacity-40 active:scale-95 transition" style={{ background: ORANGE }}>{sending ? 'Enviando…' : 'Enviar avaliação'}</button>
                </div>
            </div>
        </div>,
        document.body,
    )
}
