// src/app/(main)/inicio/sections/CanIhelp.tsx
'use client'

import Link from 'next/link'
import { ReactNode, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Car, Wrench, Megaphone, Sparkles, type LucideIcon } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { categorias, resolveCategoria, type Categoria } from '@/lib/categorias'
import { useNavProgressStore } from '@/store/useNavProgressStore'
import { HOME_GRADIENT } from './HomeSectionKit'
import { supabase } from '@/lib/supabase/client'

// ===== GRADIENTE FIXO LARANJA-VERMELHO =====
const GRADIENT = HOME_GRADIENT

interface CanIhelpProps {
    dragHandle?: ReactNode
}

// ===== Contagem de cliques por categoria, salva no navegador =====
const CLICKS_STORAGE_KEY = 'iuser-category-clicks'

function getClickCounts(): Record<string, number> {
    if (typeof window === 'undefined') return {}
    try {
        return JSON.parse(localStorage.getItem(CLICKS_STORAGE_KEY) || '{}')
    } catch {
        return {}
    }
}

function bumpClickCount(slug: string) {
    if (typeof window === 'undefined') return
    try {
        const counts = getClickCounts()
        counts[slug] = (counts[slug] || 0) + 1
        localStorage.setItem(CLICKS_STORAGE_KEY, JSON.stringify(counts))
    } catch {
        // localStorage indisponível (modo privado, etc.) - ignora
    }
}

// ===== Badges de contagem já dispensados, salvo no navegador =====
// Uma vez que a pessoa clica no número (já viu quantas lojas tem ali), o
// badge some daquela categoria pra sempre nesse aparelho — só serve pra
// chamar atenção na primeira vez.
const DISMISSED_BADGES_KEY = 'iuser-category-badges-dismissed'

function getDismissedBadges(): Set<string> {
    if (typeof window === 'undefined') return new Set()
    try {
        const raw = JSON.parse(localStorage.getItem(DISMISSED_BADGES_KEY) || '[]')
        return new Set(Array.isArray(raw) ? raw : [])
    } catch {
        return new Set()
    }
}

function dismissBadge(slug: string) {
    if (typeof window === 'undefined') return
    try {
        const dismissed = getDismissedBadges()
        dismissed.add(slug)
        localStorage.setItem(DISMISSED_BADGES_KEY, JSON.stringify(Array.from(dismissed)))
    } catch {
        // localStorage indisponível (modo privado, etc.) - ignora
    }
}

// ===== Ações em destaque: o que o app faz, além de navegar por categoria =====
interface FeaturedAction {
    label: string
    icon: LucideIcon
    onClick: () => void
}

