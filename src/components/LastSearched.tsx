'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Clock, X } from 'lucide-react'
import { useTheme } from '@/app/theme'

// ---------- Tipos e funções do histórico ----------
export interface RecentClickItem {
    type: 'profile' | 'store'
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
// --------------------------------------------------

export default function LastSearched() {
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

    if (items.length === 0) return null

    const hexToRgb = (hex: string) => {
        const clean = hex.replace('#', '')
        const num = parseInt(clean, 16)
        return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 }
    }
    const surfaceRgb = hexToRgb(colors.surface)
    const chipBg = `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.5)`

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
                    className="text-xs font-semibold"
                    style={{ color: colors.textSecondary }}
                >
                    Limpar tudo
                </button>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-rounded">
                {items.map((item) => (
                    <button
                        key={`${item.type}-${item.id}`}
                        onClick={() => router.push(item.url)}
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
                            className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0"
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
                        </div>

                        {/* Nome */}
                        <span
                            className="text-xs font-semibold truncate flex-1 text-left"
                            style={{ color: colors.textPrimary }}
                        >
                            {item.name}
                        </span>

                        {/* Remover */}
                        <span
                            onClick={(e) => {
                                e.stopPropagation()
                                removeItem(item)
                            }}
                            className="ml-1 p-0.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
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