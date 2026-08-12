// src/components/LastSearched.tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Clock, X, User, Store, Package, Search } from 'lucide-react'
import { useTheme } from '@/app/theme'

// ---------- Tipos e funções do histórico ----------
export interface RecentClickItem {
    type: 'profile' | 'store' | 'product' // ADICIONADO 'product'
    id: string
    name: string
    imageUrl: string | null
    url: string
}

const STORAGE_KEY = 'recent_clicks_v1'
const MAX_ITEMS = 10

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
    // Remove duplicata (mesmo type e id)
    const filtered = current.filter(i => !(i.type === item.type && i.id === item.id))
    const updated = [item, ...filtered]
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

    useEffect(() => {
        setItems(getRecentClicks())
    }, [])

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
            // Fallback: usa o router diretamente
            router.push(item.url)
        }
    }

    if (items.length === 0) return null

    const hexToRgb = (hex: string) => {
        const clean = hex.replace('#', '')
        const num = parseInt(clean, 16)
        return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 }
    }
    const surfaceRgb = hexToRgb(colors.surface)
    const chipBg = `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.5)`

    const getIcon = (type: string) => {
        switch (type) {
            case 'profile':
                return <User size={12} style={{ color: '#3b82f6' }} />
            case 'store':
                return <Store size={12} style={{ color: '#f97316' }} />
            case 'product':
                return <Package size={12} style={{ color: '#8b5cf6' }} />
            default:
                return <Search size={12} style={{ color: colors.textSecondary }} />
        }
    }

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

    return (
        <div className="mb-6">
            <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-2">
                    <Clock size={16} style={{ color: colors.accent }} />
                    <h3
                        className="text-sm font-bold uppercase tracking-wide"
                        style={{ color: colors.textPrimary }}
                    >
                        Últimos acessados
                    </h3>
                </div>
                <button
                    onClick={clearAll}
                    className="text-xs font-semibold hover:underline"
                    style={{ color: colors.textSecondary }}
                >
                    Limpar tudo
                </button>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-rounded">
                {items.map((item) => (
                    <button
                        key={`${item.type}-${item.id}`}
                        onClick={() => handleItemClick(item)}
                        className="group inline-flex items-center gap-2 px-3 py-2 rounded-2xl border transition-all duration-200 whitespace-nowrap flex-shrink-0 min-w-[140px] max-w-[200px]"
                        style={{
                            background: chipBg,
                            borderColor: colors.border,
                            boxShadow: colors.shadow,
                            color: colors.textPrimary,
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = colors.accent + '20'
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = chipBg
                        }}
                    >
                        {/* Avatar / Logo */}
                        <div
                            className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 relative"
                            style={{ background: colors.surface }}
                        >
                            {item.imageUrl ? (
                                <img
                                    src={item.imageUrl}
                                    alt=""
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <div
                                    className="w-full h-full flex items-center justify-center text-sm font-black"
                                    style={{ color: colors.textSecondary }}
                                >
                                    {item.name.charAt(0).toUpperCase()}
                                </div>
                            )}
                            {/* Ícone de tipo no canto inferior direito */}
                            <div
                                className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center"
                                style={{ background: colors.surface, border: `1px solid ${colors.border}` }}
                            >
                                {getIcon(item.type)}
                            </div>
                        </div>

                        {/* Nome e tipo */}
                        <div className="flex-1 min-w-0 text-left">
                            <span
                                className="text-xs font-semibold truncate block"
                                style={{ color: colors.textPrimary }}
                            >
                                {item.name}
                            </span>
                            <span
                                className="text-[8px] font-bold uppercase opacity-60"
                                style={{ color: colors.textSecondary }}
                            >
                                {getTypeLabel(item.type)}
                            </span>
                        </div>

                        {/* Remover */}
                        <span
                            onClick={(e) => {
                                e.stopPropagation()
                                removeItem(item)
                            }}
                            className="ml-1 p-0.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors cursor-pointer"
                            title="Remover"
                        >
                            <X size={12} style={{ color: colors.textSecondary }} />
                        </span>
                    </button>
                ))}
            </div>
        </div>
    )
}