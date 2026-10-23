// src/lib/vehicleShareCard.ts
//
// Server-only. Reúne o que é PÚBLICO sobre um veículo/motorista pra montar a prévia do link
// (WhatsApp, Telegram, iMessage) — o mesmo cartão de perfil/loja (miniatura quadrada + título + descrição),
// só que a descrição é o STATUS do motorista (nota, avaliações, corridas...) no lugar da bio.
// Nenhuma imagem é gerada por motorista. Nada de posição, disponibilidade ao vivo nem dado pessoal: a prévia
// fica guardada em cache pelo app que recebeu o link, então só entra o que não muda de hora em hora.
import { supabaseAdmin } from '@/lib/supabase/admin'
import { loadPlatformTariffs } from '@/lib/platformTariffs'
import { getEffectivePricing, type DriverPricingRow } from '@/lib/driverPricing'

export const SHARE_BASE_URL = 'https://www.iuser.com.br'

export interface VehicleShareData {
    slug: string
    kind: 'carro' | 'moto' | 'bicicleta'
    kindLabel: string
    model: string
    color: string | null
    plate: string | null
    capacity: number | null
    services: string[]
    carPhotoUrl: string | null
    driverName: string
    driverSlug: string | null
    avatarUrl: string | null
    rides: number
    rating: number | null
    ratingCount: number
    memberSince: string | null // "mai/26"
    fromPrice: number | null
}

const KIND_LABEL = { carro: 'Carro', moto: 'Moto', bicicleta: 'Bicicleta' } as const

const storageUrl = (bucket: string, path: string | null | undefined): string | null => {
    if (!path) return null
    if (path.startsWith('http://') || path.startsWith('https://')) return path
    return supabaseAdmin.storage.from(bucket).getPublicUrl(path.replace(/^\/+/, '')).data.publicUrl
}

export const brlShort = (n: number) => `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`

export async function loadVehicleShareData(slug: string): Promise<VehicleShareData | null> {
    const { data: v } = await supabaseAdmin
        .from('driver_vehicles')
        .select('vehicle_slug, vehicle_kind, car_model, car_color, car_plate, car_photo_url, passenger_capacity, services, driver_id')
        .ilike('vehicle_slug', slug)
        .maybeSingle()
    if (!v) return null

    const [{ data: p }, { data: st }, { data: pr }] = await Promise.all([
        supabaseAdmin.from('profiles').select('name, profileSlug, avatar_url').eq('id', v.driver_id).maybeSingle(),
        supabaseAdmin.rpc('get_driver_public_stats', { p_driver: v.driver_id }),
        supabaseAdmin.from('driver_pricing').select('pricing_mode, base_distance_km, base_fee, price_per_km_after_base, extra_fee_pessoa, extra_fee_animal, extra_fee_objeto, extra_fee_condominio, extra_fee_compras, extra_fee_necessidade_especial, extra_fee_pet_sem_caixa, extra_fee_entrega_interna, extra_fee_ar_condicionado').eq('driver_id', v.driver_id).maybeSingle(),
        loadPlatformTariffs(supabaseAdmin), // a tarifa da plataforma vem do banco: sempre carregar antes de calcular preço
    ])
    const stats = Array.isArray(st) ? st[0] : st

    const kind = (v.vehicle_kind as VehicleShareData['kind']) || 'carro'
    let fromPrice: number | null = null
    if (pr) {
        const eff = getEffectivePricing(pr as DriverPricingRow, kind)
        fromPrice = Number.isFinite(eff.baseFee) && eff.baseFee > 0 ? eff.baseFee : null
    }
    const since = stats?.member_since ? new Date(stats.member_since) : null

    return {
        slug: v.vehicle_slug,
        kind,
        kindLabel: KIND_LABEL[kind] || 'Veículo',
        model: v.car_model || KIND_LABEL[kind] || 'Veículo',
        color: v.car_color || null,
        plate: v.car_plate ? String(v.car_plate).toUpperCase() : null,
        capacity: v.passenger_capacity ?? null,
        services: Array.isArray(v.services) ? v.services : [],
        carPhotoUrl: storageUrl('driver-car-photos', v.car_photo_url),
        driverName: p?.name || (p?.profileSlug ? `@${p.profileSlug}` : 'Motorista'),
        driverSlug: p?.profileSlug || null,
        avatarUrl: storageUrl('avatars', p?.avatar_url ? String(p.avatar_url).replace(/^avatars\//, '') : null),
        rides: Number(stats?.rides_completed) || 0,
        rating: stats?.rating_avg != null ? Number(stats.rating_avg) : null,
        ratingCount: Number(stats?.rating_count) || 0,
        memberSince: since ? `${since.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}/${String(since.getFullYear()).slice(2)}` : null,
        fromPrice,
    }
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

// Texto da prévia: do mais forte pro mais fraco (o WhatsApp corta o fim).
export function vehicleShareText(d: VehicleShareData) {
    const rating = d.rating != null && d.ratingCount > 0
        ? `⭐ ${d.rating.toFixed(1).replace('.', ',')} (${plural(d.ratingCount, 'avaliação', 'avaliações')})`
        : 'Novo no iUser'
    const vehicle = `${d.kindLabel} ${d.model}${d.color ? ` ${d.color}` : ''}`
    const parts = [
        rating,
        plural(d.rides, 'corrida feita', 'corridas feitas'),
        vehicle,
        d.capacity ? plural(d.capacity, 'passageiro', 'passageiros') : null,
        d.fromPrice != null ? `a partir de ${brlShort(d.fromPrice)}` : null,
    ].filter(Boolean)
    const title = `${d.driverName} · ${d.model}${d.color ? ` ${d.color}` : ''} | iUser`
    const description = `${parts.join(' · ')} — chame pelo iUser.`
    return { title, description }
}
