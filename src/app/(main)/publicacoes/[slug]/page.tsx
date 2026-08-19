import type { Metadata } from 'next'
import { generatePublicationMetadata } from '@/lib/getOwnerMetadata'
import PublicationClientPage from './PublicationClientPage'

type Props = {
    params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const resolvedParams = await params
    return generatePublicationMetadata(resolvedParams.slug)
}

export default function Page() {
    return <PublicationClientPage />
}