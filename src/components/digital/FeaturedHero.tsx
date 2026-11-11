'use client'

// src/components/digital/FeaturedHero.tsx — o DESTAQUE do topo da loja de criador, no lugar do botão de comprar:
//   Studio → a música, o álbum ou o vídeo principal; Conteúdo → o audiolivro ou podcast em destaque.
// Capa grande, o tipo, o título, o que tem dentro e o preço. Áudio: "Ouvir prévia" (30 s); vídeo: "Assistir prévia" (o vídeo curto/aula grátis
// que o lojista marcou, tocando ali mesmo). "Abrir" leva à página do produto (onde se compra, pega grátis ou abre).
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Headphones, Pause, Play, Star, X } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { featuredLabel, isAudioKind, previewUrl, type ShowcaseItem } from '@/modules/digital'
import { useAudioPreview } from './useAudioPreview'

const brl = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n)
const ORANGE = '#f97316'

export default function FeaturedHero({ item, ownerHint }: { item: ShowcaseItem; ownerHint?: boolean }) {
    const { colors } = useTheme()
    const router = useRouter()
    const { playing, loading, toggle, stop } = useAudioPreview()
    const [video, setVideo] = useState<string | null>(null)
    const audio = isAudioKind(item.kind) && item.videos === 0
    useEffect(() => { stop(); setVideo(null) }, [item.id])   // eslint-disable-line react-hooks/exhaustive-deps
    const watch = async () => {
        if (!item.previewItemId) return
        try { setVideo(await previewUrl(item.previewItemId)) } catch { /* sem prévia: fica a capa */ }
    }
    const on = playing === item.id
    return (
        <section className="mt-4 rounded-3xl overflow-hidden" style={{ background: colors.surface, border: `1px solid ${colors.border}` }} aria-label={featuredLabel(item.kind)}>
            <div className="relative aspect-[16/9]" style={{ background: `linear-gradient(135deg, ${ORANGE}, #7c3aed)` }}>
                {video ? (
                    <>
                        <video src={video} className="w-full h-full object-cover bg-black" autoPlay controls playsInline />
                        <button onClick={() => setVideo(null)} aria-label="Fechar o vídeo" className="absolute top-2 right-2 w-9 h-9 rounded-full flex items-center justify-center text-white" style={{ background: 'rgba(0,0,0,.55)' }}><X size={16} /></button>
                    </>
                ) : (
                    <>
                        {item.imageUrl && <img src={item.imageUrl} alt="" className="w-full h-full object-cover" />}
                        <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,.75), rgba(0,0,0,.05) 60%)' }} />
                        <span className="absolute left-3 top-3 text-[10px] font-black uppercase tracking-wide px-2.5 py-1 rounded-full text-white flex items-center gap-1" style={{ background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(4px)' }}><Star size={11} fill="#fbbf24" style={{ color: '#fbbf24' }} />{featuredLabel(item.kind)}</span>
                        <div className="absolute left-3 right-3 bottom-3 text-white">
                            <p className="text-[20px] font-black leading-tight line-clamp-2">{item.name}</p>
                            <p className="text-[12px] opacity-90 mt-0.5">{item.summary}</p>
                        </div>
                    </>
                )}
            </div>
            <div className="p-3 flex items-center gap-2">
                <p className="text-[16px] font-black mr-auto" style={{ color: item.price > 0 ? colors.textPrimary : '#16a34a' }}>{item.price > 0 ? brl(item.price) : 'Grátis'}</p>
                {audio ? (
                    <button onClick={() => toggle(item.id)} disabled={loading === item.id} className="h-10 px-4 rounded-full text-[13px] font-black flex items-center gap-1.5 active:scale-95 disabled:opacity-60" style={on ? { background: '#8b5cf6', color: '#fff' } : { border: `1px solid ${colors.border}`, color: colors.textPrimary }}>
                        {on ? <><Pause size={15} />Pausar</> : <><Headphones size={15} />{loading === item.id ? 'Carregando…' : 'Ouvir prévia'}</>}
                    </button>
                ) : item.previewItemId && !video ? (
                    <button onClick={watch} className="h-10 px-4 rounded-full text-[13px] font-black flex items-center gap-1.5 active:scale-95" style={{ border: `1px solid ${colors.border}`, color: colors.textPrimary }}><Play size={15} />Assistir prévia</button>
                ) : null}
                <button onClick={() => { stop(); router.push(`/${item.storeSlug}/${item.slug}`) }} className="h-10 px-5 rounded-full text-[13px] font-black text-white active:scale-95" style={{ background: ORANGE }}>Abrir</button>
            </div>
            {ownerHint && !item.isFeatured && <p className="px-3 pb-3 -mt-1 text-[11px]" style={{ color: colors.textSecondary }}>Você ainda não escolheu o destaque: aparece o mais visto. Toque em “Destacar no topo” num item abaixo.</p>}
        </section>
    )
}
