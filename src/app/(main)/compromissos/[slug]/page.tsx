// app/(main)/compromissos/[slug]/page.tsx
// Agenda de um perfil (/compromissos/natanparintintin) ou de uma loja (/compromissos/augustus-tec).
'use client'

import { use } from 'react'
import CompromissosView from '../CompromissosView'

export default function AgendaPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = use(params)
    return <CompromissosView agendaSlug={decodeURIComponent(slug)} />
}
