// Prévia do link (WhatsApp, Telegram, iMessage...) da página pública de um veículo/motorista. O motorista compartilha
// iuser.com.br/<vehicleSlug> e o app que recebe mostra um cartão próprio: foto do carro, motorista, nota, número de
// avaliações e de corridas, "a partir de" e o chamado pra corrida. A imagem é desenhada em /api/og/veiculo/<slug>
// (lib/vehicleShareCard.ts reúne os dados públicos). A página em si é client ('use client').
import type { Metadata } from 'next'
import { SHARE_BASE_URL, loadVehicleShareData, vehicleShareImageUrl, vehicleShareText } from '@/lib/vehicleShareCard'

export async function generateMetadata({ params }: { params: Promise<{ vehicleSlug: string }> }): Promise<Metadata> {
    const { vehicleSlug } = await params
    const fallback: Metadata = { title: 'Motorista | iUser', robots: { index: false } }
    try {
        const d = await loadVehicleShareData(vehicleSlug)
        if (!d) return fallback
        const { title, description } = vehicleShareText(d)
        const url = `${SHARE_BASE_URL}/${d.slug}`
        const image = vehicleShareImageUrl(d)
        const alt = `${d.driverName} — ${d.model}`
        return {
            title,
            description,
            alternates: { canonical: url },
            openGraph: {
                title, description, url, siteName: 'iUser', type: 'website', locale: 'pt_BR',
                images: [{ url: image, width: 1200, height: 630, alt, type: 'image/png' }],
            },
            twitter: { card: 'summary_large_image', title, description, images: [image] },
        }
    } catch {
        return fallback
    }
}

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
