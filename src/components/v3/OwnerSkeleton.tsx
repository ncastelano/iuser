// src/components/v3/OwnerSkeleton.tsx
//
// Esqueleto de /[perfil ou loja] ANTES de saber se o endereço é de uma loja ou de uma pessoa: usa o que a gente já viu daquele
// endereço neste aparelho (guardado por `rememberOwnerType`) e, na primeira vez, o da loja.
'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import StoreSkeleton from './StoreSkeleton'
import ProfileSkeleton from './ProfileSkeleton'

const key = (slug: string) => `iuser_owner_type:${slug.toLowerCase()}`

export function rememberOwnerType(slug: string | undefined, type: 'profile' | 'store') {
    if (!slug) return
    try { localStorage.setItem(key(slug), type) } catch { /* sem storage: só perde a dica */ }
}

export default function OwnerSkeleton() {
    const params = useParams()
    const slug = Array.isArray(params?.ownerSlug) ? params.ownerSlug[0] : (params?.ownerSlug as string | undefined)
    const [type, setType] = useState<'profile' | 'store'>('store')
    useEffect(() => {
        if (!slug) return
        try { setType(localStorage.getItem(key(slug)) === 'profile' ? 'profile' : 'store') } catch { /* mantém loja */ }
    }, [slug])
    return type === 'profile' ? <ProfileSkeleton /> : <StoreSkeleton />
}
