// src/components/NavigationProgressBar.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useNavProgressStore } from '@/store/useNavProgressStore'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

// ===== Barra de progresso no topo da tela =====
// Reação imediata ao clicar em algo que navega: a barra aparece na hora do
// clique (sobe rápido até ~85%) e, quando a rota nova termina de montar,
// completa até 100% e some.
export function NavigationProgressBar() {
    const isNavigating = useNavProgressStore((s) => s.isNavigating)
    const done = useNavProgressStore((s) => s.done)
    const pathname = usePathname()
    const isFirstRender = useRef(true)

    const [visible, setVisible] = useState(false)
    const [progress, setProgress] = useState(0)
    const [transitionMs, setTransitionMs] = useState(3000)

    // A rota mudou: a navegação terminou.
    useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false
            return
        }
        done()
    }, [pathname, done])

    // Rede de segurança: se por algum motivo o pathname não mudar (ex.: o
    // clique não navegava de fato), some sozinha depois de um tempo.
    useEffect(() => {
        if (!isNavigating) return
        const timer = setTimeout(() => done(), 4000)
        return () => clearTimeout(timer)
    }, [isNavigating, done])

    useEffect(() => {
        if (isNavigating) {
            setVisible(true)
            setTransitionMs(3000)
            // Pequeno delay pra garantir que a transição anime a partir de 0%
            const raf = requestAnimationFrame(() => setProgress(85))
            return () => cancelAnimationFrame(raf)
        }

        // Terminou: completa até 100% rapidinho, espera a barra chegar lá,
        // depois esconde e zera pra próxima navegação.
        setTransitionMs(200)
        setProgress(100)
        const hideTimer = setTimeout(() => setVisible(false), 200)
        const resetTimer = setTimeout(() => setProgress(0), 450)
        return () => {
            clearTimeout(hideTimer)
            clearTimeout(resetTimer)
        }
    }, [isNavigating])

    return (
        <div
            className="fixed top-0 left-0 right-0 z-[9999] pointer-events-none"
            style={{
                height: 3,
                opacity: visible ? 1 : 0,
                transition: 'opacity 0.25s ease',
            }}
        >
            <div
                style={{
                    height: '100%',
                    background: GRADIENT,
                    boxShadow: '0 0 8px #f9731680',
                    width: `${progress}%`,
                    transition: `width ${transitionMs}ms cubic-bezier(0.1, 0.7, 0.7, 1)`,
                }}
            />
        </div>
    )
}
