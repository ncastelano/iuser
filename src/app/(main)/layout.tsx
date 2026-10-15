// app/(main)/layout.tsx
//
// Resolve a versão da interface no servidor (cookie + permissão liberada pelo admin) e escolhe a moldura:
// na 3.0 as páginas abrem dentro da casca (VersionFrame); na 2.0 cada página traz o próprio cabeçalho.
import { ReactNode } from 'react'
import { cookies } from 'next/headers'
import VersionFrame from '@/versions/VersionFrame'
import { resolveRequestVersion } from '@/versions/access'
import { VERSION_COOKIE } from '@/versions/registry'

export default async function MainLayout({ children }: { children: ReactNode }) {
    const jar = await cookies()
    const version = await resolveRequestVersion(jar.getAll(), jar.get(VERSION_COOKIE)?.value)
    return <VersionFrame version={version}>{children}</VersionFrame>
}
