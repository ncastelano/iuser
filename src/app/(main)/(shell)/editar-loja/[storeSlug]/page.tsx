// app/(main)/(shell)/editar-loja/[storeSlug]/page.tsx
//
// A EDIÇÃO da loja agora mora dentro do painel (/painel-loja/<slug>), embaixo de "Gerenciar a loja". Este endereço só
// leva para lá, com o mesmo ?secao= e ?aba= (links antigos, do Digital, de avisos e de páginas que ainda apontam aqui).
'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Spinner } from '@/components/Spinner'

export default function EditarLojaPage() {
    const router = useRouter()
    const params = useParams()
    const storeSlug = (Array.isArray(params.storeSlug) ? params.storeSlug[0] : params.storeSlug) || ''

    useEffect(() => {
        router.replace(`/painel-loja/${encodeURIComponent(storeSlug)}${window.location.search}`)
    }, [router, storeSlug])

    return (
        <div className="flex items-center justify-center py-16">
            <Spinner />
        </div>
    )
}
