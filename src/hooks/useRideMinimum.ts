// src/hooks/useRideMinimum.ts — o valor mínimo por minuto de trabalho (Admin → Tarifas), para as telas calcularem o piso das corridas.
'use client'

import { useEffect, useState } from 'react'
import { DEFAULT_MIN_PER_MINUTE, loadRideMinimum } from '@/modules/negotiation'

export function useRideMinimum(): number {
    const [v, setV] = useState(DEFAULT_MIN_PER_MINUTE)
    useEffect(() => {
        let alive = true
        void loadRideMinimum().then((n) => { if (alive) setV(n) })
        return () => { alive = false }
    }, [])
    return v
}
