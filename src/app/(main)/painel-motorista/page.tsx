// app/(main)/painel-motorista/page.tsx — o painel do motorista passou a morar DENTRO do Canal do Motorista (16/11/2026).
// Links antigos (avisos, favoritos, push: /painel-motorista?aba=veiculo...) continuam valendo: vão para /canal-do-motorista com
// a mesma aba; sem aba, abrem a aba "Painel" (era o que esta página mostrava).
import { redirect } from 'next/navigation'

export default async function PainelMotoristaRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    const sp = await searchParams
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries(sp)) for (const one of Array.isArray(v) ? v : v != null ? [v] : []) q.append(k, one)
    if (!q.has('aba')) q.set('aba', 'painel')
    redirect(`/canal-do-motorista?${q.toString()}`)
}
