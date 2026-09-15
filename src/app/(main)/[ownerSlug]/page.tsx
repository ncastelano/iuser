import type { Metadata } from 'next'
import { Suspense } from 'react'
import { generateOwnerMetadata } from '@/lib/getOwnerMetadata'
import OwnerClientPage from './OwnerClientPage'

type Props = {
    params: Promise<{ ownerSlug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const resolvedParams = await params
    return generateOwnerMetadata(resolvedParams.ownerSlug)
}

export default function Page() {
    return (
        <Suspense fallback={null}>
            <OwnerClientPage />
        </Suspense>
    )
}