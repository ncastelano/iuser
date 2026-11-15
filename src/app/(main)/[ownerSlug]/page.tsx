import type { Metadata } from 'next'
import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { VERSION_COOKIE } from '@/versions/registry'
import { generateOwnerMetadata } from '@/lib/getOwnerMetadata'
import OwnerClientPage from './OwnerClientPage'
import OwnerSkeleton from '@/components/v3/OwnerSkeleton'

type Props = {
    params: Promise<{ ownerSlug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const resolvedParams = await params
    return generateOwnerMetadata(resolvedParams.ownerSlug)
}

export default async function Page() {
    // A pessoa usa a 3.0 (cookie) mas a casca ainda não chegou? O esqueleto leva uma barra de topo para a navbar não "sumir"
    const jar = await cookies()
    void jar.get(VERSION_COOKIE)
    const shellPending = true   // a 3.0 é a única versão: a casca sempre vem
    return (
        <Suspense fallback={<OwnerSkeleton shellPending={shellPending} />}>
            <OwnerClientPage />
        </Suspense>
    )
}