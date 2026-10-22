// src/components/AnnouncementBanner.tsx
//
// Cartão da página inicial da 2.0 (abaixo da busca) que apresenta a NOVA versão do iUser (3.0). Quem já tem acesso à 3.0
// vê o botão "Conhecer agora" (troca de versão pelo mecanismo único `switchVersion`); quem ainda não tem vê "Em breve".
// Quem fecha não vê de novo naquela visita (sessionStorage). Para trocar o texto ou tirar do ar, mexa só nas constantes abaixo.
'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { CalendarClock, MessageCircle, Navigation, Rocket, X } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { switchVersion, useV3Access } from '@/versions/client'

const STORAGE_KEY = 'iuser_v3_promo_dismissed'

const TITLE = 'Conheça o novo iUser'
const MESSAGE =
    'A versão 3.0 chegou com um jeito mais rápido e simples de usar: navegação nova, lojas mais bonitas, ' +
    'agenda com horários livres e conversa direta com lojas e clientes.'
const HIGHLIGHTS = [
    { icon: Navigation, label: 'Navegação nova' },
    { icon: CalendarClock, label: 'Agenda com horários livres' },
    { icon: MessageCircle, label: 'Conversa com a loja' },
]

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

    if (!visible) return null

    const dismiss = () => {
        setVisible(false)
        try { sessionStorage.setItem(STORAGE_KEY, '1') } catch { /* ignora */ }
    }

    return (
        <section
            role="status"
            aria-label="Novidade do iUser"
            className="relative overflow-hidden rounded-3xl mb-5"
            style={{
                background: colors.surface,
                border: `1px solid ${colors.border}`,
                boxShadow: '0 10px 30px -12px rgba(249,115,22,0.45)',
            }}
        >
            {/* faixa de degradê da marca no topo */}
            <div aria-hidden className="h-1.5 w-full" style={{ background: 'linear-gradient(90deg, #f97316, #dc2626, #f97316)' }} />
            {/* brilho suave de fundo */}
            <div aria-hidden className="pointer-events-none absolute -top-10 -right-10 w-40 h-40 rounded-full" style={{ background: 'radial-gradient(circle, rgba(249,115,22,0.22), transparent 70%)' }} />

            <button
                onClick={dismiss}
                aria-label="Fechar aviso"
                className="absolute top-3.5 right-3 w-7 h-7 rounded-full flex items-center justify-center"
                style={{ color: colors.textSecondary, background: 'rgba(127,127,127,0.12)' }}
            >
                <X size={15} />
            </button>

            <div className="relative p-4 pr-11">
                <div className="flex items-center gap-3">
                    <span
                        className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 text-white"
                        style={{ background: 'linear-gradient(135deg, #f97316, #dc2626)', boxShadow: '0 6px 16px -6px rgba(220,38,38,0.6)' }}
                    >
                        <Rocket size={22} />
                    </span>
                    <div className="min-w-0">
                        <span className="inline-block text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full text-white mb-1" style={{ background: 'linear-gradient(90deg, #f97316, #dc2626)' }}>
                            Novidade · versão 3.0
                        </span>
                        <h2 className="text-base font-black leading-tight" style={{ color: colors.textPrimary }}>{TITLE}</h2>
                    </div>
                </div>

                <p className="mt-3 text-[13px] leading-relaxed" style={{ color: colors.textSecondary }}>{MESSAGE}</p>

                <div className="mt-3 flex flex-wrap gap-2">
                    {HIGHLIGHTS.map(({ icon: Icon, label }) => (
                        <span
                            key={label}
                            className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1.5 rounded-full"
                            style={{ color: colors.textPrimary, background: 'rgba(249,115,22,0.10)', border: '1px solid rgba(249,115,22,0.30)' }}
                        >
                            <Icon size={13} style={{ color: '#f97316' }} />
                            {label}
                        </span>
                    ))}
                </div>

                <div className="mt-4">
                    {access.allowed ? (
                        <button
                            type="button"
                            disabled={switching}
                            onClick={async () => { setSwitching(true); await switchVersion('v3', { pathname, loggedIn: !!userId }); setSwitching(false) }}
                            className="w-full h-11 rounded-full text-sm font-black text-white transition active:scale-[0.98] disabled:opacity-60"
                            style={{ background: '#f97316' }}
                        >
                            {switching ? 'Abrindo…' : 'Conhecer agora'}
                        </button>
                    ) : (
                        <p className="text-[12px] font-bold text-center py-2.5 rounded-full" style={{ color: colors.textSecondary, background: 'rgba(249,115,22,0.10)' }}>
                            Em breve para todos. Fique de olho!
                        </p>
                    )}
                </div>
            </div>
        </section>
    )
}
