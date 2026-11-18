// src/components/v3/OwnerSkeleton.tsx
//
// Esqueleto de /[perfil ou loja] ANTES de saber se o endereço é de uma loja ou de uma pessoa: usa o que a gente já viu daquele
// endereço neste aparelho (guardado por `rememberOwnerType`: loja, perfil ou perfil de MOTORISTA, que tem página própria) e, na primeira vez, o da loja.
'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import StoreSkeleton from './StoreSkeleton'
import ProfileSkeleton from './ProfileSkeleton'
import DriverSkeleton from './DriverSkeleton'

export type OwnerHint = 'profile' | 'store' | 'driver'

const key = (slug: string) => `iuser_owner_type:${slug.toLowerCase()}`

export function rememberOwnerType(slug: string | undefined, type: OwnerHint) {
    if (!slug) return
    try { localStorage.setItem(key(slug), type) } catch { /* sem storage: só perde a dica */ }
}

export default function OwnerSkeleton() {
    const params = useParams()
    const slug = Array.isArray(params?.ownerSlug) ? params.ownerSlug[0] : (params?.ownerSlug as string | undefined)
    const [type, setType] = useState<OwnerHint>('store')
    useEffect(() => {
        if (!slug) return
        try { const v = localStorage.getItem(key(slug)); setType(v === 'profile' || v === 'driver' ? v : 'store') } catch { /* mantém loja */ }
    }, [slug])
    return type === 'driver' ? <DriverSkeleton standalone /> : type === 'profile' ? <ProfileSkeleton /> : <StoreSkeleton />
}
