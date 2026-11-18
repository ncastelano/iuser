// app/(main)/(shell)/chamar/[driverSlug]/page.tsx — chamar UM motorista (o botão "Solicitar corrida" do perfil dele)
import type { Metadata } from 'next'
import ChamarMotoristaScreen from '@/versions/v3/screens/ChamarMotoristaScreen'

export const metadata: Metadata = { title: 'Chamar motorista · iUser', robots: { index: false } }

export default async function ChamarPage({ params }: { params: Promise<{ driverSlug: string }> }) {
    const { driverSlug } = await params
    return <ChamarMotoristaScreen driverSlug={decodeURIComponent(driverSlug)} />
}
