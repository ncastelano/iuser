// src/components/Header.tsx
'use client'

import { usePathname, useRouter } from 'next/navigation'
import { ArrowLeft, Search, ShoppingCart, X } from 'lucide-react'
import { useTheme } from '@/app/theme'
import { useState, useRef, useEffect, useMemo } from 'react'
import { hexToRgb } from '@/lib/color'
import { useCartStore } from '@/store/useCartStore'

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
    const pathname = usePathname()
    const { colors } = useTheme()

    const cartItemsByStore = useCartStore((state) => state.itemsByStore)
    const cartCount = useMemo(
        () => Object.values(cartItemsByStore).reduce((acc, items) => acc + items.length, 0),
        [cartItemsByStore]
    )

    const [internalSearchValue, setInternalSearchValue] = useState('')
    const [isFocused, setIsFocused] = useState(false)
    const internalInputRef = useRef<HTMLInputElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const blurTimeoutRef = useRef<NodeJS.Timeout | null>(null)

    const inputRef = externalSearchRef || internalInputRef
    const currentSearchValue = searchValue !== undefined ? searchValue : internalSearchValue
    const isSearching = currentSearchValue.length > 0

    // Verifica se deve estar expandido (focado OU com texto)
    const isExpanded = isFocused || isSearching

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                const target = event.target as HTMLElement
                const isLastSearched = target.closest?.('.last-searched-container')
                const isSearchResult = target.closest?.('.search-result-item')

                if (isLastSearched || isSearchResult) {
                    return
                }

                // Se não tiver texto, pode fechar
                if (!isSearching) {
                    setIsFocused(false)
                    if (onSearchBlur) {
                        onSearchBlur({} as React.FocusEvent<HTMLInputElement>)
                    }
                }
            }
        }

        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [isSearching, onSearchBlur])

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

    const handleClose = () => {
        handleSearch('')
        setIsFocused(false)
        if (onSearchBlur) {
            onSearchBlur({} as React.FocusEvent<HTMLInputElement>)
        }
        if (inputRef.current) {
            inputRef.current.blur()
        }
    }

    const handleFocus = () => {
        setIsFocused(true)
        if (onSearchFocus) onSearchFocus()
    }

    const handleBlur = () => {
        if (blurTimeoutRef.current) {
            clearTimeout(blurTimeoutRef.current)
        }

        blurTimeoutRef.current = setTimeout(() => {
            // Só fecha se não tiver texto
            if (!isSearching) {
                setIsFocused(false)
                if (onSearchBlur) {
                    onSearchBlur({} as React.FocusEvent<HTMLInputElement>)
                }
            }
        }, 200)
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Escape') {
            handleClose()
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

    const surfaceRgb = hexToRgb(colors.surface)

    // 90% do header (de cima) é sólido/opaco; só os 10% finais viram
    // gradiente até transparente.
    const gradientBg = `linear-gradient(to bottom,
        rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.98) 0%,
        rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.98) 90%,
        rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0) 100%)`

    const enhancedTabs: Tab[] = tabs || []

    const getTabBackground = (tab: Tab): string => {
        if (tab.statusColor) {
            return tab.statusColor
        }
        if (tab.isActive) {
            return 'linear-gradient(135deg, #f97316, #dc2626)'
        }
        return 'transparent'
    }

    const getTabTextColor = (tab: Tab): string => {
        if (tab.statusColor) {
            return '#ffffff'
        }
        if (tab.isActive) {
            return '#ffffff'
        }
        return colors.textPrimary
    }

    const getTabBorder = (tab: Tab): string => {
        return tab.isActive ? '#f97316' : '#ffffff'
    }

    return (
        <div
            style={{
                color: colors.textPrimary,
                padding: isExpanded ? '8px 12px' : '8px 12px 0 12px',
                position: 'sticky',
                top: 0,
                zIndex: 20,
                overflow: 'hidden',
                background: gradientBg,
                backdropFilter: 'blur(20px) saturate(180%)',
                WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                minHeight: isExpanded ? 80 : 120,
                transition: 'min-height 0.5s cubic-bezier(0.4, 0, 0.2, 1), padding 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
                display: 'flex',
                alignItems: isExpanded ? 'center' : 'flex-start',
            }}
            className="sm:px-6 sm:pt-5"
        >
            {/* Marca d'água */}
            <div
                style={{
                    position: 'absolute',
                    right: avatarUrl ? -25 : -15,
                    top: avatarUrl ? -25 : -15,
                    width: avatarUrl ? 160 : 120,
                    height: avatarUrl ? 160 : 120,
                    opacity: isExpanded ? 0 : (avatarUrl ? 0.5 : 0.4),
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
                    transition: 'opacity 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
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
                    justifyContent: isExpanded ? 'center' : 'flex-start',
                    height: isExpanded ? '100%' : 'auto',
                    width: '100%',
                    transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
            >
                {/* Elementos que escondem quando expandido */}
                <div
                    style={{
                        maxHeight: isExpanded ? 0 : 1000,
                        opacity: isExpanded ? 0 : 1,
                        overflow: 'hidden',
                        transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
                        marginBottom: isExpanded ? 0 : undefined,
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
                                const borderColor = getTabBorder(tab)
                                const isActive = tab.isActive

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
                                            border: `1.5px solid ${borderColor}`,
                                            ...(isActive && !tab.statusColor ? {
                                                boxShadow: `0 2px 8px #f9731640`,
                                                fontWeight: 'bold',
                                            } : {}),
                                            ...(isActive && tab.statusColor ? {
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
                                                    background: isActive
                                                        ? (tab.statusColor ? `${tab.statusColor}cc` : 'linear-gradient(135deg, #f97316, #dc2626)')
                                                        : 'transparent',
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
                </div>

                {/* ButtonSearch com brilho sempre ativo */}
                {showSearch && (
                    <div
                        className="w-full flex items-center gap-2"
                        style={{
                            marginTop: isExpanded ? 0 : 12,
                            paddingBottom: isExpanded ? 0 : 16,
                            transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
                        }}
                    >
                        <div
                            ref={containerRef}
                            className="relative"
                            style={{
                                flex: 1,
                                minWidth: 0,
                                position: 'relative',
                                height: 48,
                                borderRadius: 999,
                                display: 'flex',
                                alignItems: 'center',
                                padding: '0 4px',
                                cursor: 'text',
                                background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.35)`,
                                backdropFilter: 'blur(16px) saturate(180%)',
                                WebkitBackdropFilter: 'blur(16px) saturate(180%)',
                                border: `1.5px solid ${isExpanded ? '#f97316' : colors.border}`,
                                transition: 'border-color 0.3s ease-in-out',
                                boxShadow: `0 0 0 1px #f97316, 0 0 5px #f9731640, 0 0 10px #fb923c30, 0 0 15px #f59e0b20`,
                                animation: 'pulseGlow 2s ease-in-out infinite',
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
                                    background: isExpanded ? `${colors.accent}15` : 'transparent',
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
                                    paddingRight: isExpanded ? 8 : 0,
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
                            </div>

                            {/* Botão X - aparece quando expandido */}
                            {isExpanded && (
                                <button
                                    onClick={isSearching ? handleClear : handleClose}
                                    style={{
                                        width: 28,
                                        height: 28,
                                        borderRadius: '50%',
                                        background: isSearching ? `${colors.textSecondary}15` : 'transparent',
                                        border: 'none',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        flexShrink: 0,
                                        transition: 'all 0.2s ease',
                                        color: colors.accent,
                                        marginRight: 4,
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.background = isSearching ? `${colors.textSecondary}25` : `${colors.textSecondary}10`
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.background = isSearching ? `${colors.textSecondary}15` : 'transparent'
                                    }}
                                    aria-label={isSearching ? "Limpar busca" : "Fechar busca"}
                                    title={isSearching ? "Limpar busca" : "Fechar busca"}
                                >
                                    <X size={16} strokeWidth={2} />
                                </button>
                            )}
                        </div>

                        {pathname !== '/sacola' && (
                            <button
                                onClick={() => router.push('/sacola')}
                                className="relative flex items-center justify-center rounded-full flex-shrink-0 h-12 w-12 transition-transform hover:scale-105 active:scale-95"
                                style={{
                                    background: 'linear-gradient(135deg, #f97316, #dc2626)',
                                    color: '#ffffff',
                                }}
                                aria-label="Ver sacola"
                                title="Ver sacola"
                            >
                                <ShoppingCart size={20} strokeWidth={2} />
                                {cartCount > 0 && (
                                    <span
                                        className="absolute -top-1 -right-1 w-5 h-5 rounded-full text-white text-[9px] flex items-center justify-center font-black leading-none"
                                        style={{ backgroundColor: '#ef4444', border: '2px solid #ffffff' }}
                                    >
                                        {cartCount}
                                    </span>
                                )}
                            </button>
                        )}
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
                        color: ${colors.textPrimary} !important;
                        opacity: 1;
                        font-weight: 400;
                        letter-spacing: 0.3px;
                    }
                    input::-webkit-input-placeholder {
                        color: ${colors.textPrimary} !important;
                        opacity: 1;
                    }
                    input::-moz-placeholder {
                        color: ${colors.textPrimary} !important;
                        opacity: 1;
                    }
                    input:-ms-input-placeholder {
                        color: ${colors.textPrimary} !important;
                        opacity: 1;
                    }
                    input:-moz-placeholder {
                        color: ${colors.textPrimary} !important;
                        opacity: 1;
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
                    @keyframes pulseGlow {
                        0%, 100% {
                            box-shadow: 0 0 0 1px #f97316, 0 0 5px #f9731640, 0 0 10px #fb923c20;
                        }
                        50% {
                            box-shadow: 0 0 0 2px #fb923c, 0 0 10px #f9731660, 0 0 20px #fb923c40, 0 0 30px #f59e0b20;
                        }
                    }
                `}</style>
        </div>
    )
}