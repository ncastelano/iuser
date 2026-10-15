// src/components/ProfileDashboard/UiVersionCard.tsx
//
// Convite para experimentar a interface 3.0. Só aparece para quem está na 2.0 e só se o admin deixou a 3.0
// disponível. A troca usa o mesmo mecanismo central de versões (src/versions): mantém a sessão, salva a preferência
// e não mexe em dados, plano ou permissões.
'use client'

import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { switchVersion, useUiVersion, useV3Offered, versionLabel } from '@/versions/client'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

export default function UiVersionCard() {
    const { colors } = useTheme()
    const { userId } = useProfile()
    const pathname = usePathname()
    const version = useUiVersion()
    const offered = useV3Offered()
    const [busy, setBusy] = useState(false)

    if (version !== 'v2' || !offered) return null

    return (
        <div
            className="rounded-2xl p-4 flex items-center gap-3"
            style={{ background: colors.surface, border: `1px solid ${colors.border}`, boxShadow: colors.shadow }}
        >
            <span className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 text-white" style={{ background: GRADIENT }}>
                <Sparkles size={20} />
            </span>
            <div className="min-w-0 flex-1">
                <p className="text-sm font-black" style={{ color: colors.textPrimary }}>Experimentar o {versionLabel('v3')}</p>
                <p className="text-[11px] mt-0.5" style={{ color: colors.textSecondary }}>
                    Muda só a interface: sua conta, seus dados e seu plano continuam iguais, e você pode voltar quando quiser.
                </p>
            </div>
            <button
                disabled={busy}
                onClick={async () => {
                    setBusy(true)
                    // A home vira a home da 3.0; o painel do perfil (em /slug) tem o equivalente em /painel-perfil
                    await switchVersion('v3', { pathname: pathname || '/', loggedIn: !!userId, destination: pathname === '/' ? '/' : '/painel-perfil' })
                }}
                className="px-4 py-2 rounded-full text-xs font-black text-white flex-shrink-0 disabled:opacity-60 transition active:scale-95"
                style={{ background: GRADIENT }}
            >
                {busy ? 'Trocando…' : 'Mudar para a 3.0'}
            </button>
        </div>
    )
}
