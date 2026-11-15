// src/hooks/useStoreLevels.ts — a escada de níveis de loja (cacheada no módulo; devolve a de fábrica até a de verdade chegar).
'use client'

import { useEffect, useState } from 'react'
import { cachedStoreLevels, loadStoreLevels, type StoreLevel } from '@/modules/store-levels'

export function useStoreLevels(): StoreLevel[] {
    const [levels, setLevels] = useState<StoreLevel[]>(cachedStoreLevels())
    useEffect(() => {
        let alive = true
        void loadStoreLevels().then((l) => { if (alive) setLevels(l) })
        return () => { alive = false }
    }, [])
    return levels
}
