// src/store/usePlayerStore.ts
//
// O ESTADO do mini-player (a última coisa vista/ouvida) — ver modules/player. Só a MÚSICA toca de verdade aqui: o <audio> mora na casca
// (components/player/GlobalPlayerHost) e fala com este estado; aula (vídeo) e flash só deixam o rastro (título, capa, onde parou) para
// a faixa de cima levar a pessoa de volta à página.
import { create } from 'zustand'
import { backTarget, nextIndex, type PlayerItem, type QueueTrack, type SavedPlayer } from '@/modules/player'

/** O que o <audio> da casca sabe fazer (registrado pelo GlobalPlayerHost) */
export interface AudioControls { toggle: () => void; seek: (sec: number) => void; stop: () => void; pause: () => void; hasSource: () => boolean }
let controls: AudioControls | null = null
export const registerAudioControls = (c: AudioControls | null) => { controls = c }

interface Meta { artist: string | null; cover: string | null; href: string }
interface PlayerState {
    item: PlayerItem | null
    queue: QueueTrack[]
    qIndex: number
    meta: Meta
    playing: boolean
    pos: number
    dur: number
    /** cada pedido de "carregue e toque a faixa atual" muda este número (o host reage) */
    loadToken: number
    /** ao restaurar do aparelho: de onde a faixa recomeça */
    resumeAt: number
    error: string | null
    /** a última faixa que chegou ao fim (a sala marca como concluída) */
    ended: { id: string; n: number } | null

    startMusic: (p: { queue: QueueTrack[]; index: number; artist?: string | null; cover?: string | null; href: string }) => void
    goTo: (index: number) => void
    next: () => void
    prev: () => void
    /** o artista e a capa chegam depois de a faixa começar: atualiza o que a faixa de cima mostra */
    updateMeta: (m: { artist?: string | null; cover?: string | null }) => void
    toggle: () => void
    seek: (sec: number) => void
    reportMedia: (item: PlayerItem, s: { pos: number; dur: number; playing: boolean }) => void
    pauseMedia: () => void
    close: () => void
    restore: (s: SavedPlayer) => void
    /** o host conta o que o <audio> está fazendo */
    audioState: (p: Partial<Pick<PlayerState, 'playing' | 'pos' | 'dur' | 'error' | 'resumeAt'>>) => void
    trackEnded: () => void
}

const musicItem = (t: QueueTrack, m: Meta): PlayerItem => ({ kind: 'musica', id: t.itemId, title: t.title, sub: `${m.artist || 'iUser'} · Música`, cover: m.cover, href: m.href })

export const usePlayerStore = create<PlayerState>((set, get) => ({
    item: null, queue: [], qIndex: 0, meta: { artist: null, cover: null, href: '/' },
    playing: false, pos: 0, dur: 0, loadToken: 0, resumeAt: 0, error: null, ended: null,

    startMusic: ({ queue, index, artist = null, cover = null, href }) => {
        const t = queue[index]
        if (!t) return
        const meta = { artist, cover, href }
        set((s) => ({ item: musicItem(t, meta), queue, qIndex: index, meta, playing: true, pos: 0, dur: 0, resumeAt: 0, error: null, loadToken: s.loadToken + 1 }))
    },
    goTo: (index) => {
        const { queue, meta } = get()
        const t = queue[index]
        if (!t) return
        set((s) => ({ item: musicItem(t, meta), qIndex: index, playing: true, pos: 0, dur: 0, resumeAt: 0, error: null, loadToken: s.loadToken + 1 }))
    },
    next: () => { const { qIndex, queue } = get(); const n = nextIndex(qIndex, queue.length); if (n !== null) get().goTo(n) },
    prev: () => {
        const { qIndex, pos } = get()
        const t = backTarget(qIndex, pos)
        if (t.restart) get().seek(0)
        else if (t.index !== null) get().goTo(t.index)
    },
    updateMeta: (m) => {
        const s = get()
        if (s.item?.kind !== 'musica') return
        const meta = { ...s.meta, artist: m.artist !== undefined ? m.artist : s.meta.artist, cover: m.cover !== undefined ? m.cover : s.meta.cover }
        const t = s.queue[s.qIndex]
        set({ meta, item: t ? musicItem({ itemId: s.item.id, title: t.title }, meta) : { ...s.item, sub: `${meta.artist || 'iUser'} · Música`, cover: meta.cover } })
    },
    toggle: () => {
        const s = get()
        if (s.item?.kind !== 'musica') return
        if (controls?.hasSource()) controls.toggle()
        else set((x) => ({ playing: true, error: null, loadToken: x.loadToken + 1 }))   // restaurada do aparelho: ainda sem arquivo carregado
    },
    seek: (sec) => { controls?.seek(sec); set({ pos: Math.max(0, sec) }) },

    reportMedia: (item, st) => {
        const cur = get()
        // a música tocando manda na faixa de cima: o flash (mudo) não a tira de lá; a aula (com som) pausa a música e toma o lugar
        if (item.kind === 'flash' && cur.item?.kind === 'musica' && cur.playing) return
        if (item.kind === 'aula' && cur.item?.kind === 'musica') controls?.stop()
        set({ item, queue: [], qIndex: 0, playing: st.playing, pos: st.pos, dur: st.dur, error: null })
    },
    pauseMedia: () => set((s) => (s.item && s.item.kind !== 'musica' && s.playing ? { playing: false } : s)),

    close: () => { controls?.stop(); set({ item: null, queue: [], qIndex: 0, playing: false, pos: 0, dur: 0, resumeAt: 0, error: null }) },
    restore: (sv) => set({ item: sv.item, queue: sv.queue, qIndex: sv.qIndex, meta: { artist: null, cover: sv.item.cover, href: sv.item.href }, playing: false, pos: sv.pos, dur: sv.dur, resumeAt: sv.pos, error: null }),

    audioState: (p) => set(p as Partial<PlayerState>),
    trackEnded: () => {
        const { item, qIndex, queue } = get()
        if (item) set((s) => ({ ended: { id: item.id, n: (s.ended?.n || 0) + 1 } }))
        const n = nextIndex(qIndex, queue.length)
        if (n !== null) get().goTo(n)
        else set({ playing: false, pos: 0 })
    },
}))
