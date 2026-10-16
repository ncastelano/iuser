// Prévia do link (WhatsApp, Telegram, iMessage...) da página pública de um veículo/motorista:
// título com o modelo, quem é o motorista e a foto do carro. A página em si é client ('use client').
import type { Metadata } from 'next'
import { supabaseAdmin } from '@/lib/supabase/admin'

const BASE_URL = 'https://www.iuser.com.br'

export async function generateMetadata({ params }: { params: Promise<{ vehicleSlug: string }> }): Promise<Metadata> {
    const { vehicleSlug } = await params
    const fallback: Metadata = { title: 'Motorista | iUser', robots: { index: false } }
    try {
        const { data: v } = await supabaseAdmin
            .from('driver_vehicles')
            .select('car_model, car_color, car_photo_url, vehicle_kind, vehicle_slug, driver_id')
            .ilike('vehicle_slug', vehicleSlug)
            .maybeSingle()
        if (!v) return fallback
        const { data: p } = await supabaseAdmin.from('profiles').select('name, profileSlug').eq('id', v.driver_id).maybeSingle()

        const kind = v.vehicle_kind === 'moto' ? 'Moto' : v.vehicle_kind === 'bicicleta' ? 'Bicicleta' : 'Carro'
        const model = v.car_model || kind
        const who = p?.name || (p?.profileSlug ? `@${p.profileSlug}` : 'motorista')
        const title = `${model}${v.car_color ? ` ${v.car_color}` : ''} — ${who} | iUser`
        const description = `Chame ${who} em tempo real: veja onde ele está, quanto custa a corrida e peça direto pelo iUser.`
        const url = `${BASE_URL}/${v.vehicle_slug}`
        const photo = v.car_photo_url
            ? (String(v.car_photo_url).startsWith('http')
                ? v.car_photo_url
                : supabaseAdmin.storage.from('driver-car-photos').getPublicUrl(v.car_photo_url).data.publicUrl)
            : `${BASE_URL}/logo-preview-thumb.png`
        return {
            title,
            description,
            alternates: { canonical: url },
            openGraph: {
                title, description, url, siteName: 'iUser', type: 'website', locale: 'pt_BR',
                images: [{ url: photo, alt: model }],
            },
            twitter: { card: 'summary_large_image', title, description, images: [photo] },
        }
    } catch {
        return fallback
    }
}

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
