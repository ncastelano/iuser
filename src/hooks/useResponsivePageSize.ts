// Quantos itens cabem numa "página" das vitrines da home conforme a largura da tela (base = celular).
'use client'

import { useEffect, useState } from 'react'

export function useResponsivePageSize(sizes: { base: number; sm?: number; md?: number; lg?: number }) {
    const [size, setSize] = useState(sizes.base)
    const { base, sm, md, lg } = sizes
    useEffect(() => {
        const update = () => {
            const w = window.innerWidth
            setSize(w >= 1024 ? (lg ?? md ?? sm ?? base) : w >= 768 ? (md ?? sm ?? base) : w >= 640 ? (sm ?? base) : base)
        }
        update()
        window.addEventListener('resize', update)
        return () => window.removeEventListener('resize', update)
    }, [base, sm, md, lg])
    return size
}
