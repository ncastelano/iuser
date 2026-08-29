// src/components/LastSearched.tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Clock, X } from 'lucide-react'
import { useTheme } from '@/app/theme'

// ---------- Tipos e funções do histórico ----------
export interface RecentClickItem {
    type: 'profile' | 'store' | 'product'
    id: string
    name: string
    imageUrl: string | null
    url: string
    timestamp?: number // timestamp do clique
}

const STORAGE_KEY = 'recent_clicks_v1'
const MAX_ITEMS = 20 // Aumentado para 20

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
}
// --------------------------------------------------

export default function LastSearched({ onItemClick }: LastSearchedProps) {
    const router = useRouter()
    const { colors } = useTheme()
    const [items, setItems] = useState<RecentClickItem[]>([])
    const containerRef = useRef<HTMLDivElement>(null)
    const titleRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        setItems(getRecentClicks())
    }, [])

    // Scroll para que o título fique visível no final da tela
    useEffect(() => {
        if (items.length > 0 && titleRef.current) {
            setTimeout(() => {
                titleRef.current?.scrollIntoView({
                    block: 'end',
                    behavior: 'auto'
                })
            }, 100)
        }
    }, [items])

    const removeItem = (item: RecentClickItem) => {
        const updated = items.filter(
            i => !(i.type === item.type && i.id === item.id)
        )
        setItems(updated)
        saveRecentClicks(updated)
    }

    const clearAll = () => {
        setItems([])
        saveRecentClicks([])
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
            case 'profile':
                return 'Perfil'
            case 'store':
                return 'Loja'
            case 'product':
                return 'Produto'
            default:
                return ''
        }
    }

    const getTypeColor = (type: string) => {
        switch (type) {
            case 'profile':
                return '#3b82f6'
            case 'store':
                return '#f97316'
            case 'product':
                return '#8b5cf6'
            default:
                return colors.textSecondary
        }
    }

    const hexToRgb = (hex: string) => {
        const clean = hex.replace('#', '')
        const num = parseInt(clean, 16)
        return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 }
    }
    const surfaceRgb = hexToRgb(colors.surface)
    const cardBg = `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`

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

    const formatFullDate = (timestamp?: number) => {
        if (!timestamp) return ''
        const date = new Date(timestamp)
        return date.toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        })
    }

    // Agrupar itens por data
    const groupedItems = items.reduce((groups, item) => {
        const label = getDateLabel(item.timestamp)
        if (!groups[label]) groups[label] = []
        groups[label].push(item)
        return groups
    }, {} as Record<string, RecentClickItem[]>)

    // Ordenar grupos: Hoje primeiro, depois Ontem, depois os mais antigos (do mais recente para o mais antigo)
    const sortedGroups = Object.keys(groupedItems).sort((a, b) => {
        if (a === 'Hoje') return -1
        if (b === 'Hoje') return 1
        if (a === 'Ontem') return -1
        if (b === 'Ontem') return 1
        return a.localeCompare(b)
    })

    // Altura do botão de busca (56px) + padding extra para não ficar colado
    const SEARCH_BUTTON_HEIGHT = 80

    return (
        <div ref={containerRef} className="flex flex-col-reverse mb-6">
            {/* Título - vem primeiro no DOM (mas visualmente embaixo) */}
            <div ref={titleRef} className="flex items-center justify-between mt-2 px-1">
                <div className="flex items-center gap-2">
                    <Clock size={14} style={{ color: colors.accent }} />
                    <h3
                        className="text-xs font-bold uppercase tracking-wide"
                        style={{ color: colors.textPrimary }}
                    >
                        Últimos acessados
                    </h3>
                    <span className="text-[9px] font-bold opacity-50" style={{ color: colors.textSecondary }}>
                        ({items.length})
                    </span>
                </div>
                <button
                    onClick={clearAll}
                    className="text-[10px] font-semibold hover:underline"
                    style={{ color: colors.textSecondary }}
                >
                    Limpar tudo
                </button>
            </div>

            {/* Lista - ordem: Hoje (primeiro/embaixo), Ontem, Mais antigos (último/topo) */}
            {sortedGroups.map((groupLabel) => (
                <div key={groupLabel} className="mb-3 last:mb-0">
                    {/* Cabeçalho do grupo */}
                    <div className="flex items-center gap-2 mb-1.5 px-1">
                        <span className="text-[9px] font-bold uppercase tracking-wider opacity-50" style={{ color: colors.textSecondary }}>
                            {groupLabel}
                        </span>
                        <div className="flex-1 h-px" style={{ background: colors.border }} />
                    </div>

                    <div className="space-y-1.5">
                        {groupedItems[groupLabel].map((item) => (
                            <div
                                key={`${item.type}-${item.id}`}
                                className="rounded-xl border overflow-hidden transition-all hover:shadow-md cursor-pointer"
                                style={{
                                    background: cardBg,
                                    backdropFilter: 'blur(12px)',
                                    borderColor: colors.border,
                                    boxShadow: colors.shadow
                                }}
                                onClick={() => handleItemClick(item)}
                            >
                                <div className="flex items-center gap-3 p-2">
                                    {/* Imagem - mini */}
                                    <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0" style={{ background: colors.accentLight }}>
                                        {item.imageUrl ? (
                                            <img
                                                src={item.imageUrl}
                                                alt={item.name}
                                                className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center" style={{ background: GRADIENT }}>
                                                <span className="text-xs font-black text-white/70">
                                                    {item.name.charAt(0).toUpperCase()}
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Informações */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <h3 className="text-xs font-bold truncate" style={{ color: colors.textPrimary }}>
                                                {item.name}
                                            </h3>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span
                                                className="text-[8px] font-bold"
                                                style={{ color: getTypeColor(item.type) }}
                                            >
                                                {getTypeLabel(item.type)}
                                            </span>
                                            <span className="text-[8px] opacity-40" style={{ color: colors.textSecondary }}>
                                                •
                                            </span>
                                            <span className="text-[8px] opacity-50" style={{ color: colors.textSecondary }}>
                                                {formatFullDate(item.timestamp)} {formatTime(item.timestamp)}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Botão de remover */}
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            removeItem(item)
                                        }}
                                        className="p-1 rounded-full hover:bg-black/10 transition-colors flex-shrink-0"
                                        style={{ color: colors.textSecondary }}
                                        title="Remover"
                                    >
                                        <X size={12} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ))}

            {/* Espaço extra do tamanho do botão de busca + margem */}
            <div style={{ height: SEARCH_BUTTON_HEIGHT }} />
        </div>
    )
}