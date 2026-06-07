export type AppointmentStatus =
    | 'confirmed'
    | 'pending'
    | 'cancelled'
    | 'completed'

export type AppointmentDirection =
    | 'outgoing'
    | 'incoming'
    | 'other'

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
    service_type: 'restaurant' | 'barbershop' | 'hotel' | 'service'

    people_count: number

    status: AppointmentStatus

    created_at: string
    updated_at?: string

    direction: AppointmentDirection
}

/**
 * 👤 IDs (mesmos do seu sistema)
 */
const NATAN_ID = "550e8400-e29b-41d4-a716-446655440001"
const LUCAS_ID = "550e8400-e29b-41d4-a716-446655440002"
const MARIANA_ID = "550e8400-e29b-41d4-a716-446655440003"
const JOAO_ID = "550e8400-e29b-41d4-a716-446655440004"

/**
 * 🧾 AGENDAMENTOS
 * Natan aparece como:
 * - cliente (outgoing)
 * - dono da loja (incoming)
 */

export const agendamentosMockados: Appointment[] = [

    // =========================
    // 🍔 Natan AGENDOU EM OUTRAS LOJAS
    // =========================

    {
        id: 'a1',
        store_id: '00000000-0000-0000-0000-000000000003',
        store_slug: 'burger-mania',
        store_name: 'Burger Mania',
        store_logo_url: 'https://images.unsplash.com/photo-1550547660-d9450f859349?w=800',

        customer_id: NATAN_ID,
        customer_slug: 'natan-castelano',
        customer_avatar_url: 'https://i.pravatar.cc/150?img=1',

        owner_id: MARIANA_ID,
        owner_slug: 'mariana-souza',

        date: '2026-01-24',
        time: '19:30',
        duration_minutes: 60,

        service_name: 'Jantar com Reserva',
        service_type: 'restaurant',

        people_count: 2,
        status: 'confirmed',
        created_at: '2026-01-20T10:00:00Z',

        direction: 'outgoing'
    },

    {
        id: 'a2',
        store_id: '00000000-0000-0000-0000-000000000002',
        store_slug: 'sabor-oriental',
        store_name: 'Sabor Oriental',
        store_logo_url: 'https://images.unsplash.com/photo-1617196034796-73dfa7b1fd56?w=800',

        customer_id: NATAN_ID,
        customer_slug: 'natan-castelano',
        customer_avatar_url: 'https://i.pravatar.cc/150?img=1',

        owner_id: LUCAS_ID,
        owner_slug: 'lucas-almeida',

        date: '2026-01-25',
        time: '20:00',
        duration_minutes: 90,

        service_name: 'Rodízio Japonês',
        service_type: 'restaurant',

        people_count: 1,
        status: 'pending',
        created_at: '2026-01-20T10:10:00Z',

        direction: 'outgoing'
    },

    // =========================
    // 🏪 LOJAS DO NATAN RECEBENDO AGENDAMENTOS
    // =========================

    {
        id: 'a3',
        store_id: '00000000-0000-0000-0000-000000000001',
        store_slug: 'cantina-bella-italia',
        store_name: 'Cantina Bella Italia',
        store_logo_url: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800',

        customer_id: LUCAS_ID,
        customer_slug: 'lucas-almeida',
        customer_avatar_url: 'https://i.pravatar.cc/150?img=2',

        owner_id: NATAN_ID,
        owner_slug: 'natan-castelano',

        date: '2026-01-24',
        time: '12:30',
        duration_minutes: 60,

        service_name: 'Reserva de Mesa',
        service_type: 'restaurant',

        people_count: 2,
        status: 'confirmed',
        created_at: '2026-01-20T10:20:00Z',

        direction: 'incoming'
    },

    {
        id: 'a4',
        store_id: '00000000-0000-0000-0000-000000000004',
        store_slug: 'verde-vida',
        store_name: 'Verde Vida',
        store_logo_url: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800',

        customer_id: JOAO_ID,
        customer_slug: 'joao-pereira',
        customer_avatar_url: 'https://i.pravatar.cc/150?img=4',

        owner_id: NATAN_ID,
        owner_slug: 'natan-castelano',

        date: '2026-01-25',
        time: '11:00',
        duration_minutes: 45,

        service_name: 'Pedido Agendado Fitness',
        service_type: 'restaurant',

        people_count: 1,
        status: 'confirmed',
        created_at: '2026-01-20T10:30:00Z',

        direction: 'incoming'
    },

    // =========================
    // 🛒 MERCADOS (misto)
    // =========================

    {
        id: 'a5',
        store_id: '00000000-0000-0000-0000-000000000007',
        store_slug: 'atacadao-express',
        store_name: 'Atacadão Express',
        store_logo_url: 'https://images.unsplash.com/photo-1601598851547-4302969d0614?w=800',

        customer_id: NATAN_ID,
        customer_slug: 'natan-castelano',
        customer_avatar_url: 'https://i.pravatar.cc/150?img=1',

        owner_id: NATAN_ID,
        owner_slug: 'natan-castelano',

        date: '2026-01-26',
        time: '09:00',

        service_name: 'Retirada Atacado',
        service_type: 'service',

        people_count: 1,
        status: 'confirmed',
        created_at: '2026-01-20T10:40:00Z',

        direction: 'incoming'
    }
]