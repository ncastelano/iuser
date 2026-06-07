// app/(main)/compromissos/dadosDoAgendar.ts
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'

// Tipos (inalterados)
export type AppointmentStatus = 'confirmed' | 'pending' | 'cancelled' | 'completed'
export type AppointmentDirection = 'outgoing' | 'incoming' | 'other'
export type ServiceType = 'restaurant' | 'barbershop' | 'hotel' | 'service'

export interface Appointment {
    id: string
    store_id: string
    store_slug: string
    store_name: string
    store_logo_url: string
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
}

export interface Recomendacao {
    nome: string
    imagem: string
}

export const recomendacoes: Recomendacao[] = [
    {
        nome: 'Barbearia Elite',
        imagem: 'https://images.unsplash.com/photo-1517832606299-7ae9b720a186?w=800',
    },
    {
        nome: 'Academia Power',
        imagem: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800',
    },
    {
        nome: 'Clínica Premium',
        imagem: 'https://images.unsplash.com/photo-1584515933487-779824d29309?w=800',
    },
]

// Hook principal
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

            const { data, error } = await supabase
                .from('appointments')
                .select('*')
                .or(`customer_id.eq.${userId},owner_id.eq.${userId}`)
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

// Hook para atualizar status
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

// Hook para deletar
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