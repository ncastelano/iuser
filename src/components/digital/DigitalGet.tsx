// src/components/digital/DigitalGet.tsx — o que a pessoa pode fazer JÁ, na página de um produto digital, sem pedido:
//   · GRÁTIS (preço 0): "Pegar grátis" / "Adicionar à minha biblioteca" — o banco registra o direito (claim_free_digital) e a pessoa abre na hora, sem a loja liberar;
//     quem já tem vê "Está na sua biblioteca" e o botão de abrir;
//   · MÚSICA com prévia: "Ouvir prévia" (trecho de até 30 s que o artista enviou, aberto a qualquer pessoa — o arquivo inteiro continua fechado para quem não pegou/comprou).
// Produto pago sem prévia não mostra nada aqui (a compra segue pelo carrinho).
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Gift, Headphones, Pause, Play } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { toast } from '@/lib/toast'
import { claimFree, fetchAudioPreview, fetchMyAccess, freeCtaLabel, isFreeProduct, openItem, productKindOf, summaryFromCounts, type CurriculumItem } from '@/modules/digital'
import { useRef } from 'react'
import TipButton from '@/components/tips/TipButton'

export default function DigitalGet({ productId, productName, price, items, storeId, storeName }: { productId: string; productName: string; price: number | null; items: CurriculumItem[] | null; storeId?: string | null; storeName?: string | null }) {
    const { colors } = useTheme()
    const router = useRouter()
    const { userId } = useProfile()
    const [has, setHas] = useState<boolean | null>(null)
    const [busy, setBusy] = useState(false)
    const [preview, setPreview] = useState<{ itemId: string; seconds: number | null } | null>(null)
    const [src, setSrc] = useState<string | null>(null)
    const [playing, setPlaying] = useState(false)
    const audioRef = useRef<HTMLAudioElement>(null)
    const free = isFreeProduct(price)

    useEffect(() => { let on = true; if (!userId) { setHas(false); return }; fetchMyAccess(productId).then((v) => { if (on) setHas(v) }); return () => { on = false } }, [productId, userId])
    useEffect(() => { let on = true; fetchAudioPreview(productId).then((p) => { if (on) setPreview(p) }); return () => { on = false } }, [productId])

    const counts = { videos: 0, audios: 0, docs: 0, links: 0, seconds: 0 }
    for (const i of items || []) { if (i.kind === 'video') counts.videos++; else if (i.kind === 'audio') counts.audios++; else if (i.kind === 'link') counts.links++; else counts.docs++; counts.seconds += i.duration_seconds || 0 }
    const kind = productKindOf({ name: productName, ...counts })
    const open = () => router.push(`/minhas-compras-digitais/${productId}`)

    const claim = async () => {
        if (!userId) { toast.info('Entre na sua conta para pegar.'); router.push(`/login?redirect=${encodeURIComponent(window.location.pathname)}`); return }
        setBusy(true)
        try { await claimFree(productId); setHas(true); toast.success('Adicionado à sua biblioteca ✓'); open() } catch (e: any) { toast.error(e?.message || 'Não foi possível pegar.') } finally { setBusy(false) }
    }
    const togglePreview = async () => {
        if (!preview) return
        if (!src) { try { const d = await openItem(preview.itemId); setSrc(d.url) } catch (e: any) { toast.error(e?.message || 'Não foi possível tocar a prévia.') } return }
        const a = audioRef.current; if (!a) return
        if (a.paused) a.play().catch(() => {}); else a.pause()
    }

    const tip = storeId ? <TipButton storeId={storeId} storeName={storeName || 'o artista'} productId={productId} className="w-full" /> : null
    if (!free && !preview && !tip) return null
    if (items && items.length === 0 && !preview && !tip) return null
    const showPreview = !!preview && !has
    return (
        <>
        {(free || showPreview) && (
        <section className="rounded-3xl p-4 flex flex-col gap-3" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
            {free && (
                <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                        <span className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: '#22c55e22', color: '#16a34a' }}>{has ? <CheckCircle2 size={22} /> : <Gift size={22} />}</span>
                        <span className="min-w-0 flex-1">
                            <span className="block text-sm font-black" style={{ color: colors.textPrimary }}>{has ? 'Está na sua biblioteca' : 'Grátis'}</span>
                            <span className="block text-[12px] leading-snug" style={{ color: colors.textSecondary }}>{items ? summaryFromCounts(counts) : ''}{!has ? ' · abre na hora, sem pedido' : ''}</span>
                        </span>
                    </div>
                    <button type="button" disabled={busy || has === null} onClick={has ? open : claim} className="w-full h-11 rounded-full text-sm font-black text-white transition active:scale-95 disabled:opacity-60" style={{ background: '#f97316' }}>
                        {busy ? 'Adicionando…' : has ? 'Abrir na minha biblioteca' : freeCtaLabel(kind)}
                    </button>
                </div>
            )}
            {showPreview && (
                <div className="flex items-center gap-3">
                    <button type="button" onClick={togglePreview} aria-label={playing ? 'Pausar prévia' : 'Ouvir prévia'} className="w-11 h-11 rounded-full flex items-center justify-center text-white flex-shrink-0 transition active:scale-90" style={{ background: '#f97316' }}>
                        {playing ? <Pause size={18} fill="#fff" /> : <Play size={18} fill="#fff" className="ml-0.5" />}
                    </button>
                    <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 text-sm font-black" style={{ color: colors.textPrimary }}><Headphones size={15} /> Ouvir prévia</span>
                        <span className="block text-[12px]" style={{ color: colors.textSecondary }}>Um trecho{preview?.seconds ? ` de ${preview.seconds} s` : ''} para conhecer antes de {free ? 'pegar' : 'comprar'}</span>
                    </span>
                    {src && <audio ref={audioRef} src={src} autoPlay onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} />}
                </div>
            )}
        </section>
        )}
        {tip}
        </>
    )
}
