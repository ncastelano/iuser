// app/(main)/planos/[[...plano]]/page.tsx
//
// Uma rota só pra tudo de planos — /planos, /planos/pos-pago e /planos/pre-pago —,
// diferenciando só pelo componente. Assim ir pra um plano e voltar pra /planos é só
// trocar o conteúdo da mesma página (nada de rotas soltas que se perdem no "voltar").
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { pageMetadata } from '@/lib/pageMetadata'
import PlanosOverview from '../PlanosOverview'
import PosPagoDetails from '../PosPagoDetails'

export const dynamic = 'force-dynamic'

type View = 'todos' | 'pos-pago' | 'pre-pago'

function resolveView(plano?: string[]): View | null {
    if (!plano || plano.length === 0) return 'todos'
    if (plano.length === 1 && (plano[0] === 'pos-pago' || plano[0] === 'pre-pago')) return plano[0]
    return null
}

const META: Record<View, { title: string; description: string; path: string }> = {
    'todos': {
        title: 'Descubra o melhor plano para você',
        description: 'Veja os planos e as ofertas do iUser: Motorista, Prestador, Loja, Combo ou o Pós-pago sem mensalidade. Compare e escolha o que combina com o seu momento.',
        path: '/planos',
    },
    'pos-pago': {
        title: 'Pós-pago: sem mensalidade, pague só pelo que usar',
        description: 'Entenda o plano Pós-pago do iUser: você paga por serviço realizado, com valores que variam por tipo, e acompanha cada cobrança, sem mensalidade.',
        path: '/planos/pos-pago',
    },
    'pre-pago': {
        title: 'Pré-pago: mensalidade única, sem taxa por serviço',
        description: 'Entenda o plano Pré-pago do iUser: uma mensalidade única e nenhuma cobrança por serviço realizado. Resgate o brinde de teste grátis ou assine.',
        path: '/planos/pre-pago',
    },
}

export async function generateMetadata({ params }: { params: Promise<{ plano?: string[] }> }): Promise<Metadata> {
    const view = resolveView((await params).plano)
    return pageMetadata(META[view || 'todos'])
}

export default async function PlanosPage({ params }: { params: Promise<{ plano?: string[] }> }) {
    const view = resolveView((await params).plano)
    if (!view) notFound()

    if (view === 'pos-pago') return <PosPagoDetails />
    // O Pré-pago é a mesma página de planos, com o Pré-pago em destaque
    if (view === 'pre-pago') return <PlanosOverview focusPlan="pre_pago" />
    return <PlanosOverview />
}
