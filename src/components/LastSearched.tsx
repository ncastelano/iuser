// src/components/LastSearched.tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Clock, X, History, User, Store, Package } from 'lucide-react'
import { useTheme } from '@/app/theme'

// ---------- Tipos e funções do histórico ----------
export interface RecentClickItem {
    type: 'profile' | 'store' | 'product'
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
}

export default function LastSearched({ onItemClick }: LastSearchedProps) {
    const router = useRouter()
    const { colors } = useTheme()
    const [items, setItems] = useState<RecentClickItem[]>([])
    const containerRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        setItems(getRecentClicks())
    }, [])

    const removeItem = (item: RecentClickItem, e: React.MouseEvent) => {
        e.stopPropagation()
        const updated = items.filter(i => !(i.type === item.type && i.id === item.id))
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
            case 'profile': return 'Perfil'
            case 'store': return 'Loja'
            case 'product': return 'Produto'
            default: return ''
        }
    }

    const getTypeColor = (type: string) => {
        switch (type) {
            case 'profile': return '#3b82f6'
            case 'store': return '#f97316'
            case 'product': return '#8b5cf6'
            default: return colors.textSecondary
        }
    }

    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'profile': return User
            case 'store': return Store
            case 'product': return Package
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

    // Função para obter a inicial ou o valor
    const getDisplayText = (item: RecentClickItem) => {
        // Para produto sem imagem, mostra o preço formatado no placeholder
        if (item.type === 'product' && !item.imageUrl) {
            return item.price != null ? `R$\n${item.price.toFixed(2)}` : '?'
        }
        return item.name?.charAt(0).toUpperCase() || '?'
    }

    // Função para obter o nome a ser exibido
    const getDisplayName = (item: RecentClickItem) => {
        if (item.type === 'product' && !item.name) {
            return item.price ? `R$ ${item.price.toFixed(2)}` : 'Produto'
        }
        return item.name || 'Sem nome'
    }

    return (
        <div ref={containerRef} className="w-full">
            {/* Cabeçalho */}
            <div className="flex items-center justify-between px-2 py-3">
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
                            style={{ color: colors.textSecondary }}
                        >
                            {items.length} {items.length === 1 ? 'item' : 'itens'}
                        </span>
                    </div>
                </div>
                {items.length > 0 && (
                    <button
                        onClick={clearAll}
                        className="text-[10px] font-semibold px-2.5 py-1 rounded-full transition-all hover:opacity-70 flex-shrink-0"
                        style={{
                            color: colors.textSecondary,
                            background: `${colors.textSecondary}15`
                        }}
                    >
                        Limpar tudo
                    </button>
                )}
            </div>

            {/* Lista de itens em grid */}
            <div className="space-y-4">
                {sortedGroups.map((groupLabel) => (
                    <div key={groupLabel}>
                        {/* Separador do grupo */}
                        <div className="flex items-center gap-2 px-2 mb-2">
                            <span
                                className="text-[9px] font-bold uppercase tracking-wider opacity-50 flex-shrink-0"
                                style={{ color: colors.textSecondary }}
                            >
                                {groupLabel}
                            </span>
                            <div
                                className="flex-1 h-px"
                                style={{ background: colors.border }}
                            />
                        </div>

                        {/* Grid de cards quadrados */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                            {groupedItems[groupLabel].map((item) => {
                                const TypeIcon = getTypeIcon(item.type)
                                const typeColor = getTypeColor(item.type)

                                return (
                                    <div
                                        key={`${item.type}-${item.id}`}
                                        onClick={() => handleItemClick(item)}
                                        className="group relative block overflow-hidden rounded-xl aspect-square cursor-pointer"
                                    >
                                        {/* Imagem de fundo */}
                                        <div className="w-full h-full relative">
                                            {item.imageUrl ? (
                                                <img
                                                    src={item.imageUrl}
                                                    alt={item.name || 'Item'}
                                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                                />
                                            ) : (
                                                <div className="w-full h-full flex flex-col items-center justify-center gap-1" style={{ background: GRADIENT }}>
                                                    {item.type === 'product' && item.price != null ? (
                                                        // Produto sem imagem → mostra o preço
                                                        <>
                                                            <span className="text-[9px] font-bold text-white/60 uppercase tracking-wider">R$</span>
                                                            <span className="text-xl font-black text-white leading-none">
                                                                {item.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                            </span>
                                                        </>
                                                    ) : (
                                                        <span className="text-4xl font-black text-white/70">
                                                            {getDisplayText(item)}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {/* Overlay gradiente */}
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none" />

                                        {/* Loja (avatar + nome) no canto superior esquerdo — apenas para produtos */}
                                        {item.type === 'product' && (item.storeName || item.storeImage) && (
                                            <div className="absolute top-2 left-2 flex items-center gap-1 max-w-[70%] pointer-events-none">
                                                <div
                                                    className="w-5 h-5 rounded-md overflow-hidden flex-shrink-0 shadow-md"
                                                    style={{
                                                        border: '1.5px solid rgba(255,255,255,0.35)',
                                                        background: 'rgba(0,0,0,0.4)'
                                                    }}
                                                >
                                                    {item.storeImage ? (
                                                        <img
                                                            src={item.storeImage}
                                                            alt={item.storeName || 'Loja'}
                                                            className="w-full h-full object-cover"
                                                        />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center">
                                                            <Store size={10} className="text-white/70" />
                                                        </div>
                                                    )}
                                                </div>
                                                {item.storeName && (
                                                    <span
                                                        className="text-[8px] font-semibold text-white/80 truncate"
                                                        style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}
                                                    >
                                                        {item.storeName}
                                                    </span>
                                                )}
                                            </div>
                                        )}

                                        {/* Badge do tipo no canto superior direito */}
                                        <div
                                            className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wider pointer-events-none flex items-center gap-1"
                                            style={{
                                                background: `${typeColor}dd`,
                                                color: '#ffffff',
                                                backdropFilter: 'blur(4px)',
                                                border: '1px solid rgba(255,255,255,0.2)'
                                            }}
                                        >
                                            <TypeIcon size={10} />
                                            {getTypeLabel(item.type)}
                                        </div>

                                        {/* Botão de remover - aparece no hover */}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                removeItem(item, e)
                                            }}
                                            className="absolute top-8 left-2 p-1.5 rounded-lg transition-all opacity-0 group-hover:opacity-100 hover:bg-black/30 pointer-events-auto"
                                            style={{ color: '#ffffff' }}
                                            title="Remover"
                                        >
                                            <X size={14} />
                                        </button>

                                        {/* Informações na parte inferior */}
                                        <div className="absolute bottom-0 left-0 right-0 p-2.5 pointer-events-none">
                                            <h4 className="text-sm font-bold truncate text-white">
                                                {getDisplayName(item)}
                                            </h4>
                                            <div className="flex flex-col gap-0.5 mt-0.5">
                                                {/* Preço em destaque para produtos */}
                                                {item.type === 'product' && item.price != null && (
                                                    <div
                                                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md self-start"
                                                        style={{
                                                            background: 'rgba(249,115,22,0.85)',
                                                            backdropFilter: 'blur(4px)'
                                                        }}
                                                    >
                                                        <span className="text-[11px] font-black text-white">
                                                            R$ {item.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                        </span>
                                                    </div>
                                                )}
                                                <div className="flex items-center gap-1.5">
                                                    <Clock size={10} className="text-white/60" />
                                                    <span className="text-[10px] text-white/60">
                                                        {formatTime(item.timestamp)}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}