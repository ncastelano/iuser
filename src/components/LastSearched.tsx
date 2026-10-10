// src/components/LastSearched.tsx
'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Clock, X, History, User, Store, Package, Search, Car, MapPin, Flag, ChevronRight } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import MiniEntityCard from '@/components/MiniEntityCard'
import { trackProfileVisit } from '@/lib/trackProfileVisit'
import ListingRowCard from '@/components/ListingRowCard'
import { supabase } from '@/lib/supabase/client'

// ---------- Tipos e funções do histórico ----------
export interface RecentClickItem {
    // 'ride' não é conteúdo visitado, é uma ação que a pessoa fez no app
    // (pediu uma corrida) — mesmo mecanismo de "últimos acessados", só que
    // vira um atalho pra retomar/acompanhar o que ela pediu, não pra ver
    // um perfil/loja/produto de novo.
    type: 'profile' | 'store' | 'product' | 'ride'
    id: string
    name: string
    imageUrl: string | null
    url: string
    timestamp?: number // timestamp do clique
    storeName?: string // Nome da loja para produtos
    storeImage?: string | null // Imagem da loja para produtos
    price?: number // Preço para produtos
}

const STORAGE_KEY = 'recent_clicks_v1'
const MAX_ITEMS = 20

export function getRecentClicks(): RecentClickItem[] {
    if (typeof window === 'undefined') return []
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        return raw ? JSON.parse(raw) : []
    } catch {
        return []
    }
}

function saveRecentClicks(items: RecentClickItem[]) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)))
    } catch { }
}

export function addRecentClick(item: RecentClickItem) {
    const current = getRecentClicks()
    const filtered = current.filter(i => !(i.type === item.type && i.id === item.id))
    const updated = [{ ...item, timestamp: Date.now() }, ...filtered]
    saveRecentClicks(updated)
}

interface LastSearchedProps {
    onItemClick?: (item: RecentClickItem) => void
    onClearResults?: () => void
}

