import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export type Mode = 'lojas' | 'servicos' | 'produtos'

export function useMapData() {
    const [stores, setStores] = useState<any[]>([])
    const [products, setProducts] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const load = async () => {
            const supabase = createClient()

            const { data: storesData } = await supabase.from('stores').select('*')
            const { data: productsData } = await supabase.from('products').select('*')
            const { data: profilesList } = await supabase.from('profiles').select('id, profileSlug')

            const mappedStores = (storesData || []).map(s => ({
                ...s,
                profileSlug: (profilesList || []).find((profile) => profile.id === s.owner_id)?.profileSlug || 'loja',
                logo_url: s.logo_url
                    ? supabase.storage.from('store-logos').getPublicUrl(s.logo_url).data.publicUrl
                    : null,
                is_open: s.is_open ?? true
            }))

            const mappedProducts = (productsData || []).map(p => ({
                ...p,
                image_url: p.image_url
                    ? supabase.storage.from('product-images').getPublicUrl(p.image_url).data.publicUrl
                    : null
            }))

            setStores(mappedStores)
            setProducts(mappedProducts)
            setLoading(false)
        }

        load()
    }, [])

    return { stores, products, loading }
}