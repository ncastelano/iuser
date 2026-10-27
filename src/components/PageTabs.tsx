// src/components/PageTabs.tsx
//
// Fileira de abas (chips) que fica no começo do conteúdo das páginas dentro do ModeShell — o que antes eram as abas do
// Header antigo (salas de conversa, seções do carrinho...). Mesma forma de dados do `Tab` do Header.
'use client'

import { useTheme } from '@/app/contexts/theme'
import type { LucideIcon } from 'lucide-react'

/** Uma aba: chip em uma fileira de abas (o Header antigo e a casca da 3.0 usam o mesmo formato) */
export interface Tab {
    id: string
    label: string
    icon: LucideIcon
    imageUrl?: string | null
    onClick: () => void
    isActive: boolean
    indicator?: {
        pending: number
        preparing: number
        ready: number
    } | null
    badge?: {
        count: number
        color?: string
    } | null
    statusColor?: string
    // Borda laranja brilhante igual à da barra de busca (chamadas à ação do visitante)
    glow?: boolean
}

export default function PageTabs({ tabs }: { tabs: Tab[] }) {
    const { colors } = useTheme()
    if (!tabs || tabs.length === 0) return null
    return (
        <div className="flex gap-2 overflow-x-auto pb-1 pt-1 scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
            {tabs.map((tab) => {
                const active = tab.isActive
                const Icon = tab.icon
                return (
                    <button
                        key={tab.id}
                        onClick={tab.onClick}
                        className="relative flex items-center gap-1.5 pl-1.5 pr-3.5 h-10 rounded-full text-xs font-black whitespace-nowrap flex-shrink-0 transition active:scale-95"
                        style={{
                            // Mesmo desenho da ilha e da barra de baixo: fundo sólido da página, borda e sombra leve; a aba atual ganha o laranja
                            background: active ? (tab.statusColor ? `${tab.statusColor}1f` : '#f9731614') : colors.background,
                            color: active ? (tab.statusColor || '#ea580c') : colors.textPrimary,
                            border: `1.5px solid ${active ? (tab.statusColor || '#f97316') : colors.border}`,
                            boxShadow: '0 4px 14px rgba(0,0,0,0.07)',
                        }}
                    >
                        {tab.imageUrl ? (
                            <img src={tab.imageUrl} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                        ) : (
                            <span className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: active ? (tab.statusColor || '#f97316') : `${colors.border}66`, color: active ? '#fff' : colors.textPrimary }}>
                                <Icon size={14} />
                            </span>
                        )}
                        <span>{tab.label}</span>
                        {tab.indicator && (
                            <span className="absolute -top-1 -right-1 flex gap-0.5">
                                {tab.indicator.pending > 0 && <span className="w-4 h-4 rounded-full bg-blue-500 text-white text-[8px] flex items-center justify-center font-black">{tab.indicator.pending}</span>}
                                {tab.indicator.preparing > 0 && <span className="w-4 h-4 rounded-full bg-yellow-500 text-white text-[8px] flex items-center justify-center font-black">{tab.indicator.preparing}</span>}
                                {tab.indicator.ready > 0 && <span className="w-4 h-4 rounded-full bg-purple-500 text-white text-[8px] flex items-center justify-center font-black">{tab.indicator.ready}</span>}
                            </span>
                        )}
                        {tab.badge && tab.badge.count > 0 && (
                            <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full text-white text-[8px] flex items-center justify-center font-black" style={{ background: tab.badge.color || '#ef4444' }}>{tab.badge.count}</span>
                        )}
                    </button>
                )
            })}
        </div>
    )
}
