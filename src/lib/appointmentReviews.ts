// src/lib/appointmentReviews.ts
//
// Ciclo do serviço agendado, lado do app: finalizar ("serviço feito"), avaliar e o histórico do cliente para o dono. As regras e a
// privacidade são do banco (migration 20261124): o cliente só vê a avaliação que ELE fez; a que o dono faz do cliente só o dono que
// escreveu e os outros donos de serviço que atendem esse cliente enxergam (get_client_track_record).
import { supabase } from '@/lib/supabase/client'

export interface MyReview { rating: number; comment: string | null; created_at: string }
export interface ReviewState {
    role: 'customer' | 'owner'
    status: string
    completed_at: string | null
    can_complete: boolean
    can_review: boolean
    my_review: MyReview | null
    /** só para o dono: o que o cliente disse do serviço */
    client_review: MyReview | null
}
export interface OwnerReview { rating: number; comment: string | null; created_at: string; service_name: string | null; owner_name: string | null; owner_slug: string | null; mine: boolean }
export interface OwnComment { rating: number; comment: string | null; created_at: string; service_name: string | null; store_name: string | null }
export interface TrackRecord {
    by_owners: OwnerReview[]
    own_comments: OwnComment[]
    summary: { count: number; avg: number }
    services_done: number
}

export async function getReviewState(appointmentId: string): Promise<ReviewState | null> {
    const { data } = await supabase.rpc('get_appointment_review_state', { p_appointment: appointmentId })
    return (data as ReviewState | null) || null
}

export async function completeAppointment(appointmentId: string): Promise<void> {
    const { error } = await supabase.rpc('complete_appointment', { p_appointment: appointmentId })
    if (error) throw new Error(error.message)
}

export async function submitReview(appointmentId: string, rating: number, comment: string): Promise<void> {
    const { error } = await supabase.rpc('submit_appointment_review', { p_appointment: appointmentId, p_rating: rating, p_comment: comment })
    if (error) throw new Error(error.message)
}

export async function getTrackRecord(clientId: string): Promise<TrackRecord | null> {
    const { data } = await supabase.rpc('get_client_track_record', { p_client: clientId })
    return (data as TrackRecord | null) || null
}

/** Um agendamento é um SERVIÇO (e não um compromisso pessoal ou convite entre pessoas) quando tem loja ou perfil prestador. */
export const isServiceBooking = (a: { store_id?: string | null; provider_profile_id?: string | null; customer_id: string; owner_id: string }) =>
    !!(a.store_id || a.provider_profile_id) && a.customer_id !== a.owner_id
