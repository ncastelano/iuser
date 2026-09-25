// components/ThemeColorSync.tsx
'use client'

import { useEffect } from 'react'
import { useTheme } from '@/app/contexts/theme'

// Safari (e outros navegadores mobile) lê a <meta name="theme-color"> pra
// colorir a barra de endereço/status bar. O layout raiz já renderiza essa
// tag uma vez (viewport.themeColor), mas fixa - aqui mantém o conteúdo dela
// sincronizado com o tema que a pessoa está usando no app (claro/escuro),
// então a cor do navegador muda junto, sem precisar recarregar a página.
export function ThemeColorSync() {
    const background = useTheme((s) => s.colors.background)

    useEffect(() => {
        let meta = document.querySelector('meta[name="theme-color"]')
        if (!meta) {
            meta = document.createElement('meta')
            meta.setAttribute('name', 'theme-color')
            document.head.appendChild(meta)
        }
        meta.setAttribute('content', background)
    }, [background])

    return null
}
