// components/PageViewTracker.tsx
'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { useProfile } from '@/app/contexts/ProfileContext'
import { supabase } from '@/lib/supabase/client'

function getAnonymousId(): string {
    try {
        const key = 'iuser_anon_id'
        let id = localStorage.getItem(key)
        if (!id) {
            id = crypto.randomUUID()
            localStorage.setItem(key, id)
        }
        return id
    } catch {
        return crypto.randomUUID()
    }
}

// Registra cada troca de página em site_visits — é o que alimenta a aba
// "Atividade" do admin, pra ver tudo que acontece no iUser (cadastrado ou
// não) desde a home. Espera o ProfileContext resolver antes de gravar, pra
// não marcar como "anônimo" alguém que só ainda não terminou de logar.
export default function PageViewTracker() {
    const pathname = usePathname()
    const { userId, loading } = useProfile()
    const lastTracked = useRef<string | null>(null)

    useEffect(() => {
        if (!pathname || loading || lastTracked.current === pathname) return
        lastTracked.current = pathname
        supabase
            .from('site_visits')
            .insert({
                path: pathname,
                user_id: userId,
                anonymous_id: getAnonymousId(),
                referrer: document.referrer || null,
            })
            .then(() => {}, () => {})
    }, [pathname, userId, loading])

    return null
}
