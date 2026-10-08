// app/(main)/compromissos/page.tsx
// /compromissos sozinho só encaminha pra agenda certa (mantém os links antigos funcionando):
//   /compromissos                       → /compromissos/<meu perfil>
//   /compromissos?tab=<id da loja>      → /compromissos/<slug da loja>
//   /compromissos?tab=agenda-perfil     → /compromissos/<meu perfil>?aba=clientes
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { useProfile } from '@/app/contexts/ProfileContext'
import { Spinner } from '@/components/Spinner'

export default function CompromissosRedirect() {
    const router = useRouter()
    const { userId, profileSlug, loading } = useProfile()

    useEffect(() => {
        if (loading) return
        if (!userId || !profileSlug) {
            router.replace('/login')
            return
        }
        let cancelled = false
        const tab = new URLSearchParams(window.location.search).get('tab')
        const go = async () => {
            if (tab === 'agenda-perfil') {
                router.replace(`/compromissos/${profileSlug}?aba=clientes`)
                return
            }
            if (tab) {
                const { data } = await supabase.from('stores').select('storeSlug').eq('id', tab).maybeSingle()
                if (!cancelled && data?.storeSlug) {
                    router.replace(`/compromissos/${data.storeSlug}`)
                    return
                }
            }
            if (!cancelled) router.replace(`/compromissos/${profileSlug}`)
        }
        go()
        return () => { cancelled = true }
    }, [loading, userId, profileSlug, router])

    return (
        <div className="min-h-screen flex items-center justify-center">
            <Spinner size={28} />
        </div>
    )
}