export default function CanIhelp({ dragHandle }: CanIhelpProps) {
    const { colors } = useTheme()
    const router = useRouter()
    const { profileSlug } = useProfile()
    const startNavProgress = useNavProgressStore((s) => s.start)

    // Mesmas rotas já usadas em MotoristaSection/HireAService — "publicar"
    // sem perfil ainda manda pro login, igual lá.
    const featuredActions: FeaturedAction[] = [
        {
            label: 'Pedir motorista',
            icon: Car,
            onClick: () => { startNavProgress(); router.push('/pedir-motorista') },
        },
        {
            label: 'Solicitar serviço',
            icon: Wrench,
            onClick: () => { startNavProgress(); router.push('/solicitar-servico') },
        },
        {
            label: 'Publicar serviço',
            icon: Megaphone,
            onClick: () => { startNavProgress(); router.push(profileSlug ? '/meus-servicos' : '/login') },
        },
    ]

    // Ordem inicial = ordem padrão (evita divergência de hidratação); depois
    // do mount, reordena da categoria mais clicada pra menos clicada.
    const [orderedCategorias, setOrderedCategorias] = useState<Categoria[]>(categorias)

    useEffect(() => {
        const counts = getClickCounts()
        const sorted = [...categorias].sort(
            (a, b) => (counts[b.slug] || 0) - (counts[a.slug] || 0)
        )
        setOrderedCategorias(sorted)
    }, [])

    // ===== Contagem de lojas por categoria (badge) =====
    const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({})
    const [dismissedBadges, setDismissedBadges] = useState<Set<string>>(new Set())

    useEffect(() => {
        setDismissedBadges(getDismissedBadges())

        supabase
            .from('stores')
            .select('category')
            .eq('is_active', true)
            .then(({ data }) => {
                if (!data) return
                const counts: Record<string, number> = {}
                for (const row of data as { category: string | null }[]) {
                    // stores.category vem às vezes como slug, às vezes como nome de
                    // exibição - resolveCategoria() normaliza os dois pro mesmo slug
                    // canônico, senão metade das lojas nunca entrava na contagem.
                    const resolved = resolveCategoria(row.category)
                    if (!resolved) continue
                    counts[resolved.slug] = (counts[resolved.slug] || 0) + 1
                }
                setCategoryCounts((prev) => ({ ...prev, ...counts }))
            })

        // "Social" não é categoria de loja (nenhuma loja é salva com essa
        // categoria) - o badge dela conta gente, não loja: total de perfis
        // ativos na plataforma.
        supabase
            .from('profiles')
            .select('id', { count: 'exact', head: true })
            .eq('is_active', true)
            .then(({ count }) => {
                if (count == null) return
                setCategoryCounts((prev) => ({ ...prev, social: count }))
            })
    }, [])

    const handleDismissBadge = (e: React.MouseEvent, slug: string) => {
        e.preventDefault()
        e.stopPropagation()
        dismissBadge(slug)
        setDismissedBadges((prev) => new Set(prev).add(slug))
    }

    return (
        <section>
            {dragHandle && <div className="flex mb-2">{dragHandle}</div>}

            {/* Sem card em volta: os botões flutuam direto sobre o fundo da página */}
            <div>
                {/* Ações em destaque — os 3 principais "o que o app faz",
                    em cards cheios de cor (gradiente) pra se diferenciar
                    das categorias, que são só ícone/contorno abaixo. */}
                <div className="grid grid-cols-3 gap-2.5 mb-5">
                    {featuredActions.map((action) => {
                        const Icon = action.icon
                        return (
                            <button
                                key={action.label}
                                onClick={action.onClick}
                                className="flex flex-col items-center justify-center gap-2 py-4 px-2 rounded-2xl transition-all duration-200 hover:scale-105 active:scale-95"
                                style={{ background: GRADIENT, boxShadow: '0 4px 14px #f9731650' }}
                            >
                                <Icon size={22} color="#fff" strokeWidth={2} />
                                <span className="text-[11px] font-black text-center leading-tight text-white">
                                    {action.label}
                                </span>
                            </button>
                        )
                    })}
                </div>

                {/* Categorias, 4 por linha - a mais clicada fica primeiro */}
                <div className="grid grid-cols-4 gap-x-1 gap-y-3">
                    {orderedCategorias.map((cat) => {
                        const Icon = cat.icone
                        const iconColor = cat.color || '#f97316'

                        const href = cat.slug === 'social' ? '/social' : cat.slug === 'comunidades' ? '/comunidade' : `/lojas/${cat.slug}`

                        const count = categoryCounts[cat.slug] || 0
                        const showBadge = count > 0 && !dismissedBadges.has(cat.slug)

                        return (
                            <Link
                                key={cat.slug}
                                href={href}
                                onClick={() => {
                                    bumpClickCount(cat.slug)
                                    startNavProgress()
                                }}
                                className="relative flex flex-col items-center justify-start p-1.5 rounded-xl transition-all duration-200 hover:scale-105 active:scale-95 group min-w-0"
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                }}
                            >
                                <div className="relative">
                                    <div
                                        className="w-14 h-14 flex items-center justify-center rounded-full transition-all duration-200 group-hover:shadow-lg"
                                        style={{
                                            background: `${iconColor}20`,
                                            boxShadow: `0 6px 16px ${iconColor}30`,
                                        }}
                                    >
                                        <Icon
                                            className="w-7 h-7"
                                            style={{ color: iconColor }}
                                            strokeWidth={1.5}
                                        />
                                    </div>

                                    {showBadge && (
                                        <button
                                            onClick={(e) => handleDismissBadge(e, cat.slug)}
                                            className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full flex items-center justify-center gap-0.5 text-white text-[10px] font-black leading-none animate-badge-pop"
                                            style={{ background: GRADIENT, border: `2px solid ${colors.surface}` }}
                                            title="Marcar como visto"
                                        >
                                            {count}
                                        </button>
                                    )}
                                </div>
                                <span
                                    className="text-[10px] font-bold text-center leading-tight mt-2"
                                    style={{
                                        color: colors.textPrimary,
                                    }}
                                >
                                    {cat.nome}
                                </span>
                                <span
                                    className="text-[8px] font-medium text-center opacity-60 truncate w-full"
                                    style={{
                                        color: colors.textPrimary,
                                    }}
                                >
                                    {cat.desc}
                                </span>
                            </Link>
                        )
                    })}
                </div>
            </div>

            <style jsx>{`
                @keyframes badge-pop {
                    0% { transform: scale(0.6); opacity: 0; }
                    60% { transform: scale(1.15); opacity: 1; }
                    100% { transform: scale(1); opacity: 1; }
                }
                .animate-badge-pop {
                    animation: badge-pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
                }
            `}</style>
        </section>
    )
}
