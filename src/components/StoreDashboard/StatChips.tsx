// src/components/StoreDashboard/StatChips.tsx
//
// Os números de um cartão do painel (pedidos novos/preparando/prontos/finalizados, agenda hoje/na agenda/feitos) em CHIPS pequenos, numa linha só:
// o destaque do cartão é o próprio pedido ou agendamento (a lista), não o número.
'use client'

import { useTheme } from '@/app/contexts/theme'

export default function StatChips({ items, onClick }: { items: { label: string; n: number; color: string }[]; onClick?: () => void }) {
    const { colors } = useTheme()
    return (
        <div className="flex flex-wrap items-center gap-1.5 relative z-10">
            {items.map((t) => (
                <button
                    key={t.label}
                    type="button"
                    onClick={onClick}
                    className="h-7 px-2.5 rounded-full flex items-center gap-1.5 flex-shrink-0 text-[11px] font-black transition active:scale-95"
                    style={{ background: `${t.color}${t.n > 0 ? '1f' : '10'}`, border: `1px solid ${t.color}${t.n > 0 ? '40' : '20'}`, color: t.n > 0 ? t.color : colors.textSecondary }}
                >
                    <span className="tabular-nums">{t.n}</span>
                    <span className="font-bold">{t.label}</span>
                </button>
            ))}
        </div>
    )
}
