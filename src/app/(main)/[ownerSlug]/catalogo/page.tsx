import type { Metadata } from 'next'
import { generateCatalogMetadata } from '@/lib/getOwnerMetadata'
import CatalogoClientPage from './CatalogoClientPage'

type Props = {
    params: Promise<{ ownerSlug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const resolvedParams = await params
    return generateCatalogMetadata(resolvedParams.ownerSlug)
}

export default function Page() {
    return <CatalogoClientPage />
}
