// src/components/AnnouncementBanner.tsx
//
// Aviso fixo da página inicial (abaixo da busca): "estamos evoluindo, pode haver instabilidade". Some sozinho depois de
// ANNOUNCEMENT_UNTIL, e quem fecha não vê de novo naquela visita (sessionStorage). Para trocar o texto ou tirar do ar,
// mexa só nas constantes abaixo.
'use client'

import { useEffect, useState } from 'react'
import { Layers, Palette, Server, Sparkles, X } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'

// Depois desta data o aviso para de aparecer (fim do ciclo de cobrança do Supabase). Ajuste quando quiser.
const ANNOUNCEMENT_UNTIL = '2026-11-14T00:00:00-03:00'
const STORAGE_KEY = 'iuser_announcement_2026_10_dismissed'

const TITLE = 'Estamos evoluindo o iUser!'
const MESSAGE =
    'Nos próximos dias vamos ampliar nossos serviços e atualizar o banco de dados, o servidor e o design do app. ' +
    'Por isso, você pode notar algumas instabilidades. É passageiro, e o iUser vai ficar ainda melhor. Obrigado pela paciência!'
const HIGHLIGHTS = [
    { icon: Layers, label: 'Mais serviços' },
    { icon: Server, label: 'Banco e servidor atualizados' },
    { icon: Palette, label: 'Novo design' },
]

export default function AnnouncementBanner() {
    const { colors } = useTheme()
    const [visible, setVisible] = useState(false)

    useEffect(() => {
        if (Date.now() > new Date(ANNOUNCEMENT_UNTIL).getTime()) return
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
            aria-label="Aviso do iUser"
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
                        <Sparkles size={22} />
                    </span>
                    <div className="min-w-0">
                        <span className="inline-block text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full text-white mb-1" style={{ background: 'linear-gradient(90deg, #f97316, #dc2626)' }}>
                            Novidades a caminho
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
            </div>
        </section>
    )
}
