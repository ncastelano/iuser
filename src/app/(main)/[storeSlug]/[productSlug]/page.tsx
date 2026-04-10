//app/[storeSlug]/[productSlug]/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, ShoppingCart } from 'lucide-react'

interface Product {
    id: string
    name: string
    price: number | null
    type: string | null
    category: string | null
    slug: string
    store_id: string
    description: string | null
    image_url: string | null
}

export default function ProductPage() {
    const params = useParams()
    const router = useRouter()
    const supabase = createClient()

    const storeSlug = Array.isArray(params.storeSlug)
        ? params.storeSlug[0]
        : params.storeSlug

    const productSlug = Array.isArray(params.productSlug)
        ? params.productSlug[0]
        : params.productSlug

    const [product, setProduct] = useState<Product | null>(null)
    const [image, setImage] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const loadProduct = async () => {

            // 🔍 buscar loja
            const { data: store } = await supabase
                .from('stores')
                .select('id, name, storeSlug')
                .ilike('storeSlug', storeSlug)
                .maybeSingle()

            if (!store) {
                router.push('/')
                return
            }

            // 🔥 buscar produto pelo slug
            const { data: productData } = await supabase
                .from('products')
                .select('*')
                .eq('store_id', store.id)
                .eq('slug', productSlug)
                .single()

            if (!productData) {
                router.push(`/${storeSlug}`)
                return
            }

            setProduct(productData)

            if (productData.image_url) {
                const url = supabase.storage.from('product-images').getPublicUrl(productData.image_url).data.publicUrl
                setImage(url)
            }

            setLoading(false)
        }

        loadProduct()
    }, [storeSlug, productSlug])

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-black text-white">
                Carregando...
            </div>
        )
    }

    if (!product) return null

    return (
        <div className="flex flex-col gap-6 w-full animate-fade-in relative z-10">
            {/* HEADER INTERNO */}
            <div className="flex items-center gap-4 pb-4 border-b border-white/10">
                <button
                    onClick={() => router.back()}
                    className="flex w-10 h-10 items-center justify-center bg-neutral-900 border border-neutral-800 rounded-xl hover:bg-neutral-800 hover:border-white/50 transition shadow-md group"
                >
                    <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                </button>
                <div className="flex flex-col">
                    <h1 className="text-xl font-bold truncate tracking-wide text-white">
                        {product.name}
                    </h1>
                    <span className="text-xs text-neutral-300 uppercase font-black tracking-widest">{product.type || product.category || 'Produto'}</span>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-4">
                {/* IMAGEM */}
                <div className="w-full aspect-square md:aspect-auto md:h-[500px] bg-neutral-950 rounded-2xl overflow-hidden border border-neutral-800 shadow-2xl relative group">
                    {image ? (
                        <img
                            src={image}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                            alt={product.name}
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center">
                            <span className="text-neutral-600 font-medium tracking-wide">Sem Imagem</span>
                        </div>
                    )}
                </div>

                {/* INFO E COMPRA */}
                <div className="flex flex-col">
                    <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400 mb-4">
                        {product.name}
                    </h1>

                    <p className="text-white font-black text-3xl mb-8">
                        R$ {(product.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>

                    {product.description && (
                        <div className="bg-neutral-900/50 border border-neutral-800 p-6 rounded-2xl mb-8">
                            <h3 className="text-xs text-neutral-500 font-bold uppercase tracking-widest mb-3">Sobre o Produto</h3>
                            <p className="text-neutral-300 leading-relaxed text-sm">
                                {product.description}
                            </p>
                        </div>
                    )}

                    <div className="mt-auto">
                        <button className="w-full bg-white hover:bg-neutral-200 text-black py-4 rounded-xl font-extrabold text-lg shadow-[0_4px_15px_rgba(255,255,255,0.3)] hover:shadow-[0_4px_25px_rgba(255,255,255,0.4)] transform hover:-translate-y-0.5 active:scale-[0.98] transition-all flex items-center justify-center gap-2">
                            <ShoppingCart className="w-5 h-5" /> Comprar Agora
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
