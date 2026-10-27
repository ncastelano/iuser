// src/components/StoreDashboard/StoreServiceOrders.tsx
//
// PEDIDOS DE SERVIÇO da loja (a aba "Serviços" do cartão "Pedidos na loja"): quem agenda um serviço da loja manda um PEDIDO, e só vai para a agenda
// se a loja ACEITAR aqui. Cada cliente é um cartão (`ServiceInvitationCard`) com os horários pedidos, o estado da entrada e o histórico dele; o
// dono aceita ou recusa cada horário. A regra da entrada é a do banco: com a entrada informada, "aceitar" confirma o Pix (`confirm_appointment_deposit`),
// que confirma o agendamento; com a entrada ainda pendente, não dá para aceitar.
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase/client'
import { notifyAppointmentUpdate } from '@/lib/notifyRideStatus'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { useProfilesById } from '@/hooks/useProfilesById'
import { isServiceBooking } from '@/lib/appointmentReviews'
import ServiceInvitationCard from '@/components/appointments/ServiceInvitationCard'
import type { Appointment } from '@/app/(main)/compromissos/dadosDoCompromisso'

/** Os agendamentos de serviço DESTA loja (pendentes, aceitos e feitos), sempre atualizados */
export function useStoreServiceAppointments(storeId: string | null | undefined) {
    const { userId } = useProfile()
    const [rows, setRows] = useState<Appointment[]>([])
    const [loading, setLoading] = useState(true)

    const load = useCallback(async () => {
        if (!storeId || !userId) return
        const { data } = await supabase
            .from('appointments')
            .select('*')
            .eq('store_id', storeId)
            .in('status', ['pending', 'confirmed', 'completed'])
            .order('date', { ascending: true })
            .order('time', { ascending: true })
        setRows(((data || []) as Appointment[]).filter((a) => isServiceBooking(a)))
        setLoading(false)
    }, [storeId, userId])

    useEffect(() => { load() }, [load])
    useEffect(() => {
        if (!storeId) return
        const ch = supabase
            .channel(`store-service-orders-${storeId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments', filter: `store_id=eq.${storeId}` }, () => load())
            .subscribe()
        return () => { supabase.removeChannel(ch) }
    }, [storeId, load])

    const pending = useMemo(() => rows.filter((a) => a.status === 'pending'), [rows])
    const confirmed = useMemo(() => rows.filter((a) => a.status === 'confirmed'), [rows])
    const completed = useMemo(() => rows.filter((a) => a.status === 'completed'), [rows])
    return { rows, pending, confirmed, completed, loading, refetch: load }
}

export default function StoreServiceOrders({ pending, onChanged }: { pending: Appointment[]; onChanged: () => void }) {
    const { colors } = useTheme()
    const people = useProfilesById(pending.map((a) => a.customer_id))
    const palette = { textPrimary: colors.textPrimary, textSecondary: colors.textSecondary, surface: colors.surface, border: colors.border, accent: colors.accent }

    const byClient = useMemo(() => {
        const m = new Map<string, Appointment[]>()
        for (const a of pending) m.set(a.customer_id, [...(m.get(a.customer_id) || []), a])
        return m
    }, [pending])

    const accept = useCallback(async (id: string) => {
        const a = pending.find((x) => x.id === id)
        if (!a) return
        if (a.deposit_status === 'awaiting') { toast.info('Aguardando o cliente pagar a entrada — depois que ele informar o Pix, é só aceitar.'); return }
        const { error } = a.deposit_status === 'reported'
            ? await supabase.rpc('confirm_appointment_deposit', { p_appointment: id })
            : await supabase.from('appointments').update({ status: 'confirmed' }).eq('id', id)
        if (error) { toast.error(error.message.includes('pós-pago') ? error.message : 'Não foi possível aceitar o serviço.'); return }
        notifyAppointmentUpdate(id)
        toast.success('Serviço aceito — já está na agenda')
        onChanged()
    }, [pending, onChanged])

    const decline = useCallback(async (id: string) => {
        const { error } = await supabase.from('appointments').update({ status: 'cancelled' }).eq('id', id)
        if (error) { toast.error('Não foi possível recusar.'); return }
        notifyAppointmentUpdate(id)
        onChanged()
    }, [onChanged])

    if (pending.length === 0) {
        return (
            <div className="rounded-xl p-6 text-center relative z-10" style={{ background: `${colors.border}20`, border: `1px dashed ${colors.border}` }}>
                <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>Nenhum pedido de serviço esperando</p>
                <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>Quando alguém agendar um serviço da loja, o pedido aparece aqui para você aceitar. Só o que for aceito vai para a agenda.</p>
            </div>
        )
    }
    return (
        <div className="flex flex-col gap-3 relative z-10">
            {[...byClient.entries()].map(([clientId, list]) => {
                const first = list[0]
                const person = people.get(clientId)
                return (
                    <ServiceInvitationCard
                        key={clientId}
                        client={{ id: clientId, slug: person?.profileSlug || first.customer_slug, name: person?.name || null, avatarUrl: person?.avatarUrl || null }}
                        slots={[...list].sort((x, y) => `${x.date}T${x.time}`.localeCompare(`${y.date}T${y.time}`)).map((a) => ({ id: a.id, date: a.date, time: a.time, duration_minutes: a.duration_minutes, service_name: a.service_name, deposit_status: a.deposit_status, deposit_amount: a.deposit_amount }))}
                        palette={palette}
                        onAccept={accept}
                        onDecline={decline}
                    />
                )
            })}
        </div>
    )
}
