//app/[storeSlug]/novo-produto/[productSlug]/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface Product {
    id: string
    name: string
    price: number
    type: string
    slug: string
    store_id: string
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
                .select('id')
                .eq('slug', storeSlug)
                .single()

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

            // 🖼 buscar imagem
            const { data: imageData } = await supabase
                .from('product_images')
                .select('url')
                .eq('product_id', productData.id)
                .single()

            if (imageData) {
                setImage(imageData.url)
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
        <div className="min-h-screen bg-black text-white p-6">

            <div className="max-w-4xl mx-auto">

                {/* IMAGEM */}
                <div className="w-full h-80 bg-zinc-900 rounded mb-6 overflow-hidden">
                    {image && (
                        <img
                            src={image}
                            className="w-full h-full object-cover"
                        />
                    )}
                </div>

                {/* INFO */}
                <h1 className="text-2xl font-bold mb-2">
                    {product.name}
                </h1>

                <p className="text-zinc-400 mb-4">
                    Tipo: {product.type}
                </p>

                <p className="text-xl mb-6">
                    R$ {product.price}
                </p>

                {/* BOTÃO */}
                <button className="bg-orange-400 text-black px-6 py-3 rounded font-semibold">
                    Comprar
                </button>

            </div>

        </div>
    )
}
