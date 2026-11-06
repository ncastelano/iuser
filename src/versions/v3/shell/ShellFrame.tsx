// src/versions/v3/shell/ShellFrame.tsx
//
// Casca única das páginas do app (/v3, /carrinho, /conversas, /painel-perfil, /modoprestador, /painel-loja,
// veículo): vive no layout `(main)/(shell)`, então a barra do topo, o menu e a aba clara NÃO são recriados a cada
// página — a aba desliza de verdade entre os ícones e o menu mantém o que já carregou.
'use client'

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import ModeShell from './ModeShell'
import { InsideShellContext } from '@/components/InsideShell'

interface ShellSearch {
    value: string
    onChange: (v: string) => void
    placeholder?: string
    /** A página já tem o campo de busca na tela: a lupa da barra só leva o foco pra ele (não expande o campo da barra) */
    inline?: boolean
    focus?: () => void
}

const ShellSearchContext = createContext<((s: ShellSearch | null) => void) | null>(null)

/** A página registra o campo de busca que a lupa da barra do topo deve abrir (só enquanto ela estiver na tela). */
export function useShellSearch(cfg: ShellSearch) {
    const setSearch = useContext(ShellSearchContext)
    const onChangeRef = useRef(cfg.onChange)
    onChangeRef.current = cfg.onChange
    const focusRef = useRef(cfg.focus)
    focusRef.current = cfg.focus
    useEffect(() => {
        if (!setSearch) return
        setSearch({ value: cfg.value, placeholder: cfg.placeholder, inline: cfg.inline, onChange: (v) => onChangeRef.current(v), focus: () => focusRef.current?.() })
    }, [setSearch, cfg.value, cfg.placeholder, cfg.inline])
    useEffect(() => {
        if (!setSearch) return
        return () => setSearch(null)
    }, [setSearch])
}

export default function ShellFrame({ children }: { children: ReactNode }) {
    const [search, setSearch] = useState<ShellSearch | null>(null)
    const setter = useMemo(() => setSearch, [])
    return (
        <ShellSearchContext.Provider value={setter}>
            <InsideShellContext.Provider value>
                {/* --shell-top: onde termina a navbar. Telas cheias (mapas) começam aqui em vez de no topo da janela. */}
                <div style={{ display: 'contents', ['--shell-top' as string]: 'calc(74px + env(safe-area-inset-top))' }}>
                    <ModeShell search={search || undefined}>{children}</ModeShell>
                </div>
            </InsideShellContext.Provider>
        </ShellSearchContext.Provider>
    )
}
