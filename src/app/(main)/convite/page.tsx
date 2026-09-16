import type { Metadata } from 'next'
import { generateInviteMetadata } from '@/lib/getOwnerMetadata'
import ConviteClientPage from './ConviteClientPage'

type Props = {
    searchParams: Promise<{ ref?: string }>
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
    const resolved = await searchParams
    return generateInviteMetadata(resolved.ref)
}

export default function Page() {
    return <ConviteClientPage />
}
