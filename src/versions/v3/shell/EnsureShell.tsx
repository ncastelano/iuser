// src/versions/v3/shell/EnsureShell.tsx
//
// Páginas que só existem com a casca da 3.0 (navbar + menu), mesmo para quem está na 2.0 ou é visitante — ex.: a página
// pública de um veículo (iuser.com.br/<vehicleSlug>). Dentro da casca já, só renderiza; fora, envolve com ela.
'use client'

import type { ReactNode } from 'react'
import { useInsideShell } from '@/components/InsideShell'
import ShellFrame from './ShellFrame'

export default function EnsureShell({ children }: { children: ReactNode }) {
    const inside = useInsideShell()
    if (inside) return <>{children}</>
    return <ShellFrame>{children}</ShellFrame>
}
