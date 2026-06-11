// app/(main)/compromissos/dadosDoCompromisso.ts
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'

export type AppointmentStatus = 'confirmed' | 'pending' | 'cancelled' | 'completed'
export type AppointmentDirection = 'outgoing' | 'incoming' | 'other'
export type ServiceType = 'restaurant' | 'barbershop' | 'hotel' | 'service'

export interface Appointment {
    id: string
    store_id?: string | null           // agora opcional
    store_slug?: string | null
    store_name?: string | null
    store_logo_url?: string | null
    customer_id: string
    customer_slug: string
    customer_avatar_url: string
    owner_id: string
    owner_slug: string
    date: string
    time: string
    duration_minutes?: number
    service_name: string
    service_type: ServiceType
    people_count: number
    status: AppointmentStatus
    created_at: string
    updated_at?: string
    direction: AppointmentDirection
    is_public?: boolean
    provider_profile_id?: string | null   // NOVO
    service_id?: string | null            // NOVO (opcional)
}

export function useAppointments() {
    const [appointments, setAppointments] = useState<Appointment[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const fetchAppointments = useCallback(async () => {
        try {
            setLoading(true)
            const { data: session } = await supabase.auth.getSession()
            if (!session.session?.user) throw new Error('Usuário não autenticado')

            const userId = session.session.user.id

            // Busca compromissos onde o usuário é:
            // - customer_id (compromissos que ele criou)
            // - owner_id (compromissos que ele é dono, legado)
            // - provider_profile_id (agenda como prestador de serviço)
            const { data, error } = await supabase
                .from('appointments')
                .select('*')
                .or(`customer_id.eq.${userId},owner_id.eq.${userId},provider_profile_id.eq.${userId}`)
                .order('date', { ascending: true })
                .order('time', { ascending: true })

            if (error) throw error

            setAppointments(data as Appointment[])
        } catch (err: any) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchAppointments()
    }, [fetchAppointments])

    return { appointments, loading, error, refetch: fetchAppointments }
}

// ... (useUpdateAppointmentStatus e useDeleteAppointment permanecem iguais) ...
export function useUpdateAppointmentStatus() {
    const [loading, setLoading] = useState(false)

    const updateStatus = useCallback(async (appointmentId: string, newStatus: AppointmentStatus) => {
        setLoading(true)
        try {
            const { error } = await supabase
                .from('appointments')
                .update({ status: newStatus, updated_at: new Date().toISOString() })
                .eq('id', appointmentId)

            if (error) throw error
            return true
        } catch (err: any) {
            console.error('Erro ao atualizar status:', err.message)
            return false
        } finally {
            setLoading(false)
        }
    }, [])

    return { updateStatus, loading }
}

export function useDeleteAppointment() {
    const [loading, setLoading] = useState(false)

    const deleteAppointment = useCallback(async (appointmentId: string) => {
        setLoading(true)
        try {
            const { error } = await supabase
                .from('appointments')
                .delete()
                .eq('id', appointmentId)

            if (error) throw error
            return true
        } catch (err: any) {
            console.error('Erro ao deletar:', err.message)
            return false
        } finally {
            setLoading(false)
        }
    }, [])

    return { deleteAppointment, loading }
}