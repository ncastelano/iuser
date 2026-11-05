// src/modules/earnings/load.ts — lê as corridas concluídas do próprio motorista (a política do banco só deixa ele ver as que aceitou)
import { supabase } from '@/lib/supabase/client'
import { periodStart, type EarningRow } from './domain'

/** As corridas concluídas deste mês (o maior período mostrado) do motorista */
export async function loadMonthEarnings(driverId: string, now: Date = new Date()): Promise<EarningRow[]> {
    const { data, error } = await supabase
        .from('ride_requests')
        .select('status, created_at, agreed_price, offered_price, order_id, ride_started_at')
        .eq('driver_id', driverId)
        .eq('status', 'completed')
        .gte('ride_started_at', periodStart(now, 'month').toISOString())
        .order('ride_started_at', { ascending: false })
        .limit(2000)
    if (error) throw error
    return ((data as any[]) || []).map((r) => ({ status: r.status, started_at: r.ride_started_at, created_at: r.created_at, agreed_price: r.agreed_price, offered_price: r.offered_price, order_id: r.order_id }))
}
