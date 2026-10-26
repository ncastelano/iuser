// src/app/(main)/inicio/sections/CanIhelp.tsx
'use client'

import Link from 'next/link'
import { ReactNode, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Car, Wrench, Megaphone, ShoppingBag, Radar, CircleDollarSign, UserPlus, Home, Briefcase, type LucideIcon } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { categorias, resolveCategoria, type Categoria } from '@/lib/categorias'
import { useNavProgressStore } from '@/store/useNavProgressStore'
import { HOME_GRADIENT } from './HomeSectionKit'
import { supabase } from '@/lib/supabase/client'
import InviteChoiceDialog from '@/components/InviteChoiceDialog'

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
    /** frase curta (só nos atalhos de "Preciso de") */
    desc?: string
    /** cor do ícone (a mesma de cada tipo na 3.0) */
    color: string
}

// As comunidades têm a própria seção na home (abaixo das publicações): saem do grid de categorias
const GRID_CATEGORIAS = categorias.filter((c) => c.slug !== 'comunidades')

export default function CanIhelp({ dragHandle }: CanIhelpProps) {
    const { colors } = useTheme()
    const router = useRouter()
    const { profileSlug } = useProfile()
    const startNavProgress = useNavProgressStore((s) => s.start)

    // Os mesmos atalhos da página inicial da 3.0, em dois blocos: quem PRECISA e quem quer GANHAR.
    // "publicar/vender" sem perfil ainda manda pro login/cadastro, igual em MotoristaSection/OfferAService.
    const [inviteChoiceOpen, setInviteChoiceOpen] = useState(false)
    const go = (path: string) => { startNavProgress(); router.push(path) }
    const needActions: FeaturedAction[] = [
        { label: 'Comprar', desc: 'Lojas e produtos perto de você', color: '#2563eb', icon: ShoppingBag, onClick: () => go('/lojas') },
        { label: 'Contratar serviço', desc: 'Descreva o que você precisa', color: '#7c3aed', icon: Wrench, onClick: () => go('/solicitar-servico') },
        { label: 'Pedir motorista', desc: 'Corrida rápida, preço combinado', color: '#ea580c', icon: Car, onClick: () => go('/pedir-motorista') },
        { label: 'Ver ao redor', desc: 'Mapa com lojas, serviços e pessoas', color: '#0891b2', icon: Radar, onClick: () => go('/radar') },
        // As páginas de imóveis abrem na casca da 3.0 mesmo para quem está na 2.0 (não têm versão própria); os imóveis em si aparecem na seção "Imóveis para alugar"
        { label: 'Buscar imóvel', desc: 'Casa, apartamento, salas comerciais, kitnets, etc.', color: '#16a34a', icon: Home, onClick: () => go('/imoveis') },
    ]
    const earnActions: FeaturedAction[] = [
        { label: 'Vender', color: '#16a34a', icon: CircleDollarSign, onClick: () => go(profileSlug ? '/criar-loja' : '/criar-loja-com-cadastro') },
        { label: 'Publicar serviço', color: '#7c3aed', icon: Megaphone, onClick: () => go(profileSlug ? '/meus-servicos' : '/login') },
        // Pedidos de serviço das pessoas: quem vem de fora vê o que estão procurando e se inscreve para fazer e ganhar
        { label: 'Fazer serviços', color: '#ea580c', icon: Briefcase, onClick: () => go('/procurar-servico') },
        { label: 'Anunciar imóvel', color: '#16a34a', icon: Home, onClick: () => go(profileSlug ? '/anunciar-imovel' : '/login') },
        { label: 'Ser motorista', color: '#ea580c', icon: Car, onClick: () => go('/painel-motorista') },
        { label: 'Indicar e ganhar', color: '#db2777', icon: UserPlus, onClick: () => (profileSlug ? setInviteChoiceOpen(true) : go('/login')) },
    ]

    // Ordem inicial = ordem padrão (evita divergência de hidratação); depois
    // do mount, reordena da categoria mais clicada pra menos clicada.
    const [orderedCategorias, setOrderedCategorias] = useState<Categoria[]>(GRID_CATEGORIAS)

    useEffect(() => {
        const counts = getClickCounts()
        const sorted = [...GRID_CATEGORIAS].sort(
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
            <InviteChoiceDialog open={inviteChoiceOpen} onClose={() => setInviteChoiceOpen(false)} />
            {dragHandle && <div className="flex mb-2">{dragHandle}</div>}

            {/* Sem card em volta: os botões flutuam direto sobre o fundo da página */}
            <div>
                {/* O que o app faz, em dois níveis (como na 3.0): o que a pessoa PRECISA, em cartões maiores com uma frase,
                    e o que ela pode GANHAR, numa faixa compacta logo abaixo. As categorias vêm depois. */}
                <p className="text-[11px] font-black uppercase tracking-wider mb-2 px-0.5" style={{ color: colors.textSecondary }}>O que você precisa?</p>
                <div className="grid grid-cols-2 gap-2.5 mb-4">
                    {needActions.map((action, i) => {
                        const Icon = action.icon
                        // Sobrou um atalho sozinho na última linha: ele ocupa a linha inteira (ícone ao lado do texto), como na 3.0
                        const lonely = needActions.length % 2 === 1 && i === needActions.length - 1
                        return (
                            <button
                                key={action.label}
                                onClick={action.onClick}
                                className={`flex ${lonely ? 'col-span-2 flex-row items-center gap-3.5' : 'flex-col items-start gap-2.5'} p-3.5 rounded-3xl text-left transition-all duration-200 hover:scale-[1.02] active:scale-95 min-w-0`}
                                style={{ background: colors.surface, border: `1px solid ${colors.border}`, boxShadow: `0 6px 18px ${action.color}18` }}
                            >
                                <span className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: `${action.color}1c`, color: action.color }}>
                                    <Icon size={22} strokeWidth={2.2} />
                                </span>
                                <span className="min-w-0 w-full">
                                    <span className="block text-[14px] font-black leading-tight" style={{ color: colors.textPrimary }}>{action.label}</span>
                                    <span className="block text-[11px] leading-snug mt-0.5" style={{ color: colors.textSecondary }}>{action.desc}</span>
                                </span>
                            </button>
                        )
                    })}
                </div>

                {/* Mesmo cartão dos atalhos de cima; o título é um selo pendurado na borda, como o "Seu plano" */}
                <div className="relative rounded-3xl p-3 pt-5 mt-5 mb-5" style={{ background: colors.surface, border: `1px solid ${colors.border}`, boxShadow: colors.shadow }}>
                    <span
                        className="absolute -top-2.5 left-1/2 -translate-x-1/2 flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-3 py-1 rounded-full text-white whitespace-nowrap"
                        style={{ background: '#111827' }}
                    >
                        <CircleDollarSign size={10} /> Quer ganhar com o iUser?
                    </span>
                    <div className="grid grid-cols-3 gap-x-1 gap-y-2">
                        {earnActions.map((action) => {
                            const Icon = action.icon
                            return (
                                <button
                                    key={action.label}
                                    onClick={action.onClick}
                                    className="flex flex-col items-center gap-1.5 py-1.5 rounded-2xl transition active:scale-95 min-w-0"
                                >
                                    <span className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: colors.surface, color: action.color, boxShadow: `0 4px 12px ${action.color}30` }}>
                                        <Icon size={20} strokeWidth={2.2} />
                                    </span>
                                    <span className="text-[10px] font-black text-center leading-tight" style={{ color: colors.textPrimary }}>{action.label}</span>
                                </button>
                            )
                        })}
                    </div>
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
