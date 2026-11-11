'use client'
// Prévia em ÁUDIO de até 30 s (a que o lojista marcou), uma por vez na página: usada pelas prateleiras e pelo destaque da loja.
import { useEffect, useRef, useState } from 'react'
import { toast } from '@/lib/toast'
import { usePlayerStore } from '@/store/usePlayerStore'
import { fetchAudioPreview, openItem } from '@/modules/digital'

const PREVIEW_MAX_S = 30

export function useAudioPreview() {
    const audio = useRef<HTMLAudioElement | null>(null)
    const [playing, setPlaying] = useState<string | null>(null)
    const [loading, setLoading] = useState<string | null>(null)
    const stop = () => { audio.current?.pause(); audio.current = null; setPlaying(null) }
    useEffect(() => () => { audio.current?.pause() }, [])
    const toggle = async (productId: string) => {
        if (playing === productId) { stop(); return }
        stop()
        setLoading(productId)
        try {
            const pv = await fetchAudioPreview(productId)
            if (!pv) { toast.info('Esta obra ainda não tem prévia. Abra para ver como ouvir.'); return }
            const opened = await openItem(pv.itemId)
            { const ps = usePlayerStore.getState(); if (ps.item?.kind === 'musica' && ps.playing) ps.toggle() }   // não toca por cima da música que já estava tocando
            const a = new Audio(opened.url)
            audio.current = a
            const limit = Math.min(pv.seconds || PREVIEW_MAX_S, PREVIEW_MAX_S)
            a.ontimeupdate = () => { if (a.currentTime >= limit) stop() }
            a.onended = stop
            a.onerror = () => { toast.error('Não foi possível tocar a prévia.'); stop() }
            await a.play()
            setPlaying(productId)
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Não foi possível tocar a prévia.')
            stop()
        } finally { setLoading(null) }
    }
    return { playing, loading, toggle, stop }
}
