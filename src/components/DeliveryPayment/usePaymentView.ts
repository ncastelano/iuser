// Leitura do fluxo financeiro declaratório de uma entrega V2 (get_delivery_payment_view). Tudo que aparece vem do servidor; nada é calculado aqui.
'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

export interface PaymentView {
    role: 'customer' | 'store' | 'driver'
    phase: string
    state: string
    frozen_freight: number | null
    estimated_freight: number | null
    items_total?: number
    delivery_fee?: number
    total_amount?: number
    reserved_until: string | null
    customer_payment_reported: boolean
    driver_payment_reported: boolean
    driver_confirmed: boolean
    driver_denied: boolean
    open_incident: boolean
    store?: { name: string; accepts_pix: boolean; accepts_card: boolean; accepts_cash: boolean; pix_key_type: string | null; pix_key: string | null }
    driver?: { slug: string | null; name: string | null }
    amount_to_pay_driver?: number
    driver_pix_type?: string | null
    driver_pix_key?: string | null
    amount_to_receive?: number
    can_respond?: boolean
}

export function usePaymentView(dispatchId: string | null | undefined, pollMs = 15_000) {
    const [view, setView] = useState<PaymentView | null>(null)
    const load = useCallback(async () => {
        if (!dispatchId) return
        const { data, error } = await supabase.rpc('get_delivery_payment_view', { p_dispatch: dispatchId })
        if (!error) setView(data as PaymentView)
    }, [dispatchId])
    useEffect(() => {
        if (!dispatchId) { setView(null); return }
        load()
        const t = setInterval(load, pollMs)
        return () => clearInterval(t)
    }, [dispatchId, load, pollMs])
    return { view, reload: load }
}

export async function copyText(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text)
        return true
    } catch {
        return false
    }
}
