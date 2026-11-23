// /cadastro: o endereço "natural" que as pessoas compartilham — leva à tela de cadastro (/cadastrar), mantendo ?ref= e o resto.
// A prévia do link (WhatsApp) é a de /cadastrar (o app segue o redirecionamento).
import { redirect } from 'next/navigation'

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries(await searchParams)) if (typeof v === 'string') q.set(k, v)
    redirect(`/cadastrar${q.toString() ? `?${q}` : ''}`)
}
