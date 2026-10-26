// app/(main)/(shell)/imoveis/[slug]/page.tsx — a página de um imóvel (interface 3.0)
import ImovelScreen from '@/versions/v3/screens/ImovelScreen'

export default async function ImovelPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params
    return <ImovelScreen slug={slug} />
}
