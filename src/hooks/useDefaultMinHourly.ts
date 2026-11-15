// src/hooks/useDefaultMinHourly.ts — o ganho mínimo por HORA padrão do iUser (Admin → Tarifas; R$ 40 até carregar), para o "Por tempo" já ter valor mesmo sem o motorista ter definido o dele.
'use client'

import { useEffect, useState } from 'react'
import { DEFAULT_MIN_HOURLY, loadDefaultMinHourly } from '@/modules/negotiation'

export function useDefaultMinHourly(): number {
    const [v, setV] = useState(DEFAULT_MIN_HOURLY)
    useEffect(() => {
        let alive = true
        void loadDefaultMinHourly().then((n) => { if (alive) setV(n) })
        return () => { alive = false }
    }, [])
    return v
}
