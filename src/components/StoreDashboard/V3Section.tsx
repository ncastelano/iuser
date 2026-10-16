// src/components/StoreDashboard/V3Section.tsx
//
// Cartão de seção do painel (painel da loja) no desenho da interface 3.0: fundo sólido, borda fina, cantos grandes, ícone
// minimalista: título + linha de apoio, selo opcional e seta de abrir/fechar — sem ícones (as cores ficam por conta do selo e
// do texto de apoio). Todas as seções do painel usam este mesmo cartão na 3.0, pra a página ter um desenho só (a 2.0 segue
// com o cartão de vidro de cada componente).
'use client'

import type { ReactNode } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'

export const V3_GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

export default function V3Section({
    title, subtitle, subtitleColor, badge, trailing, expanded, onToggle, highlight = false, className = 'mb-6', children,
}: {
    title: string
    /** linha de apoio embaixo do título */
    subtitle?: ReactNode
    subtitleColor?: string
    /** selo à direita (ex.: quantidade) */
    badge?: ReactNode
    /** algo a mais antes da seta (ex.: botão de atualizar) */
    trailing?: ReactNode
    /** sem `onToggle` o cartão não abre/fecha (só mostra o conteúdo) */
    expanded?: boolean
    onToggle?: () => void
    /** borda laranja de "tem algo esperando" */
    highlight?: boolean
    className?: string
    children?: ReactNode
}) {
    const { colors } = useTheme()
    const collapsible = !!onToggle
    const open = !collapsible || !!expanded
    return (
        <section
            className={`rounded-3xl overflow-hidden ${className}`}
            style={{
                background: colors.surface,
                border: highlight ? '1.5px solid #f97316' : `1px solid ${colors.border}`,
                boxShadow: highlight ? '0 6px 20px #f9731626' : 'none',
            }}
        >
            <div className="flex items-center gap-1 pr-3">
                <button
                    type="button"
                    onClick={onToggle}
                    disabled={!collapsible}
                    aria-expanded={collapsible ? open : undefined}
                    className="flex-1 min-w-0 flex items-center gap-3 p-4 text-left"
                    style={{ cursor: collapsible ? 'pointer' : 'default' }}
                >
                    <span className="min-w-0 flex-1">
                        <span className="block text-base font-black leading-tight" style={{ color: colors.textPrimary }}>{title}</span>
                        {subtitle && <span className="block text-[11px] mt-0.5 leading-snug" style={{ color: subtitleColor || colors.textSecondary }}>{subtitle}</span>}
                    </span>
                    {badge}
                    {collapsible && (open ? <ChevronUp size={20} style={{ color: colors.textSecondary }} className="flex-shrink-0" /> : <ChevronDown size={20} style={{ color: colors.textSecondary }} className="flex-shrink-0" />)}
                </button>
                {trailing}
            </div>
            {open && children !== undefined && children !== null && <div className="px-4 pb-4 flex flex-col gap-4">{children}</div>}
        </section>
    )
}

/** Pílula de ação padrão do painel na 3.0 (altura fixa, mesma tipografia) */
export function v3Pill(primary: boolean, colors: { border: string; textPrimary: string }) {
    return primary
        ? { background: V3_GRADIENT, color: '#fff', boxShadow: '0 4px 12px #f9731640' }
        : { background: `${colors.border}50`, color: colors.textPrimary }
}
