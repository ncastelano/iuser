// src/components/AdminV3Button.tsx
//
// Botão flutuante "v3" no canto superior esquerdo da homepage do administrador (interface 2.0): entrada rápida para
// a interface 3.0. Só o administrador geral vê; ninguém mais tem este atalho.
'use client'

import { Sparkles } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useProfile } from '@/app/contexts/ProfileContext'
import { switchVersion, useUiVersion, useV3Access } from '@/versions/client'

export default function AdminV3Button() {
    const pathname = usePathname()
    const { userId } = useProfile()
    const version = useUiVersion()
    const access = useV3Access()

    if (pathname !== '/' || version !== 'v2' || !access.isAdmin) return null
    return (
        <button
            onClick={() => switchVersion('v3', { pathname: '/', loggedIn: !!userId, destination: '/' })}
            aria-label="Abrir a interface 3.0"
            className="fixed z-[60] flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-black text-white shadow-lg transition active:scale-95"
            style={{
                top: 'calc(10px + env(safe-area-inset-top))',
                left: 10,
                background: 'linear-gradient(135deg, #f97316, #dc2626)',
                border: '1.5px solid rgba(255,255,255,0.85)',
            }}
        >
            <Sparkles size={13} /> v3
        </button>
    )
}
