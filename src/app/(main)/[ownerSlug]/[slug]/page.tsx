import type { Metadata } from 'next'
import { generateProductOrPublicationMetadata } from '@/lib/getOwnerMetadata'
import ProductClientPage from './ProductClientPage'

type Props = {
    params: Promise<{ ownerSlug: string; slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const resolvedParams = await params
    return generateProductOrPublicationMetadata(resolvedParams.ownerSlug, resolvedParams.slug)
}

export default function Page() {
    return <ProductClientPage />
}