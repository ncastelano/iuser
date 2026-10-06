// src/app/(main)/inicio/sections/HomeSectionKit.tsx
//
// Linguagem visual compartilhada das seções da home — nasceu no protótipo
// /modelodehomepage e foi trazida pra cá pra valer na home de verdade.
// Só estilo (cards com efeito glass + cabeçalho padronizado por ícone),
// nenhuma seção perde lógica/dado/comportamento ao adotar isso.
'use client'

import { ReactNode } from 'react'
import { ChevronRight, type LucideIcon } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'

export const HOME_GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

// Cabeçalho padrão de seção: ícone em caixa gradiente + título + subtítulo
// opcional. `action` substitui o "ver tudo" decorativo por um link/botão de
// verdade quando a seção tiver uma rota própria pra "ver tudo" (ex:
// /lojas-em-destaque) — sem `action`, fica só o enfeite, sem link nenhum.
export function HomeSectionHeader({
    icon: Icon,
    title,
    subtitle,
    action,
    dragHandle,
}: {
    icon?: LucideIcon
    title: string
    subtitle?: string
    action?: ReactNode
    dragHandle?: ReactNode
}) {
    const { colors } = useTheme()
    return (
        <div className="flex items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-3 min-w-0">
                {dragHandle}
                {Icon && (
                    <div
                        className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
                        style={{ background: HOME_GRADIENT, boxShadow: '0 4px 12px #f9731650' }}
                    >
                        <Icon size={18} color="#fff" strokeWidth={2.25} />
                    </div>
                )}
                <div className="min-w-0">
                    <h2 className="text-lg font-black leading-tight truncate" style={{ color: colors.textPrimary }}>{title}</h2>
                    {subtitle && (
                        <p className="text-xs opacity-60 truncate" style={{ color: colors.textPrimary }}>{subtitle}</p>
                    )}
                </div>
            </div>
            {action ?? (
                <div className="flex items-center gap-0.5 text-xs font-bold opacity-50 flex-shrink-0" style={{ color: colors.textPrimary }}>
                    ver tudo <ChevronRight size={14} />
                </div>
            )}
        </div>
    )
}

// Card com efeito glass (fundo translúcido + blur) — o container padrão de
// cada seção na home, substituindo o "rounded-2xl p-6 / bg sólido translúcido"
// que cada seção reinventava do jeito dela.
export function HomeGlassCard({
    children,
    className = '',
    style = {},
}: {
    children: ReactNode
    className?: string
    style?: React.CSSProperties
}) {
    const { colors } = useTheme()
    return (
        <div
            className={`rounded-3xl ${className}`}
            style={{
                background: colors.name === 'claro' ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.05)',
                backdropFilter: 'blur(16px) saturate(180%)',
                WebkitBackdropFilter: 'blur(16px) saturate(180%)',
                border: `1px solid ${colors.border}`,
                boxShadow: colors.shadow,
                transform: 'translateZ(0)',
                willChange: 'transform',
                ...style,
            }}
        >
            {children}
        </div>
    )
}
