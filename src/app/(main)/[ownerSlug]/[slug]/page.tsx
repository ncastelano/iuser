import type { Metadata } from 'next'
import { generateProductOrPublicationMetadata } from '@/lib/getOwnerMetadata'
import SlugClientPage from './SlugClientPage'
import { buildProductJsonLd } from '@/lib/ownerJsonLd'

type Props = {
    params: Promise<{ ownerSlug: string; slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const resolvedParams = await params
    return generateProductOrPublicationMetadata(resolvedParams.ownerSlug, resolvedParams.slug)
}

export default async function Page({ params }: Props) {
    const resolvedParams = await params
    const jsonLd = await buildProductJsonLd(resolvedParams.ownerSlug, resolvedParams.slug)
    return (
        <>
            {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />}
            <SlugClientPage />
        </>
    )
}