// src/components/digital/useSpotlight.ts — o "destaque" da vitrine de produtos digitais: UM cartão por vez ganha vida com a prévia em vídeo e, a cada 3 segundos, o destaque passa para o próximo
// que esteja à vista. Quando a pessoa mexe num cartão (mouse em cima ou dedo segurado) o destaque automático pausa e é ela quem escolhe. Sem movimento se a pessoa pediu menos
// movimento ou economia de dados, ou se a aba está escondida.
'use client'

import { useCallback, useEffect, useState } from 'react'
import { SPOTLIGHT_MS, autoPreviewAllowed, nextSpotlightId } from '@/modules/digital'

function environmentAllows(): boolean {
    if (typeof window === 'undefined') return false
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    const saveData = !!(navigator as any).connection?.saveData
    return autoPreviewAllowed({ reducedMotion, saveData })
}

/** `ids`: os cartões que podem receber o destaque (têm prévia e estão à vista). Devolve o destaque atual, o próximo (para já ir baixando o vídeo) e `interact` (a pessoa está mexendo num cartão). */
export function useSpotlight(ids: string[]) {
    const [active, setActive] = useState<string | null>(null)
    const [busy, setBusy] = useState<string | null>(null)       // cartão que a própria pessoa está vendo
    const [pageVisible, setPageVisible] = useState(true)
    const [allowed, setAllowed] = useState(false)
    const key = ids.join('|')

    useEffect(() => { setAllowed(environmentAllows()) }, [])
    useEffect(() => {
        const on = () => setPageVisible(document.visibilityState === 'visible')
        on(); document.addEventListener('visibilitychange', on)
        return () => document.removeEventListener('visibilitychange', on)
    }, [])

    useEffect(() => {
        if (!allowed || !pageVisible || busy || ids.length === 0) { setActive(null); return }
        setActive((a) => (a && ids.includes(a) ? a : nextSpotlightId(ids, null)))
        if (ids.length < 2) return
        const t = setInterval(() => setActive((a) => nextSpotlightId(ids, a)), SPOTLIGHT_MS)
        return () => clearInterval(t)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allowed, pageVisible, busy, key])

    const interact = useCallback((id: string | null) => setBusy(id), [])
    const next = active ? nextSpotlightId(ids, active) : ids[0] ?? null
    return { active, next, interact }
}
