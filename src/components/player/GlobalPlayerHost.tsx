// src/components/player/GlobalPlayerHost.tsx
//
// O ÚNICO <audio> do app (montado na casca da 3.0): é por ele que a música continua tocando quando a pessoa troca de página. Cuida de:
//   · pedir o link da faixa ao servidor (assinado, vale 1 h) e tocar; passar para a próxima da fila quando acaba;
//   · contar ao estado (store) o que o <audio> faz (tocando, onde está, quanto dura);
//   · avisar o aparelho (Media Session): tela de bloqueio e fone mostram título/capa e respondem a play, pausa, anterior e próxima;
//   · guardar a última coisa no aparelho (por pessoa) e restaurá-la PAUSADA na próxima abertura; sair da conta limpa tudo.
'use client'

import { useEffect, useRef } from 'react'
import { useProfile } from '@/app/contexts/ProfileContext'
import { openItem } from '@/modules/digital'
import { parseSaved, serializeSaved } from '@/modules/player'
import { registerAudioControls, usePlayerStore } from '@/store/usePlayerStore'

const KEY = (userId: string) => `iuser_player_last_${userId}`

export default function GlobalPlayerHost() {
    const { userId } = useProfile()
    const audio = useRef<HTMLAudioElement>(null)
    const item = usePlayerStore((s) => s.item)
    const loadToken = usePlayerStore((s) => s.loadToken)
    const restored = useRef<string | null>(null)

    // o que o resto do app pode mandar o <audio> fazer
    useEffect(() => {
        registerAudioControls({
            toggle: () => { const a = audio.current; if (!a) return; if (a.paused) a.play().catch(() => {}); else a.pause() },
            seek: (sec) => { const a = audio.current; if (a && a.src) a.currentTime = sec },
            pause: () => audio.current?.pause(),
            stop: () => { const a = audio.current; if (!a) return; a.pause(); a.removeAttribute('src'); a.load() },
            hasSource: () => !!audio.current?.getAttribute('src'),
        })
        return () => registerAudioControls(null)
    }, [])

    // "carregue e toque a faixa atual": link novo a cada pedido
    useEffect(() => {
        const s = usePlayerStore.getState()
        if (!loadToken || !s.item || s.item.kind !== 'musica') return
        let alive = true
        openItem(s.item.id)
            .then((d) => {
                const a = audio.current
                if (!alive || !a) return
                a.src = d.url
                a.play().catch(() => usePlayerStore.getState().audioState({ playing: false }))
            })
            .catch((e) => { if (alive) usePlayerStore.getState().audioState({ playing: false, error: e?.message || 'Não foi possível tocar agora.' }) })
        return () => { alive = false }
    }, [loadToken])

    // restaura a última coisa (pausada) quando a pessoa entra; sair da conta limpa o player
    useEffect(() => {
        if (!userId) { if (restored.current) { usePlayerStore.getState().close(); restored.current = null } return }
        if (restored.current === userId) return
        restored.current = userId
        if (usePlayerStore.getState().item) return
        try {
            const sv = parseSaved(localStorage.getItem(KEY(userId)))
            if (sv) usePlayerStore.getState().restore(sv)
        } catch { /* sem armazenamento */ }
    }, [userId])

    // guarda no aparelho (de 3 em 3 s e quando a faixa muda); fechado = esquece
    useEffect(() => {
        if (!userId) return
        const save = () => {
            const s = usePlayerStore.getState()
            try {
                if (!s.item) localStorage.removeItem(KEY(userId))
                else localStorage.setItem(KEY(userId), serializeSaved({ item: s.item, queue: s.queue, qIndex: s.qIndex, pos: s.pos, dur: s.dur }))
            } catch { /* sem armazenamento */ }
        }
        save()
        const t = setInterval(save, 3000)
        return () => { clearInterval(t); save() }
    }, [userId, item?.id, item?.kind])

    // o aparelho mostra o que está tocando e entende os botões do fone / da tela de bloqueio
    useEffect(() => {
        if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
        const ms = navigator.mediaSession
        if (!item || item.kind !== 'musica') { try { ms.metadata = null } catch { /* ok */ } return }
        try {
            ms.metadata = new MediaMetadata({ title: item.title, artist: item.sub.replace(/ · Música$/, '') || 'iUser', artwork: item.cover ? [{ src: item.cover, sizes: '512x512' }] : [] })
            ms.setActionHandler('play', () => usePlayerStore.getState().toggle())
            ms.setActionHandler('pause', () => audio.current?.pause())
            ms.setActionHandler('previoustrack', () => usePlayerStore.getState().prev())
            ms.setActionHandler('nexttrack', () => usePlayerStore.getState().next())
            ms.setActionHandler('seekto', (d) => { if (d.seekTime != null) usePlayerStore.getState().seek(d.seekTime) })
        } catch { /* navegador sem suporte completo */ }
    }, [item])

    return (
        <audio
            ref={audio}
            preload="auto"
            onPlay={() => usePlayerStore.getState().audioState({ playing: true, error: null })}
            onPause={() => { const a = audio.current; if (a && !a.ended) usePlayerStore.getState().audioState({ playing: false }) }}
            onLoadedMetadata={(e) => {
                const s = usePlayerStore.getState()
                const d = Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0
                if (s.resumeAt > 0 && d > 0) { e.currentTarget.currentTime = Math.min(s.resumeAt, d - 1); s.audioState({ dur: d, resumeAt: 0 }) } else s.audioState({ dur: d })
            }}
            onTimeUpdate={(e) => usePlayerStore.getState().audioState({ pos: e.currentTarget.currentTime })}
            onEnded={() => usePlayerStore.getState().trackEnded()}
            onError={() => { if (audio.current?.getAttribute('src')) usePlayerStore.getState().audioState({ playing: false, error: 'Não foi possível tocar esta faixa.' }) }}
        />
    )
}
