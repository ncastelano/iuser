// app/(main)/layout.tsx
//
// Moldura das páginas do app: dentro da casca (AppFrame → ShellFrame), menos as de SHELL_EXCLUDED.
import { ReactNode } from 'react'
import AppFrame from '@/versions/AppFrame'

// As páginas sempre foram renderizadas a cada pedido (o layout lia o cookie da versão da interface); continua assim.
export const dynamic = 'force-dynamic'

export default function MainLayout({ children }: { children: ReactNode }) {
    return <AppFrame>{children}</AppFrame>
}
