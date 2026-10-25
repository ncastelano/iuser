// Prévia do link (WhatsApp, Telegram, iMessage...) da página pública de um veículo/motorista: o mesmo cartão de
// perfil/loja (miniatura quadrada pequena do lado do texto), com a foto do motorista e o STATUS dele (nota,
// avaliações, corridas, veículo, a partir de) no lugar da bio. Não gera imagem: a miniatura passa por /api/og-thumb
// (200x200 + selo do iUser), igual aos outros links. Dados públicos em lib/vehicleShareCard.ts. A página em si é client.
import type { Metadata } from 'next'
import { SHARE_BASE_URL, loadVehicleShareData, vehicleShareText } from '@/lib/vehicleShareCard'

const THUMB_SIZE = 200 // menos de 300px = o WhatsApp mostra a miniatura do lado esquerdo
const DEFAULT_THUMB = `${SHARE_BASE_URL}/logo-preview-thumb.png`
const toThumbUrl = (src: string) => `${SHARE_BASE_URL}/api/og-thumb?src=${encodeURIComponent(src)}`

export async function generateMetadata({ params }: { params: Promise<{ vehicleSlug: string }> }): Promise<Metadata> {
    const { vehicleSlug } = await params
    const fallback: Metadata = { title: 'Motorista | iUser', robots: { index: false } }
    try {
        const d = await loadVehicleShareData(vehicleSlug)
        if (!d) return fallback
        const { title, description } = vehicleShareText(d)
        const url = `${SHARE_BASE_URL}/${d.slug}`
        // imagem do motorista; sem foto de perfil, a do veículo; sem nenhuma, a logo
        const src = d.avatarUrl || d.carPhotoUrl
        const image = src ? toThumbUrl(src) : DEFAULT_THUMB
        const shortTitle = title.replace(/ \| iUser$/, '')
        return {
            title,
            description,
            alternates: { canonical: url },
            openGraph: {
                title: shortTitle, description, url, siteName: 'iUser', type: 'website', locale: 'pt_BR',
                images: [{ url: image, width: THUMB_SIZE, height: THUMB_SIZE, alt: d.driverName, type: 'image/png' }],
            },
            twitter: { card: 'summary', title: shortTitle, description, images: [image] },
        }
    } catch {
        return fallback
    }
}

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
