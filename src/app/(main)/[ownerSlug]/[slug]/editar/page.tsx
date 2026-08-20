// src/app/(app)/[ownerSlug]/[slug]/editar/page.tsx
import { Metadata } from 'next'
import { supabase } from '@/lib/supabase/client'
import { EditProductClient } from './EditProductClient'

interface PageProps {
    params: {
        ownerSlug: string
        slug: string
    }
}

// Gerar metadados
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { slug } = params

    return {
        title: `Editando produto | iUser`,
        description: `Edite seu produto no iUser`,
    }
}

// Buscar dados do produto no servidor
async function getProductData(slug: string, ownerSlug: string) {
    // Buscar o produto pelo slug
    const { data: product, error: productError } = await supabase
        .from('products')
        .select('*')
        .eq('slug', slug)
        .maybeSingle()

    if (productError || !product) {
        return null
    }

    // Verificar se o dono do slug é o dono do produto
    // Buscar o perfil ou loja pelo slug
    const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('profileSlug', ownerSlug)
        .maybeSingle()

    let ownerId = profile?.id

    if (!ownerId) {
        const { data: store } = await supabase
            .from('stores')
            .select('id, owner_id')
            .eq('storeSlug', ownerSlug)
            .maybeSingle()

        ownerId = store?.owner_id
    }

    // Verificar se o usuário logado é o dono
    const { data: { user } } = await supabase.auth.getUser()

    if (!user || user.id !== ownerId) {
        return null // Não autorizado
    }

    return product
}

export default async function EditProductPage({ params }: PageProps) {
    const { ownerSlug, slug } = params

    const product = await getProductData(slug, ownerSlug)

    if (!product) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <h1 className="text-2xl font-bold text-red-500">Produto não encontrado ou não autorizado</h1>
                    <p className="text-gray-500 mt-2">Você não tem permissão para editar este produto.</p>
                </div>
            </div>
        )
    }

    return <EditProductClient product={product} ownerSlug={ownerSlug} />
}