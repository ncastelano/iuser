'use client'

// src/components/digital/StoreDigitalShelves.tsx — a aba "Digitais" da página da loja: os conteúdos digitais em PRATELEIRAS por tipo (cursos e aulas,
// músicas e álbuns, audiolivros e podcasts, filmes e vídeos, e-books e arquivos, programas), cada uma uma fileira de capas. O tipo é o que o lojista
// escolheu ao criar o produto. Dá para experimentar sem sair da página: música, audiolivro e podcast têm "Ouvir prévia" (até 30 s, a prévia que o
// lojista marcou); curso e filme usam a prévia em vídeo do cartão (segure ou passe o mouse). Grátis abre direto na página do produto.
import { useEffect, useRef, useState } from 'react'
import { Headphones, Pause } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { toast } from '@/lib/toast'
import { usePlayerStore } from '@/store/usePlayerStore'
import { fetchAudioPreview, groupIntoShelves, isAudioKind, openItem, type ShowcaseItem } from '@/modules/digital'
import DigitalCards from './DigitalCards'

const PREVIEW_MAX_S = 30

export default function StoreDigitalShelves({ items }: { items: ShowcaseItem[] }) {
    const { colors } = useTheme()
    const audio = useRef<HTMLAudioElement | null>(null)
    const [playing, setPlaying] = useState<string | null>(null)
    const [loading, setLoading] = useState<string | null>(null)
    const shelves = groupIntoShelves(items)

    const stop = () => { audio.current?.pause(); audio.current = null; setPlaying(null) }
    useEffect(() => () => { audio.current?.pause() }, [])

    const toggle = async (p: ShowcaseItem) => {
        if (playing === p.id) { stop(); return }
        stop()
        setLoading(p.id)
        try {
            const pv = await fetchAudioPreview(p.id)
            if (!pv) { toast.info('Esta obra ainda não tem prévia. Abra para ver como ouvir.'); return }
            const opened = await openItem(pv.itemId)
            { const ps = usePlayerStore.getState(); if (ps.item?.kind === 'musica' && ps.playing) ps.toggle() }   // não toca por cima da música que já estava tocando (pausa)
            const a = new Audio(opened.url)
            audio.current = a
            const limit = Math.min(pv.seconds || PREVIEW_MAX_S, PREVIEW_MAX_S)
            a.ontimeupdate = () => { if (a.currentTime >= limit) stop() }
            a.onended = stop
            a.onerror = () => { toast.error('Não foi possível tocar a prévia.'); stop() }
            await a.play()
            setPlaying(p.id)
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Não foi possível tocar a prévia.')
            stop()
        } finally { setLoading(null) }
    }

    if (shelves.length === 0) return null
    return (
        <div className="space-y-6">
            {shelves.map((sh) => (
                <section key={sh.id}>
                    <p className="text-[13px] font-black mb-1 flex items-baseline gap-2" style={{ color: colors.textPrimary }}>{sh.title}<span className="text-[11px] font-bold" style={{ color: colors.textSecondary }}>{sh.items.length}</span></p>
                    <DigitalCards items={sh.items} layout="strip" extra={(p) => isAudioKind(p.kind) && p.videos === 0 ? (
                        <button type="button" onClick={() => toggle(p)} disabled={loading === p.id}
                            className="mt-2 w-full h-9 rounded-full text-[12px] font-black flex items-center justify-center gap-1.5 active:scale-95 transition disabled:opacity-60"
                            style={playing === p.id ? { background: '#8b5cf6', color: '#fff' } : { border: `1px solid ${colors.border}`, color: colors.textPrimary }}>
                            {playing === p.id ? <><Pause size={14} />Pausar a prévia</> : <><Headphones size={14} />{loading === p.id ? 'Carregando…' : 'Ouvir prévia'}</>}
                        </button>
                    ) : null} />
                </section>
            ))}
        </div>
    )
}
