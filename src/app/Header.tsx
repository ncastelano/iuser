// src/components/Header.tsx
'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft, Search, X } from 'lucide-react'
import { useTheme } from '@/app/theme'
import { useState, useRef, useEffect } from 'react'

export interface Tab {
    id: string
    label: string
    icon: React.ComponentType<{ size?: number; color?: string }>
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
}

interface HeaderProps {
    title?: string
    showBack?: boolean
    onBack?: () => void
    greeting?: string
    avatarUrl?: string | null
    loading?: boolean
    tabs?: Tab[]
    showSearch?: boolean
    searchPlaceholder?: string
    onSearch?: (query: string) => void
    searchValue?: string
    searchRef?: React.RefObject<HTMLInputElement>
    onSearchFocus?: () => void
    onSearchBlur?: (e: React.FocusEvent<HTMLInputElement>) => void
    profileSlug?: string | null
    onHomeClick?: () => void
    locationElement?: React.ReactNode
}

export default function Header({
    title,
    showBack = false,
    onBack,
    greeting,
    avatarUrl,
    loading = false,
    tabs,
    showSearch = false,
    searchPlaceholder = 'Procurar, espetinho, cabeleireiro...',
    onSearch,
    searchValue = '',
    searchRef: externalSearchRef,
    onSearchFocus,
    onSearchBlur,
    profileSlug,
    onHomeClick,
    locationElement,
}: HeaderProps) {
    const router = useRouter()
    const { colors } = useTheme()

    // State para o ButtonSearch
    const [isExpanded, setIsExpanded] = useState(true) // Sempre expandido
    const [internalSearchValue, setInternalSearchValue] = useState('')
    const internalInputRef = useRef<HTMLInputElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const blurTimeoutRef = useRef<NodeJS.Timeout | null>(null)

    const inputRef = externalSearchRef || internalInputRef
    const currentSearchValue = searchValue !== undefined ? searchValue : internalSearchValue
    const isSearching = currentSearchValue.length > 0

    const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

    // Efeito para clique fora
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                const target = event.target as HTMLElement
                const isLastSearched = target.closest?.('.last-searched-container')
                const isSearchResult = target.closest?.('.search-result-item')

                if (isLastSearched || isSearchResult) {
                    return
                }

                // Não fecha o input, apenas perde o foco
                if (onSearchBlur) {
                    onSearchBlur({} as React.FocusEvent<HTMLInputElement>)
                }
            }
        }

        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [onSearchBlur])

    // Foco automático
    useEffect(() => {
        if (inputRef.current) {
            inputRef.current.focus()
        }
    }, [inputRef])

    const handleSearch = (value: string) => {
        if (searchValue === undefined) {
            setInternalSearchValue(value)
        }
        if (onSearch) {
            onSearch(value)
        }
    }

    const handleClear = () => {
        handleSearch('')
        if (inputRef.current) {
            inputRef.current.focus()
        }
    }

    const handleFocus = () => {
        if (onSearchFocus) onSearchFocus()
    }

    const handleBlur = () => {
        if (blurTimeoutRef.current) {
            clearTimeout(blurTimeoutRef.current)
        }

        blurTimeoutRef.current = setTimeout(() => {
            if (onSearchBlur) {
                onSearchBlur({} as React.FocusEvent<HTMLInputElement>)
            }
        }, 200)
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Escape') {
            handleSearch('')
            if (inputRef.current) {
                inputRef.current.blur()
            }
        }
        if (e.key === 'Enter') {
            e.preventDefault()
            if (inputRef.current) {
                inputRef.current.focus()
            }
        }
    }

    const handleBack = () => {
        if (onBack) onBack()
        else router.back()
    }

    const handleHome = () => {
        if (onHomeClick) {
            onHomeClick()
        } else {
            router.push('/')
        }
    }

    const hexToRgb = (hex: string) => {
        const clean = hex.replace('#', '')
        const bigint = parseInt(clean, 16)
        return {
            r: (bigint >> 16) & 255,
            g: (bigint >> 8) & 255,
            b: bigint & 255,
        }
    }
    const surfaceRgb = hexToRgb(colors.surface)

    const gradientBg = `linear-gradient(to bottom, 
    rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.9) 0%, 
    rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.7) 40%, 
    rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.4) 70%, 
    rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0) 100%)`

    const enhancedTabs: Tab[] = tabs || []

    const getTabBackground = (tab: Tab): string => {
        if (tab.statusColor) {
            return tab.statusColor
        }
        if (tab.isActive) {
            return 'linear-gradient(135deg, #f97316, #dc2626)'
        }
        return `${colors.surface}88`
    }

    const getTabTextColor = (tab: Tab): string => {
        if (tab.statusColor) {
            return '#ffffff'
        }
        if (tab.isActive) {
            return '#ffffff'
        }
        return colors.textSecondary
    }

    return (
        <div
            style={{
                color: colors.textPrimary,
                padding: '8px 12px 0 12px',
                position: 'sticky',
                top: 0,
                zIndex: 20,
                overflow: 'hidden',
                background: gradientBg,
                backdropFilter: 'blur(20px) saturate(180%)',
                WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                minHeight: 120,
                transition: 'min-height 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
            className="sm:px-6 sm:pt-5"
        >
            {/* Marca d'água - Logo sem container circular */}
            <div
                style={{
                    position: 'absolute',
                    right: avatarUrl ? -25 : -15,
                    top: avatarUrl ? -25 : -15,
                    width: avatarUrl ? 160 : 120,
                    height: avatarUrl ? 160 : 120,
                    opacity: avatarUrl ? 0.5 : 0.4,
                    transform: 'rotate(10deg)',
                    maskImage: 'radial-gradient(ellipse at center, rgba(0,0,0,0.8) 30%, rgba(0,0,0,0) 70%)',
                    WebkitMaskImage: 'radial-gradient(ellipse at center, rgba(0,0,0,0.8) 30%, rgba(0,0,0,0) 70%)',
                    pointerEvents: 'none',
                    background: 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1,
                    borderRadius: '0',
                    transition: 'opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
            >
                {avatarUrl ? (
                    <img
                        src={avatarUrl}
                        alt=""
                        style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            borderRadius: '0',
                        }}
                    />
                ) : (
                    <img
                        src="/logotransparente.png"
                        alt="headerimage"
                        style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'contain',
                            borderRadius: '0',
                        }}
                    />
                )}
            </div>

            {/* Conteúdo */}
            <div
                className="relative z-10"
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'flex-start',
                    height: 'auto',
                }}
            >
                <div className="flex items-center gap-2 mb-1">
                    {showBack ? (
                        <button
                            onClick={handleBack}
                            className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
                        >
                            <ArrowLeft size={16} color={colors.accent} />
                        </button>
                    ) : (
                        <button
                            onClick={handleHome}
                            className="flex items-center gap-2 flex-shrink-0"
                            style={{
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                padding: 0,
                            }}
                        >
                            <img
                                src="/logo.png"
                                alt="iUser"
                                className="h-5 sm:h-6 object-contain"
                            />
                        </button>
                    )}
                    {title && (
                        <button
                            onClick={handleHome}
                            className="text-sm sm:text-lg font-semibold opacity-90 bg-transparent border-none cursor-pointer flex-shrink-0"
                            style={{ color: colors.textPrimary }}
                        >
                            {title}
                        </button>
                    )}
                    {locationElement && (
                        <div className="ml-auto flex-shrink-0">
                            {locationElement}
                        </div>
                    )}
                </div>

                {greeting && (
                    <h1 className="text-lg sm:text-2xl lg:text-3xl font-extrabold mt-1 tracking-tight break-words">
                        {greeting}
                    </h1>
                )}

                {enhancedTabs.length > 0 && (
                    <div
                        className="flex gap-1.5 mt-2 overflow-x-auto scroll-smooth pb-1 pt-1 scrollbar-hide"
                        style={{ overflowY: 'visible' }}
                    >
                        {enhancedTabs.map((tab) => {
                            const backgroundColor = getTabBackground(tab)
                            const textColor = getTabTextColor(tab)

                            return (
                                <button
                                    key={tab.id}
                                    onClick={tab.onClick}
                                    disabled={loading}
                                    className="relative flex items-center pl-0 pr-3 py-0.5 rounded-full text-xs sm:text-sm font-semibold transition-all duration-200 whitespace-nowrap disabled:opacity-50 flex-shrink-0"
                                    style={{
                                        background: backgroundColor,
                                        backdropFilter: 'blur(10px)',
                                        color: textColor,
                                        overflow: 'visible',
                                        ...(tab.isActive && !tab.statusColor ? {
                                            boxShadow: `0 2px 8px #f9731640`,
                                            fontWeight: 'bold',
                                        } : {}),
                                        ...(tab.isActive && tab.statusColor ? {
                                            boxShadow: `0 2px 8px ${tab.statusColor}60`,
                                            fontWeight: 'bold',
                                            transform: 'scale(1.05)',
                                        } : {}),
                                    }}
                                >
                                    {tab.imageUrl ? (
                                        <img
                                            src={tab.imageUrl}
                                            alt=""
                                            className="h-7 w-7 sm:h-9 sm:w-9 object-cover rounded-full flex-shrink-0"
                                        />
                                    ) : (
                                        <div
                                            className="h-7 w-7 sm:h-9 sm:w-9 rounded-full flex items-center justify-center flex-shrink-0"
                                            style={{
                                                background: tab.isActive
                                                    ? (tab.statusColor ? `${tab.statusColor}cc` : 'linear-gradient(135deg, #f97316, #dc2626)')
                                                    : `${colors.surface}88`,
                                                backdropFilter: 'blur(10px)',
                                            }}
                                        >
                                            <tab.icon
                                                size={14}
                                                color={textColor}
                                            />
                                        </div>
                                    )}
                                    <span className="ml-1.5 sm:ml-2">{tab.label}</span>

                                    {tab.indicator && (
                                        <div className="absolute -top-1 -right-1 flex gap-0.5">
                                            {tab.indicator.pending > 0 && (
                                                <span className="w-4 h-4 rounded-full bg-blue-500 text-white text-[7px] flex items-center justify-center font-black leading-none">
                                                    {tab.indicator.pending}
                                                </span>
                                            )}
                                            {tab.indicator.preparing > 0 && (
                                                <span className="w-4 h-4 rounded-full bg-yellow-500 text-white text-[7px] flex items-center justify-center font-black leading-none">
                                                    {tab.indicator.preparing}
                                                </span>
                                            )}
                                            {tab.indicator.ready > 0 && (
                                                <span className="w-4 h-4 rounded-full bg-purple-500 text-white text-[7px] flex items-center justify-center font-black leading-none">
                                                    {tab.indicator.ready}
                                                </span>
                                            )}
                                        </div>
                                    )}

                                    {tab.badge && tab.badge.count > 0 && (
                                        <div className="absolute -top-1 -right-1">
                                            <span
                                                className="w-4 h-4 rounded-full text-white text-[7px] flex items-center justify-center font-black leading-none"
                                                style={{ backgroundColor: tab.badge.color || '#ef4444' }}
                                            >
                                                {tab.badge.count}
                                            </span>
                                        </div>
                                    )}
                                </button>
                            )
                        })}
                    </div>
                )}

                {/* ButtonSearch - SEMPRE EXPANDIDO COM MENSAGEM */}
                {showSearch && (
                    <div className="mt-3 pb-3 w-full">
                        <div
                            ref={containerRef}
                            className="transition-all duration-300 ease-in-out w-full"
                            style={{
                                position: 'relative',
                                height: 48,
                                borderRadius: 999,
                                background: `${colors.surface}88`,
                                backdropFilter: 'blur(12px)',
                                boxShadow: 'none',
                                display: 'flex',
                                alignItems: 'center',
                                padding: '0 4px',
                                cursor: 'text',
                                border: `1.5px solid ${colors.border}`,
                                transition: 'all 0.3s ease-in-out',
                            }}
                            onClick={() => {
                                if (inputRef.current) {
                                    inputRef.current.focus()
                                }
                            }}
                        >
                            <div
                                style={{
                                    width: 40,
                                    height: 40,
                                    borderRadius: '50%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0,
                                    color: colors.accent,
                                    background: 'transparent',
                                    transition: 'all 0.3s ease',
                                }}
                            >
                                <Search size={18} strokeWidth={2} />
                            </div>

                            <div
                                style={{
                                    flex: 1,
                                    height: '100%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    paddingRight: 8,
                                }}
                            >
                                <input
                                    ref={inputRef}
                                    type="search"
                                    inputMode="search"
                                    enterKeyHint="done"
                                    placeholder={searchPlaceholder}
                                    value={currentSearchValue}
                                    onChange={(e) => handleSearch(e.target.value)}
                                    onFocus={handleFocus}
                                    onBlur={handleBlur}
                                    onKeyDown={handleKeyDown}
                                    style={{
                                        flex: 1,
                                        height: '100%',
                                        background: 'transparent',
                                        border: 'none',
                                        outline: 'none',
                                        padding: '0 12px',
                                        fontSize: 14,
                                        fontWeight: 500,
                                        color: colors.textPrimary,
                                        minWidth: 0,
                                        letterSpacing: '0.3px',
                                    }}
                                />

                                {isSearching && (
                                    <button
                                        onClick={handleClear}
                                        style={{
                                            width: 28,
                                            height: 28,
                                            borderRadius: '50%',
                                            background: `${colors.textSecondary}15`,
                                            border: 'none',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            flexShrink: 0,
                                            transition: 'all 0.2s ease',
                                            color: colors.textSecondary,
                                            marginRight: 4,
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.background = `${colors.textSecondary}25`
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.background = `${colors.textSecondary}15`
                                        }}
                                        aria-label="Limpar busca"
                                        title="Limpar busca"
                                    >
                                        <X size={16} strokeWidth={2} />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <style jsx>{`
                .scrollbar-hide::-webkit-scrollbar {
                    display: none;
                }
                .scrollbar-hide {
                    -ms-overflow-style: none;
                    scrollbar-width: none;
                }
                input::placeholder {
                    color: ${colors.textSecondary} !important;
                    opacity: 0.6;
                    font-weight: 400;
                    letter-spacing: 0.3px;
                }
                input::-webkit-input-placeholder {
                    color: ${colors.textSecondary} !important;
                    opacity: 0.6;
                }
                input::-moz-placeholder {
                    color: ${colors.textSecondary} !important;
                    opacity: 0.6;
                }
                input:-ms-input-placeholder {
                    color: ${colors.textSecondary} !important;
                    opacity: 0.6;
                }
                input:-moz-placeholder {
                    color: ${colors.textSecondary} !important;
                    opacity: 0.6;
                }
                input[type="search"]::-webkit-search-decoration,
                input[type="search"]::-webkit-search-cancel-button,
                input[type="search"]::-webkit-search-results-button,
                input[type="search"]::-webkit-search-results-decoration {
                    display: none;
                    -webkit-appearance: none;
                }
                input[type="search"] {
                    -webkit-appearance: none;
                }
            `}</style>
        </div>
    )
}