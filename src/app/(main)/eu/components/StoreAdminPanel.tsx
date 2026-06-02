// components/StoreAdminPanel.tsx
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { StoreFlow } from './StoreFlow'
import { X } from 'lucide-react'

interface StoreAdminPanelProps {
    store: any
    profileSlug: string
    supabase: any
    isOpen: boolean
    onClose: () => void
    onToggleStatus: () => void
    onToggleScheduling: () => void
}

export function StoreAdminPanel({ store, profileSlug, supabase, isOpen, onClose, onToggleStatus, onToggleScheduling }: StoreAdminPanelProps) {
    const router = useRouter()
    const [sales, setSales] = useState<any[]>([])
    const [storeViews, setStoreViews] = useState<number>(0)
    const [productViews, setProductViews] = useState<number>(0)

    useEffect(() => {
        if (!isOpen) return
        async function loadData() {
            // Buscar vendas recentes
            const { data: salesData } = await supabase
                .from('store_sales')
                .select('*')
                .eq('store_id', store.id)
                .order('created_at', { ascending: false })
                .limit(100)
            setSales(salesData || [])

            // Contar visitas à loja (store_views)
            const { count: viewsCount } = await supabase
                .from('store_views')
                .select('*', { count: 'exact', head: true })
                .eq('store_id', store.id)
            setStoreViews(viewsCount || 0)

            // Contar visitas a produtos (product_views – crie a tabela se necessário)
            const { count: productViewsCount } = await supabase
                .from('product_views')
                .select('*', { count: 'exact', head: true })
                .eq('store_id', store.id)
            setProductViews(productViewsCount || 0)
        }
        loadData()
    }, [isOpen, store.id, supabase])

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm" onClick={onClose}>
            <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl p-6 shadow-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-black text-gray-800">Gerenciar Loja</h3>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl"><X size={20} /></button>
                </div>

                <StoreFlow
                    store={store}
                    sales={sales}
                    supabase={supabase}
                    onToggleStatus={onToggleStatus}
                    profile={{ profileSlug }}
                    onUpdateOrder={() => { }} // opcional
                    onAddProduct={() => router.push(`/${profileSlug}/${store.storeSlug}/criar-produto`)}
                    onEditStore={() => router.push(`/${profileSlug}/${store.storeSlug}/editar-loja`)}
                    onToggleScheduling={onToggleScheduling}
                    storeViews={storeViews}
                    productViews={productViews}
                />
            </div>
        </div>
    )
}