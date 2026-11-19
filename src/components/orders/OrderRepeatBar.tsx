// components/orders/OrderRepeatBar.tsx — no cartão do pedido (Itens → Histórico): ★ favorito e "Repetir pedido" (19/11/2026).
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Star, RotateCcw } from 'lucide-react'
import { toast } from '@/lib/toast'
import { loadFavoriteOrderIds, repeatOrder, setOrderFavorite } from '@/modules/items/load'

const ORANGE = '#f97316'
let favCache: Promise<Set<string>> | null = null
const favs = () => (favCache ||= loadFavoriteOrderIds().catch(() => new Set<string>()))
if (typeof window !== 'undefined') window.addEventListener('iuser-order-favorites', () => { favCache = null })

export default function OrderRepeatBar({ orderId, colors }: { orderId: string; colors: { border: string; textPrimary: string } }) {
    const router = useRouter()
    const [fav, setFav] = useState(false)
    const [busy, setBusy] = useState(false)
    useEffect(() => { let on = true; favs().then((s) => on && setFav(s.has(orderId))); return () => { on = false } }, [orderId])

    const toggle = async () => {
        const next = !fav; setFav(next)
        try { await setOrderFavorite(orderId, next); toast.success(next ? 'Pedido nos favoritos' : 'Tirado dos favoritos') }
        catch { setFav(!next); toast.error('Não foi possível salvar') }
    }
    const repeat = async () => {
        setBusy(true)
        try {
            const r = await repeatOrder(orderId)
            if (!r.added) { toast.error('Os itens deste pedido não estão mais à venda'); return }
            toast.success(r.skipped ? `Itens no carrinho · ${r.skipped} saíram do ar` : 'Itens no carrinho', { description: 'Confira o preço de hoje antes de finalizar.' })
            router.push('/atividade?aba=carrinho')
        } catch { toast.error('Não foi possível repetir o pedido') } finally { setBusy(false) }
    }
    return (
        <div className="flex gap-2 px-4 pt-3">
            <button onClick={repeat} disabled={busy} className="flex-1 h-9 rounded-full text-[12.5px] font-black flex items-center justify-center gap-1.5 disabled:opacity-60" style={{ background: `${ORANGE}1f`, color: ORANGE }}>
                <RotateCcw size={14} /> {busy ? 'Pondo no carrinho…' : 'Repetir pedido'}
            </button>
            <button onClick={toggle} aria-pressed={fav} aria-label={fav ? 'Tirar dos favoritos' : 'Favoritar pedido'} className="h-9 px-3 rounded-full text-[12.5px] font-black flex items-center gap-1.5" style={{ background: fav ? '#eab3081f' : `${colors.border}40`, color: fav ? '#ca8a04' : colors.textPrimary }}>
                <Star size={14} fill={fav ? '#eab308' : 'none'} color={fav ? '#eab308' : 'currentColor'} /> {fav ? 'Favorito' : 'Favoritar'}
            </button>
        </div>
    )
}
