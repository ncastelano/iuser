// components/NavProgress.tsx — RESPOSTA NA HORA ao trocar de página (23/11/2026: "demora 1 s para perceber reação"). No toque num link do
// app, num botão da barra ou em qualquer coisa que leve a outra página, uma barrinha laranja aparece no topo IMEDIATAMENTE e corre até a
// página nova chegar (a troca do endereço). Sem navegação de verdade (toque que não muda de página), some sozinha em 1,6 s.
'use client'

import { useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import { usePathname, useSearchParams } from 'next/navigation'

let startFn: (() => void) | null = null
/** chame antes de um router.push que pode demorar (ex.: botões que navegam por código) */
export function startNavProgress() { startFn?.() }

export default function NavProgress() {
    const pathname = usePathname()
    const search = useSearchParams()
    const [w, setW] = useState(0)
    const [show, setShow] = useState(false)
    const timers = useRef<ReturnType<typeof setTimeout>[]>([])
    const clear = () => { timers.current.forEach(clearTimeout); timers.current = [] }

    const start = () => {
        clear()
        setShow(true); setW(12)
        timers.current.push(setTimeout(() => setW(45), 120), setTimeout(() => setW(70), 500), setTimeout(() => setW(85), 1100), setTimeout(() => { setW(100); timers.current.push(setTimeout(() => { setShow(false); setW(0) }, 250)) }, 1600))
    }
    useEffect(() => { startFn = start; return () => { startFn = null } })

    // a página trocou: completa e some
    useEffect(() => {
        if (!show) return
        clear(); setW(100)
        timers.current.push(setTimeout(() => { setShow(false); setW(0) }, 220))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pathname, search?.toString()])

    // toques que levam a outra página: links internos e botões da barra/de navegação
    useEffect(() => {
        const onClick = (e: MouseEvent) => {
            if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return
            const el = e.target as HTMLElement | null
            const a = el?.closest('a') as HTMLAnchorElement | null
            if (a && a.href && !a.target && a.origin === window.location.origin && (a.pathname !== window.location.pathname || a.search !== window.location.search)) { start(); return }
            if (el?.closest('nav button, [data-nav]')) start()
        }
        document.addEventListener('click', onClick, true)
        return () => document.removeEventListener('click', onClick, true)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    if (!show) return null
    return (
        <div aria-hidden className="fixed left-0 top-0 z-[200] h-[3px] pointer-events-none" style={{ width: `${w}%`, background: 'linear-gradient(90deg,#f97316,#dc2626)', boxShadow: '0 0 8px #f9731699', transition: 'width 300ms ease, opacity 200ms' }} />
    )
}

// Todo router.push / router.replace do app (botões da home, cartões, menus) também acende a barrinha: o contexto do roteador é
// re-oferecido com push/replace que avisam antes. Assim não é preciso mexer em cada botão.

export function NavRouterBoost({ children }: { children: ReactNode }) {
    const r = useContext(AppRouterContext)
    const value = useMemo(() => {
        if (!r) return r
        const same = (href: string) => { try { const u = new URL(href, window.location.href); return u.pathname === window.location.pathname && u.search === window.location.search } catch { return false } }
        return {
            ...r,
            push: (href: string, opts?: any) => { if (!same(href)) startNavProgress(); return r.push(href, opts) },
            replace: (href: string, opts?: any) => { if (!same(href)) startNavProgress(); return r.replace(href, opts) },
        }
    }, [r])
    return <AppRouterContext.Provider value={value}>{children}</AppRouterContext.Provider>
}
