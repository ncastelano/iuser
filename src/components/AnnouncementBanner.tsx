// src/components/AnnouncementBanner.tsx
//
// Convite da página inicial da 2.0 (abaixo da busca) para a NOVA versão do iUser (3.0): uma linha só, com o botão que troca de versão
// pelo mecanismo único `switchVersion`. A 3.0 está liberada para todos; se por algum motivo a pessoa não tiver acesso (ou ainda
// estiver carregando), nada aparece. Quem fecha não vê de novo naquela visita (sessionStorage).
'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Rocket, X } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { switchVersion, useV3Access } from '@/versions/client'

const STORAGE_KEY = 'iuser_v3_promo_dismissed'

export default function AnnouncementBanner() {
    const { colors } = useTheme()
    const pathname = usePathname()
    const { userId } = useProfile()
    const access = useV3Access()
    const [visible, setVisible] = useState(false)
    const [switching, setSwitching] = useState(false)

    useEffect(() => {
        try { if (sessionStorage.getItem(STORAGE_KEY)) return } catch { /* sem storage: mostra */ }
        setVisible(true)
    }, [])

    if (!visible || !access.allowed) return null

    const dismiss = () => {
        setVisible(false)
        try { sessionStorage.setItem(STORAGE_KEY, '1') } catch { /* ignora */ }
    }

    return (
        <section
            role="status"
            aria-label="Novo iUser"
            className="relative flex items-center gap-3 rounded-full mb-5 pl-3 pr-2 py-2"
            style={{ background: colors.surface, border: `1px solid ${colors.border}` }}
        >
            <span className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-white" style={{ background: 'linear-gradient(135deg, #f97316, #dc2626)' }}>
                <Rocket size={17} />
            </span>
            <p className="flex-1 min-w-0 text-[13px] font-black leading-tight" style={{ color: colors.textPrimary }}>
                Conheça o novo iUser
                <span className="block text-[11px] font-medium" style={{ color: colors.textSecondary }}>Mais rápido, simples e bonito</span>
            </p>
            <button
                type="button"
                disabled={switching}
                onClick={async () => { setSwitching(true); await switchVersion('v3', { pathname, loggedIn: !!userId }); setSwitching(false) }}
                className="h-9 px-4 rounded-full text-[13px] font-black text-white flex-shrink-0 transition active:scale-95 disabled:opacity-60"
                style={{ background: '#f97316' }}
            >
                {switching ? 'Abrindo…' : 'Ir para a v3'}
            </button>
            <button onClick={dismiss} aria-label="Fechar" className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ color: colors.textSecondary }}>
                <X size={15} />
            </button>
        </section>
    )
}
