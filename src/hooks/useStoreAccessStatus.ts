// hooks/useStoreAccessStatus.ts
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

export interface StoreAccessSettings {
    price_cents: number
    validity_days: number | null
    pix_key: string | null
    pix_key_type: string | null
    pix_receiver_name: string | null
}

export interface StoreAccessGrant {
    id: string
    status: 'pending' | 'approved' | 'rejected' | 'consumed'
    grant_type: 'days' | 'lifetime' | null
    days: number | null
    amount_cents: number | null
    source: 'manual_pix' | 'code'
}

async function callAdminApi<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(path, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify(body || {}),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Erro na requisição')
    return json as T
}

// Status de acesso pra criar loja: admin geral sempre passa (bypass), outras
// contas precisam de um grant aprovado (pagamento PIX confirmado pelo admin,
// ou código resgatado). Um único hook usado nos 3 pontos de criação de loja.
export function useStoreAccessStatus(userId: string | null) {
    const [loading, setLoading] = useState(true)
    const [bypass, setBypass] = useState(false)
    const [settings, setSettings] = useState<StoreAccessSettings | null>(null)
    const [availableGrant, setAvailableGrant] = useState<StoreAccessGrant | null>(null)
    const [pendingRequest, setPendingRequest] = useState<StoreAccessGrant | null>(null)
    const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

    const reload = useCallback(async () => {
        if (!userId) {
            setLoading(false)
            return
        }
        setLoading(true)
        try {
            const whoami = await callAdminApi<{ isSuperAdmin: boolean }>('/api/admin/whoami')
            if (whoami.isSuperAdmin) {
                setBypass(true)
                setLoading(false)
                return
            }
            setBypass(false)

            const [{ data: settingsData }, { data: grants }] = await Promise.all([
                supabase
                    .from('store_access_settings')
                    .select('price_cents, validity_days, pix_key, pix_key_type, pix_receiver_name')
                    .eq('id', 1)
                    .single(),
                supabase
                    .from('store_access_grants')
                    .select('id, status, grant_type, days, amount_cents, source')
                    .eq('profile_id', userId)
                    .order('requested_at', { ascending: false })
                    .limit(20),
            ])

            setSettings((settingsData as StoreAccessSettings) || null)
            const list = (grants || []) as StoreAccessGrant[]
            setAvailableGrant(list.find((g) => g.status === 'approved') || null)
            setPendingRequest(list.find((g) => g.status === 'pending') || null)
        } finally {
            setLoading(false)
        }
    }, [userId])

    useEffect(() => {
        reload()
    }, [reload])

    useEffect(() => {
        if (!userId) return

        const channel = supabase.channel(`store-access-${userId}`)
        channel
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'store_access_grants',
                filter: `profile_id=eq.${userId}`,
            }, () => reload())
            .subscribe()
        channelRef.current = channel

        return () => {
            if (channelRef.current) supabase.removeChannel(channelRef.current)
            channelRef.current = null
        }
    }, [userId, reload])

    const requestManualPixPayment = useCallback(async () => {
        if (!userId) return
        const { error } = await supabase.from('store_access_grants').insert({
            profile_id: userId,
            source: 'manual_pix',
            status: 'pending',
        })
        if (error) throw error
        await reload()
    }, [userId, reload])

    const redeemCode = useCallback(async (code: string) => {
        const { error } = await supabase.rpc('redeem_store_access_code', { p_code: code.trim() })
        if (error) throw new Error(error.message)
        await reload()
    }, [reload])

    return {
        loading,
        bypass,
        settings,
        availableGrant,
        pendingRequest,
        requestManualPixPayment,
        redeemCode,
        reload,
    }
}
