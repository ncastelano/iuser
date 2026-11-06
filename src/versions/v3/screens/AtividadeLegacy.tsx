// src/versions/v3/screens/AtividadeLegacy.tsx
//
// Os endereços antigos /carrinho e /conversas, na 3.0, levam à Atividade (/atividade?aba=...), sem perder o resto (sala, conversa aberta, aba do carrinho). Quem tinha o link
// salvo ou vem de um aviso/push continua chegando ao lugar certo; o endereço que fica na barra é o da Atividade.
'use client'

import { Suspense, useEffect } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { legacyTarget } from '../atividade'

function Inner({ fallback }: { fallback: string }) {
    const router = useRouter()
    const pathname = usePathname()
    const sp = useSearchParams()
    const search = sp.toString()
    useEffect(() => {
        const base = (pathname || '').replace(/^\/v3(?=\/|$)/, '')   // a 3.0 serve /conversas por /v3/conversas
        router.replace(legacyTarget(base, search) || fallback)
    }, [pathname, search, fallback, router])
    return null
}

export default function AtividadeLegacy({ fallback }: { fallback: string }) {
    return <Suspense fallback={null}><Inner fallback={fallback} /></Suspense>
}
