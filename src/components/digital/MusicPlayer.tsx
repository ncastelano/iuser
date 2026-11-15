// src/components/digital/MusicPlayer.tsx — o player de MÚSICA da sala (produto digital só com áudio): capa grande, nome da faixa e do artista, play/pausa, faixa anterior/próxima,
// barra de progresso que se arrasta, tempo e passagem automática para a faixa seguinte. O ÁUDIO em si mora na casca (components/player/GlobalPlayerHost + store do player):
// por isso a música continua tocando quando a pessoa sai da sala e aparece no mini-player da barra; aqui só fica o desenho e os botões. O link do arquivo é pedido ao servidor a cada faixa.
'use client'

import { useEffect, useState } from 'react'
import { Pause, Play, SkipBack, SkipForward, Lock } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { Spinner } from '@/components/Spinner'
import { formatDuration } from '@/modules/digital'
import { usePlayerStore } from '@/store/usePlayerStore'
import type { QueueTrack } from '@/modules/player'

export default function MusicPlayer({ itemId, title, artist, cover, trackLabel, queue, index, href }: {
    itemId: string; title: string; artist?: string | null; cover?: string | null
    /** "Faixa 2 de 8" */
    trackLabel?: string
    /** as faixas do produto, na ordem, e qual é esta; o player da casca passa de uma para a outra sozinho */
    queue: QueueTrack[]; index: number
    /** a página desta sala (para onde o mini-player leva de volta) */
    href: string
}) {
    const { colors } = useTheme()
    const store = usePlayerStore()
    const mine = store.item?.kind === 'musica' && store.item.id === itemId
    const playing = mine && store.playing
    const pos = mine ? store.pos : 0
    const dur = mine ? store.dur : 0
    const error = mine ? store.error : null
    const [scrub, setScrub] = useState<number | null>(null)

    // abrir a sala (ou escolher outra faixa) toca esta faixa; se ela já está tocando (veio do mini-player), não recomeça
    useEffect(() => {
        const s = usePlayerStore.getState()
        if (s.item?.kind === 'musica' && s.item.id === itemId) return
        s.startMusic({ queue, index, artist, cover, href })
    }, [itemId]) // eslint-disable-line react-hooks/exhaustive-deps

    // o artista (nome da loja) e a capa chegam depois da faixa começar: a faixa de cima da barra passa a mostrá-los
    useEffect(() => { if (mine) usePlayerStore.getState().updateMeta({ artist: artist ?? null, cover: cover ?? null }) }, [mine, artist, cover])

    const toggle = () => store.toggle()
    const hasNext = index + 1 < queue.length
    const hasPrev = index > 0
    const shown = scrub ?? pos
    const pct = dur > 0 ? Math.min(100, (shown / dur) * 100) : 0

    if (error) {
        return (
            <div className="rounded-3xl p-8 flex flex-col items-center gap-2 text-center" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
                <Lock size={26} style={{ color: colors.textSecondary }} />
                <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>{error}</p>
            </div>
        )
    }
    return (
        <div className="rounded-3xl p-4 sm:p-6 flex flex-col items-center gap-4" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
            <div className="w-full max-w-[280px] aspect-square rounded-3xl overflow-hidden flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#f97316,#dc2626)', boxShadow: '0 18px 40px rgba(0,0,0,0.25)' }}>
                {cover ? <img src={cover} alt="" className="w-full h-full object-cover" /> : <span className="text-white/90 text-6xl">♪</span>}
            </div>
            <div className="w-full text-center min-w-0">
                {trackLabel && <p className="text-[11px] font-black uppercase tracking-widest" style={{ color: '#f97316' }}>{trackLabel}</p>}
                <h2 className="text-lg font-black leading-tight truncate" style={{ color: colors.textPrimary }}>{title}</h2>
                {artist && <p className="text-sm truncate" style={{ color: colors.textSecondary }}>{artist}</p>}
            </div>

            <div className="w-full flex flex-col gap-1">
                <input type="range" min={0} max={Math.max(1, dur)} step={0.1} value={shown} onChange={(e) => setScrub(Number(e.target.value))}
                    onPointerUp={(e) => { store.seek(Number((e.target as HTMLInputElement).value)); setScrub(null) }}
                    onKeyUp={(e) => { store.seek(Number((e.target as HTMLInputElement).value)); setScrub(null) }}
                    aria-label="Posição da música" disabled={dur <= 0} className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                    style={{ background: `linear-gradient(to right, #f97316 ${pct}%, ${colors.border} ${pct}%)`, accentColor: '#f97316' }} />
                <div className="flex justify-between text-[11px] font-bold tabular-nums" style={{ color: colors.textSecondary }}>
                    <span>{formatDuration(Math.floor(shown)) || '0:00'}</span><span>{formatDuration(Math.floor(dur)) || '--:--'}</span>
                </div>
            </div>

            <div className="flex items-center gap-5">
                <button type="button" onClick={() => store.prev()} disabled={!mine || (!hasPrev && pos <= 3)} aria-label="Faixa anterior" className="w-12 h-12 rounded-full flex items-center justify-center disabled:opacity-30 transition active:scale-90" style={{ background: `${colors.border}40`, color: colors.textPrimary }}><SkipBack size={20} /></button>
                <button type="button" onClick={toggle} disabled={!mine} aria-label={playing ? 'Pausar' : 'Tocar'} className="w-16 h-16 rounded-full flex items-center justify-center text-white transition active:scale-90 disabled:opacity-50" style={{ background: '#f97316', boxShadow: '0 8px 22px rgba(249,115,22,0.45)' }}>
                    {mine && store.playing && dur === 0 ? <Spinner size={22} color="#fff" /> : playing ? <Pause size={26} fill="#fff" /> : <Play size={26} fill="#fff" className="ml-0.5" />}
                </button>
                <button type="button" onClick={() => store.next()} disabled={!mine || !hasNext} aria-label="Próxima faixa" className="w-12 h-12 rounded-full flex items-center justify-center disabled:opacity-30 transition active:scale-90" style={{ background: `${colors.border}40`, color: colors.textPrimary }}><SkipForward size={20} /></button>
            </div>

        </div>
    )
}
