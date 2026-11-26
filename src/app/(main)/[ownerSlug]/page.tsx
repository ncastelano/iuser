import type { Metadata } from 'next'
import { Suspense } from 'react'
import { generateOwnerMetadata } from '@/lib/getOwnerMetadata'
import OwnerClientPage from './OwnerClientPage'
import OwnerSkeleton from '@/components/v3/OwnerSkeleton'
import { buildOwnerJsonLd } from '@/lib/ownerJsonLd'

type Props = {
    params: Promise<{ ownerSlug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const resolvedParams = await params
    return generateOwnerMetadata(resolvedParams.ownerSlug)
}

export default async function Page({ params }: Props) {
    const { ownerSlug } = await params
    // dados estruturados (loja ou perfil público) para o Google: só campos públicos
    const jsonLd = await buildOwnerJsonLd(ownerSlug)
    return (
        <>
            {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />}
            <Suspense fallback={<OwnerSkeleton />}>
                <OwnerClientPage />
            </Suspense>
        </>
    )
}