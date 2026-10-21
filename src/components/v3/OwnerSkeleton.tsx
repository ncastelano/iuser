// src/components/v3/OwnerSkeleton.tsx
//
// Esqueleto de /[perfil ou loja] ANTES de saber se o endereço é de uma loja ou de uma pessoa: usa o que a gente já viu daquele
// endereço neste aparelho (guardado por `rememberOwnerType`) e, na primeira vez, o da loja.
// `shellPending`: o cookie diz que a pessoa usa a 3.0 mas a página ainda não está dentro da casca (primeira carga de uma sessão
// nova, antes da versão ser confirmada): desenha uma barra de topo no lugar da navbar, para ela não "sumir" no meio do carregamento.
'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useInsideShell } from '@/components/InsideShell'
import { useTheme } from '@/app/contexts/theme'
import StoreSkeleton from './StoreSkeleton'
import ProfileSkeleton from './ProfileSkeleton'

const key = (slug: string) => `iuser_owner_type:${slug.toLowerCase()}`

export function rememberOwnerType(slug: string | undefined, type: 'profile' | 'store') {
    if (!slug) return
    try { localStorage.setItem(key(slug), type) } catch { /* sem storage: só perde a dica */ }
}

function FauxNavbar() {
    const { colors } = useTheme()
    const dot = 'rgba(255,255,255,0.3)'
    return (
        <div aria-hidden style={{ background: 'linear-gradient(160deg, #f97316 0%, #ea580c 100%)', height: 'calc(74px + env(safe-area-inset-top))', paddingTop: 'env(safe-area-inset-top)' }} className="flex items-center gap-3 px-4">
            <span className="block w-11 h-11 rounded-full animate-pulse flex-shrink-0" style={{ background: dot }} />
            <span className="flex flex-col gap-1.5 flex-1">
                <span className="block h-2.5 w-24 rounded animate-pulse" style={{ background: dot }} />
                <span className="block h-4 w-32 rounded animate-pulse" style={{ background: dot }} />
            </span>
            {[0, 1, 2].map((i) => <span key={i} className="block w-8 h-8 rounded-full animate-pulse" style={{ background: dot }} />)}
            <span className="sr-only" style={{ color: colors.textPrimary }}>.</span>
        </div>
    )
}

export default function OwnerSkeleton({ shellPending = false }: { shellPending?: boolean }) {
    const params = useParams()
    const { colors } = useTheme()
    const insideShell = useInsideShell()
    const slug = Array.isArray(params?.ownerSlug) ? params.ownerSlug[0] : (params?.ownerSlug as string | undefined)
    const [type, setType] = useState<'profile' | 'store'>('store')
    useEffect(() => {
        if (!slug) return
        try { setType(localStorage.getItem(key(slug)) === 'profile' ? 'profile' : 'store') } catch { /* mantém loja */ }
    }, [slug])
    const body = type === 'profile' ? <ProfileSkeleton /> : <StoreSkeleton />
    if (shellPending && !insideShell) {
        return (
            <div style={{ background: 'linear-gradient(160deg, #f97316 0%, #ea580c 100%)' }}>
                <FauxNavbar />
                <div className="rounded-t-[28px] min-h-screen" style={{ background: colors.background }}>{body}</div>
            </div>
        )
    }
    return body
}