export default function LastSearched({ onItemClick, onClearResults }: LastSearchedProps) {
    const router = useRouter()
    const { colors } = useTheme()
    const { userId: viewerId } = useProfile()
    const [items, setItems] = useState<RecentClickItem[]>([])
    const [visibleItems, setVisibleItems] = useState<Set<string>>(new Set())
    const containerRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        setItems(getRecentClicks())
    }, [])

    // Cada tipo tem o seu cartão: perfil e loja = cartão pequeno, produto = linha de vitrine, corrida = horizontal
    const rideIds = useMemo(() => items.filter((i) => i.type === 'ride').map((i) => i.id), [items])
    const [rideStatus, setRideStatus] = useState<Record<string, string>>({})

    useEffect(() => {
        if (rideIds.length === 0) { setRideStatus({}); return }
        let cancelled = false
        supabase.from('ride_requests').select('id, status').in('id', rideIds).then(({ data }) => {
            if (!cancelled) setRideStatus(Object.fromEntries(((data as { id: string; status: string }[]) || []).map((r) => [r.id, r.status])))
        })
        return () => { cancelled = true }
    }, [rideIds])

    // Efeito de entrada cascata
    useEffect(() => {
        if (items.length === 0) return

        setVisibleItems(new Set())

        const allKeys = items.map(item => `${item.type}-${item.id}`)
        allKeys.forEach((key, index) => {
            setTimeout(() => {
                setVisibleItems(prev => new Set(prev).add(key))
            }, 80 + index * 50)
        })

        return () => {
            setVisibleItems(new Set())
        }
    }, [items])

    const removeItem = (item: RecentClickItem, e: React.MouseEvent) => {
        e.stopPropagation()
        // O botão clicado é removido do DOM junto com o item - sem o foco ir
        // pra um elemento estável (o container) antes disso, a página some
        // do foco (activeElement cai pro body) e a página acha que a pessoa
        // saiu da busca, fechando a seção inteira. Focar o container aqui
        // mantém a seção aberta pra continuar removendo outros itens.
        containerRef.current?.focus()
        const updated = items.filter(i => !(i.type === item.type && i.id === item.id))
        setItems(updated)
        saveRecentClicks(updated)
    }

    const clearAll = () => {
        setItems([])
        saveRecentClicks([])
        if (onClearResults) {
            onClearResults()
        }
    }

    const handleItemClick = (item: RecentClickItem) => {
        if (onItemClick) {
            onItemClick(item)
        } else {
            const urlPath = item.url.startsWith('/') ? item.url.slice(1) : item.url
            router.push(`/${urlPath}`)
        }
    }

    if (items.length === 0) return null

    const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

    const getTypeLabel = (type: string) => {
        switch (type) {
            case 'profile': return 'Perfil'
            case 'store': return 'Loja'
            case 'product': return 'Produto'
            case 'ride': return 'Corrida'
            default: return ''
        }
    }

    const getTypeColor = (type: string) => {
        switch (type) {
            case 'profile': return '#3b82f6'
            case 'store': return '#f97316'
            case 'product': return '#8b5cf6'
            case 'ride': return '#dc2626'
            default: return colors.textPrimary
        }
    }

    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'profile': return User
            case 'store': return Store
            case 'product': return Package
            case 'ride': return Car
            default: return Clock
        }
    }

    const getDateLabel = (timestamp?: number) => {
        if (!timestamp) return 'Hoje'
        const date = new Date(timestamp)
        const now = new Date()
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        const yesterday = new Date(today.getTime() - 86400000)
        const itemDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())

        if (itemDate.getTime() === today.getTime()) return 'Hoje'
        if (itemDate.getTime() === yesterday.getTime()) return 'Ontem'

        const diffDays = Math.floor((today.getTime() - itemDate.getTime()) / 86400000)
        if (diffDays < 7) return `${diffDays} dias atrás`
        if (diffDays < 14) return 'Semana passada'
        if (diffDays < 30) return `${Math.floor(diffDays / 7)} semanas atrás`
        return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
    }

    const formatTime = (timestamp?: number) => {
        if (!timestamp) return ''
        const date = new Date(timestamp)
        return date.toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        })
    }

    const groupedItems = items.reduce((groups, item) => {
        const label = getDateLabel(item.timestamp)
        if (!groups[label]) groups[label] = []
        groups[label].push(item)
        return groups
    }, {} as Record<string, RecentClickItem[]>)

    const sortedGroups = Object.keys(groupedItems).sort((a, b) => {
        if (a === 'Hoje') return -1
        if (b === 'Hoje') return 1
        if (a === 'Ontem') return -1
        if (b === 'Ontem') return 1
        return a.localeCompare(b)
    })

    const getDisplayText = (item: RecentClickItem) => {
        if (item.type === 'product' && !item.imageUrl) {
            return item.price != null ? `R$\n${item.price.toFixed(2)}` : '?'
        }
        return item.name?.charAt(0).toUpperCase() || '?'
    }

    const getDisplayName = (item: RecentClickItem) => {
        if (item.type === 'product' && !item.name) {
            return item.price ? `R$ ${item.price.toFixed(2)}` : 'Produto'
        }
        return item.name || 'Sem nome'
    }

    return (
        <div ref={containerRef} tabIndex={-1} className="w-full outline-none">
            {/* Cabeçalho com botão de limpar resultados */}
            <div
                className="flex items-center justify-between px-2 py-3 transition-all duration-500 ease-out"
                style={{
                    opacity: 1,
                    transform: 'translateY(0)',
                }}
            >
                <div className="flex items-center gap-2">
                    <div
                        className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ background: GRADIENT }}
                    >
                        <History size={16} className="text-white" />
                    </div>
                    <div>
                        <h3
                            className="text-sm font-bold"
                            style={{ color: colors.textPrimary }}
                        >
                            Últimos acessados
                        </h3>
                        <span
                            className="text-[10px] font-medium opacity-60"
                            style={{ color: colors.textPrimary }}
                        >
                            {items.length} {items.length === 1 ? 'item' : 'itens'}
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {items.length > 0 && (
                        <button
                            onClick={clearAll}
                            className="text-[10px] font-semibold px-2.5 py-1 rounded-full transition-all hover:opacity-70 flex-shrink-0"
                            style={{
                                color: colors.textPrimary,
                                background: `${colors.textPrimary}15`
                            }}
                        >
                            Limpar histórico
                        </button>
                    )}

                </div>
            </div>

            {/* Lista de itens em grid */}
            <div className="space-y-4">
                {sortedGroups.map((groupLabel, groupIndex) => (
                    <div key={groupLabel}>
                        <div
                            className="flex items-center gap-2 px-2 mb-2 transition-all duration-500 ease-out"
                            style={{
                                opacity: 1,
                                transform: 'translateY(0)',
                                transitionDelay: `${groupIndex * 100}ms`,
                            }}
                        >
                            <span
                                className="text-[9px] font-bold uppercase tracking-wider opacity-50 flex-shrink-0"
                                style={{ color: colors.textPrimary }}
                            >
                                {groupLabel}
                            </span>
                            <div
                                className="flex-1 h-px"
                                style={{ background: colors.border }}
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-stretch">
                            {groupedItems[groupLabel].map((item, index) => {
                                const key = `${item.type}-${item.id}`
                                const isVisible = visibleItems.has(key)
                                const open = () => handleItemClick(item)
                                const price = item.price != null && item.price > 0 ? `R$ ${item.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : null
                                const rideState = rideStatus[item.id]
                                const rideParts = (item.name || '').split('→').map((t) => t.trim())
                                const rideStatusLabel = rideState === 'pending' ? 'Procurando motorista' : rideState === 'accepted' ? 'Em andamento' : rideState === 'completed' || rideState === 'finished' ? 'Finalizada' : rideState === 'cancelled' || rideState === 'canceled' ? 'Cancelada' : null

                                let card: React.ReactNode = null
                                if (item.type === 'profile' || item.type === 'store') {
                                    // Perfil e loja: só foto, nome e @ (cartão pequeno)
                                    const slug = item.url.replace(/^\//, '').split('/')[0] || null
                                    card = (
                                        <MiniEntityCard
                                            kind={item.type}
                                            name={item.name}
                                            slug={slug}
                                            imageUrl={item.imageUrl}
                                            profileId={item.type === 'profile' ? item.id : null}
                                            colors={colors}
                                            onClick={open}
                                            onHover={item.type === 'profile' ? () => { trackProfileVisit(item.id, viewerId) } : undefined}
                                        />
                                    )
                                } else if (item.type === 'product') {
                                    card = (
                                        <ListingRowCard
                                            title={item.name || 'Produto'}
                                            imageUrl={item.imageUrl}
                                            fallbackIcon={<Package size={30} />}
                                            priceLabel={price}
                                            sellerName={item.storeName || 'Loja'}
                                            sellerImageUrl={item.storeImage}
                                            tag="Produto"
                                            onClick={open}
                                        />
                                    )
                                } else if (item.type === 'ride') {
                                    // Corrida pedida: cartão horizontal com o trajeto e a situação
                                    card = (
                                        <div
                                            onClick={open}
                                            className="w-full flex items-stretch rounded-3xl overflow-hidden border cursor-pointer transition-all hover:shadow-xl hover:-translate-y-0.5"
                                            style={{ background: colors.surface, borderColor: colors.border, boxShadow: colors.shadow }}
                                        >
                                            <span className="w-20 flex-shrink-0 flex items-center justify-center text-white" style={{ background: GRADIENT }}>
                                                <Car size={30} strokeWidth={1.8} />
                                            </span>
                                            <div className="flex-1 min-w-0 px-3 py-3 flex flex-col gap-1.5 justify-center">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="text-[11px] font-black uppercase tracking-wider" style={{ color: '#dc2626' }}>Corrida</span>
                                                    {rideStatusLabel && (
                                                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full" style={{ background: '#f9731620', color: '#ea580c' }}>{rideStatusLabel}</span>
                                                    )}
                                                    <span className="text-[10px] ml-auto" style={{ color: colors.textSecondary }}>{formatTime(item.timestamp)}</span>
                                                </div>
                                                <p className="flex items-start gap-1.5 text-xs font-semibold leading-snug" style={{ color: colors.textPrimary }}>
                                                    <MapPin size={13} className="flex-shrink-0 mt-0.5" style={{ color: '#16a34a' }} />
                                                    <span className="line-clamp-2">{rideParts[0] || 'Origem'}</span>
                                                </p>
                                                {rideParts[1] && (
                                                    <p className="flex items-start gap-1.5 text-xs font-semibold leading-snug" style={{ color: colors.textPrimary }}>
                                                        <Flag size={13} className="flex-shrink-0 mt-0.5" style={{ color: '#dc2626' }} />
                                                        <span className="line-clamp-2">{rideParts[1]}</span>
                                                    </p>
                                                )}
                                            </div>
                                            <ChevronRight size={18} className="self-center mr-2 flex-shrink-0 opacity-50" style={{ color: colors.textPrimary }} />
                                        </div>
                                    )
                                }
                                if (!card) return null

                                return (
                                    <div
                                        key={key}
                                        className="relative transition-all duration-500 ease-out"
                                        style={{
                                            opacity: isVisible ? 1 : 0,
                                            transform: isVisible ? 'translateY(0)' : 'translateY(16px)',
                                            transitionDelay: `${Math.min(index, 8) * 50}ms`,
                                        }}
                                    >
                                        {card}
                                        {/* Remover só esse item do histórico */}
                                        <button
                                            onClick={(e) => { e.stopPropagation(); removeItem(item, e) }}
                                            className={`absolute z-20 w-7 h-7 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95 ${item.type === 'store' ? 'top-2 left-2' : item.type === 'ride' ? 'bottom-2 right-2' : 'top-2 right-2'}`}
                                            style={{ background: '#ef4444', color: '#ffffff', boxShadow: '0 2px 6px rgba(0,0,0,0.4)' }}
                                            title="Remover"
                                            aria-label="Remover do histórico"
                                        >
                                            <X size={14} />
                                        </button>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                ))}
            </div>

            <style jsx global>{`
                @keyframes fadeInUp {
                    from {
                        opacity: 0;
                        transform: translateY(20px) scale(0.95);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0) scale(1);
                    }
                }
            `}</style>
        </div>
    )
}