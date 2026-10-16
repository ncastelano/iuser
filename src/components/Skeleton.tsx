// src/components/Skeleton.tsx
//
// Blocos de "esqueleto" pra telas que carregam: a página aparece já com a forma do que vai chegar (abas, cartões,
// linhas) e o brilho passa por cima até os dados entrarem — em vez de um "Carregando..." no meio do nada.
'use client'

import type { CSSProperties, ReactNode } from 'react'
import { useTheme } from '@/app/contexts/theme'

/** Um bloco com o brilho passando. Defina o tamanho/forma por className ou style. */
export function Shimmer({ className = '', style, color }: { className?: string; style?: CSSProperties; color?: string }) {
    const { colors } = useTheme()
    // o cinza da borda do tema (visível no claro e no escuro); o brilho é o mesmo cinza mais cheio.
    // Com `color` (hex) o bloco ganha a cor da coisa que vai chegar (ex.: o azul dos pedidos novos).
    const base = color ? `${color}2e` : `${colors.border}b3`
    const glow = color ? `${color}55` : colors.border
    return (
        <span
            aria-hidden
            className={`iuser-shimmer block ${className}`}
            style={{ backgroundImage: `linear-gradient(90deg, ${base} 0%, ${glow} 45%, ${base} 90%)`, backgroundSize: '220% 100%', ...style }}
        />
    )
}

/** Região que avisa leitores de tela que está carregando (o esqueleto em si é decorativo). */
export function SkeletonRegion({ label, className = '', children }: { label: string; className?: string; children: ReactNode }) {
    return (
        <div role="status" aria-busy="true" aria-label={label} className={`iuser-skeleton-in ${className}`}>
            {children}
        </div>
    )
}
