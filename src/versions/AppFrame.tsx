// src/versions/AppFrame.tsx
//
// Moldura das páginas: todas abrem dentro da casca (ModeShell: barra de baixo + menu, persistente entre páginas), menos as de
// SHELL_EXCLUDED (link do entregador, laboratórios).
'use client'

import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import ShellFrame from '@/versions/v3/shell/ShellFrame'
import { usesShell } from './resolve'

export default function AppFrame({ children }: { children: ReactNode }) {
    const pathname = usePathname() || '/'
    if (usesShell(pathname)) return <ShellFrame>{children}</ShellFrame>
    return <>{children}</>
}
