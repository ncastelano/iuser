// app/(main)/(shell)/layout.tsx
//
// Páginas que usam a casca com barra do topo + menu lateral (ver ShellFrame). O grupo (shell) não aparece na URL.
import type { ReactNode } from 'react'
import ShellFrame from '@/components/ShellFrame'

export default function ShellLayout({ children }: { children: ReactNode }) {
    return <ShellFrame>{children}</ShellFrame>
}
