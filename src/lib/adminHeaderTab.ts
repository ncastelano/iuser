// src/lib/adminHeaderTab.ts
//
// Aba "Administrador" do Header — só aparece pro administrador geral (a rota
// /api/admin/whoami decide; ninguém mais chega a ver a aba) e leva direto pro
// painel Admin, que mora em perfil → "Convidei para o iUser" → Admin.
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Shield } from 'lucide-react'
import { callAdminApi } from '@/lib/callAdminApi'
import type { Tab } from '@/components/Header'

export const ADMIN_PANEL_URL = '/?view=perfil&painel=admin'

export function useAdminHeaderTab(userId: string | null | undefined): Tab | null {
    const router = useRouter()
    const [isSuperAdmin, setIsSuperAdmin] = useState(false)

    useEffect(() => {
        if (!userId) {
            setIsSuperAdmin(false)
            return
        }
        let cancelled = false
        callAdminApi<{ isSuperAdmin: boolean }>('/api/admin/whoami')
            .then((json) => { if (!cancelled) setIsSuperAdmin(!!json.isSuperAdmin) })
            .catch(() => { if (!cancelled) setIsSuperAdmin(false) })
        return () => { cancelled = true }
    }, [userId])

    return useMemo(() => (
        isSuperAdmin
            ? { id: 'admin', label: 'Administrador', icon: Shield, imageUrl: null, onClick: () => router.push(ADMIN_PANEL_URL), isActive: false }
            : null
    ), [isSuperAdmin, router])
}
