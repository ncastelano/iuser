'use client'

// src/components/digital/BookShelf.tsx — a ESTANTE da Editora: livros (capa em pé), preço e "Ler prévia" (as primeiras páginas, que a loja
// escolheu) ou "Ler grátis" (livro de graça: a pessoa pega e lê o livro todo, ali mesmo). Abre no leitor de PDF do app.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { BookOpen } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { toast } from '@/lib/toast'
import { claimFree, fetchBookPreview, fetchCurriculum, openItem, type ShowcaseItem } from '@/modules/digital'
import PdfReader from './PdfReader'

const brl = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n)
const ORANGE = '#f97316'

type Open = { url: string; title: string; subtitle: string; item: ShowcaseItem; full: boolean }

export default function BookShelf({ items }: { items: ShowcaseItem[] }) {
    const { colors } = useTheme()
    const router = useRouter()
    const { userId } = useProfile()
    const [busy, setBusy] = useState<string | null>(null)
    const [open, setOpen] = useState<Open | null>(null)

    const readPreview = async (b: ShowcaseItem) => {
        setBusy(b.id)
        try {
            const pv = await fetchBookPreview(b.id)
            if (!pv) { toast.info('Este livro ainda não tem prévia.'); return }
            const o = await openItem(pv.itemId)
            setOpen({ url: o.url, title: b.name, subtitle: `Prévia · ${pv.pages} ${pv.pages === 1 ? 'página' : 'páginas'}`, item: b, full: false })
        } catch (e) { toast.error(e instanceof Error ? e.message : 'Não foi possível abrir a prévia.') } finally { setBusy(null) }
    }
    const readFree = async (b: ShowcaseItem) => {
        if (!userId) { toast.info('Entre na sua conta para ler grátis.'); router.push(`/login?redirect=${encodeURIComponent(window.location.pathname)}`); return }
        setBusy(b.id)
        try {
            await claimFree(b.id).catch(() => { /* já pegou antes: segue */ })
            const doc = (await fetchCurriculum(b.id)).find((c) => c.kind === 'document')
            if (!doc) { router.push(`/${b.storeSlug}/${b.slug}`); return }
            const o = await openItem(doc.id)
            setOpen({ url: o.url, title: b.name, subtitle: 'Livro grátis · está na sua biblioteca', item: b, full: true })
        } catch (e) { toast.error(e instanceof Error ? e.message : 'Não foi possível abrir o livro.') } finally { setBusy(null) }
    }

    return (
        <>
            <div className="grid grid-cols-3 gap-x-3 gap-y-5">
                {items.map((b) => {
                    const free = b.price <= 0
                    return (
                        <div key={b.id} className="min-w-0 flex flex-col">
                            <button onClick={() => router.push(`/${b.storeSlug}/${b.slug}`)} className="relative aspect-[2/3] rounded-md overflow-hidden shadow-md active:scale-[.98] transition" style={{ background: 'linear-gradient(160deg,#7c3aed,#f97316)' }} aria-label={`Abrir ${b.name}`}>
                                {b.imageUrl ? <img src={b.imageUrl} alt="" className="w-full h-full object-cover" /> : <span className="absolute inset-0 p-2 flex items-end text-left text-white text-[12px] font-black leading-tight">{b.name}</span>}
                                <span className="absolute left-0 top-0 bottom-0 w-1.5" style={{ background: 'rgba(0,0,0,.25)' }} aria-hidden />
                            </button>
                            <p className="text-[12px] font-black leading-tight mt-1.5 line-clamp-2" style={{ color: colors.textPrimary }}>{b.name}</p>
                            <p className="text-[12px] font-black mt-0.5" style={{ color: free ? '#16a34a' : colors.textPrimary }}>{free ? 'Grátis' : brl(b.price)}</p>
                            {(free || b.bookPreviewPages) && (
                                <button onClick={() => (free ? readFree(b) : readPreview(b))} disabled={busy === b.id} className="mt-1.5 h-8 rounded-full text-[11px] font-black flex items-center justify-center gap-1 active:scale-95 disabled:opacity-60"
                                    style={free ? { background: '#16a34a', color: '#fff' } : { border: `1px solid ${colors.border}`, color: colors.textPrimary }}>
                                    <BookOpen size={12} />{busy === b.id ? 'Abrindo…' : free ? 'Ler grátis' : `Ler ${b.bookPreviewPages} pág.`}
                                </button>
                            )}
                        </div>
                    )
                })}
            </div>
            {open && (
                <PdfReader url={open.url} title={open.title} subtitle={open.subtitle} onClose={() => setOpen(null)}
                    footer={open.full ? undefined : (
                        <div className="flex items-center gap-3">
                            <p className="text-[12px] leading-snug flex-1" style={{ color: colors.textSecondary }}>Gostou? O livro completo está na loja.</p>
                            <button onClick={() => router.push(`/${open.item.storeSlug}/${open.item.slug}`)} className="h-11 px-5 rounded-full text-[13px] font-black text-white" style={{ background: ORANGE }}>Comprar · {brl(open.item.price)}</button>
                        </div>
                    )} />
            )}
        </>
    )
}
