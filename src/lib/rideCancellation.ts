// src/lib/rideCancellation.ts
//
// Regra anti-abuso: o motorista só pode recusar (cancelar depois de aceito)
// 1 corrida a cada 10 que ele concluiu. Livra o passageiro de motoristas que
// aceitam e desistem sem custo — mas ainda permite cancelar em casos reais.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface DriverCancelQuota {
    allowed: boolean
    completedCount: number
    cancelledCount: number
    limit: number
}

export async function getDriverCancelQuota(supabase: SupabaseClient, driverId: string): Promise<DriverCancelQuota> {
    const [{ count: completedCount }, { count: cancelledCount }] = await Promise.all([
        supabase.from('ride_requests').select('id', { count: 'exact', head: true }).eq('driver_id', driverId).eq('status', 'completed'),
        supabase.from('ride_requests').select('id', { count: 'exact', head: true }).eq('driver_id', driverId).eq('cancelled_by', 'driver'),
    ])

    const completed = completedCount || 0
    const cancelled = cancelledCount || 0
    const limit = Math.floor(completed / 10) + 1

    return { allowed: cancelled < limit, completedCount: completed, cancelledCount: cancelled, limit }
}

export function describeDriverCancelQuota(quota: DriverCancelQuota): string {
    return `Você já usou seu limite de cancelamentos (${quota.cancelledCount}/${quota.limit}). Libera mais 1 a cada 10 corridas concluídas.`
}
