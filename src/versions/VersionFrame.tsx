// src/versions/VersionFrame.tsx
//
// Moldura por versão: na 3.0 as páginas abrem dentro da casca (navbar + drawer, persistente entre páginas). A versão
// efetiva vem do servidor (cookie + permissão), então servidor e cliente começam iguais.
'use client'

import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import ShellFrame from '@/versions/v3/shell/ShellFrame'
import { usesShell } from './resolve'
import type { UiVersion } from './registry'

export default function VersionFrame({ version, children }: { version: UiVersion; children: ReactNode }) {
    const pathname = usePathname() || '/'
    if (usesShell(version, pathname)) return <ShellFrame>{children}</ShellFrame>
    return <>{children}</>
}
