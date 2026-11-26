'use client'

// src/components/StoreDashboard/StoreNotifications.tsx — "Notificações do celular" da loja: o dono liga ou desliga os avisos que chegam
// na notificação do aparelho (visita, produto visto, item na sacola). Pedido novo sempre avisa: não tem interruptor aqui.
// Só o dono lê e altera (RPCs get/set_store_notification_settings; migration 20261130000134).
import { useEffect, useState } from 'react'
import { Eye, Package, ShoppingBag } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { toast } from '@/lib/toast'
import { useTheme } from '@/app/contexts/theme'

type Key = 'visit_push' | 'product_view_push' | 'cart_push'
type Settings = Record<Key, boolean>

const ROWS: { k: Key; icon: React.ReactNode; cor: string; t: string; sub: string }[] = [
    { k: 'visit_push', icon: <Eye size={18} />, cor: '#2563eb', t: 'Visitas na loja', sub: 'Quando alguém abre a sua loja' },
    { k: 'product_view_push', icon: <Package size={18} />, cor: '#7c3aed', t: 'Produtos vistos', sub: 'Quando alguém abre um produto' },
    { k: 'cart_push', icon: <ShoppingBag size={18} />, cor: '#16a34a', t: 'Itens na sacola', sub: 'Quando alguém coloca um item na sacola' },
]

export default function StoreNotifications({ storeId }: { storeId: string }) {
    const { colors } = useTheme()
    const [s, setS] = useState<Settings | null>(null)
    const [saving, setSaving] = useState(false)
    const card = { background: colors.surface, border: `1px solid ${colors.border}` }

    useEffect(() => {
        let cancelled = false
        supabase.rpc('get_store_notification_settings', { p_store: storeId }).then(({ data, error }) => {
            if (cancelled) return
            if (error) { setS({ visit_push: true, product_view_push: true, cart_push: true }); return }
            const row = Array.isArray(data) ? data[0] : data
            setS({ visit_push: row?.visit_push !== false, product_view_push: row?.product_view_push !== false, cart_push: row?.cart_push !== false })
        })
        return () => { cancelled = true }
    }, [storeId])

    const toggle = async (k: Key) => {
        if (!s || saving) return
        const next = { ...s, [k]: !s[k] }
        setS(next) // resposta na hora; se o banco recusar, volta
        setSaving(true)
        const { error } = await supabase.rpc('set_store_notification_settings', {
            p_store: storeId, p_visit: next.visit_push, p_product_view: next.product_view_push, p_cart: next.cart_push,
        })
        setSaving(false)
        if (error) { setS(s); toast.error('Não deu para salvar agora', { description: error.message }) }
    }

    if (!s) return <div className="rounded-3xl h-24 animate-pulse" style={{ background: `${colors.border}40` }} />

    return (
        <div className="rounded-3xl overflow-hidden" style={card}>
            {ROWS.map((r, i) => (
                <div key={r.k} className="flex items-center gap-3 px-3.5 py-3" style={{ borderTop: i ? `1px solid ${colors.border}` : undefined }}>
                    <span className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: `${r.cor}26`, color: r.cor }}>{r.icon}</span>
                    <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] font-black leading-tight" style={{ color: colors.textPrimary }}>{r.t}</span>
                        <span className="block text-[11.5px] font-semibold leading-tight mt-0.5" style={{ color: colors.textSecondary }}>{r.sub}</span>
                    </span>
                    <button
                        type="button"
                        role="switch"
                        aria-checked={s[r.k]}
                        aria-label={r.t}
                        onClick={() => toggle(r.k)}
                        className="relative inline-flex flex-shrink-0 rounded-full transition-colors duration-200"
                        style={{ width: 44, height: 24, background: s[r.k] ? '#f97316' : colors.border }}
                    >
                        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${s[r.k] ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                </div>
            ))}
            <p className="px-3.5 pb-3 pt-2 text-[11px] leading-snug" style={{ color: colors.textSecondary, borderTop: `1px solid ${colors.border}` }}>
                Pedido novo sempre avisa. Os avisos de visita, produto e sacola chegam no máximo um a cada 10 minutos, para não lotar o celular.
            </p>
        </div>
    )
}
