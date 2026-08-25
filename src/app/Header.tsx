'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft, Search } from 'lucide-react'
import { useTheme } from '@/app/theme'

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
    searchPlaceholder = 'Buscar...',
    onSearch,
    searchValue = '',
    searchRef,
    onSearchFocus,
    onSearchBlur,
    profileSlug,
    onHomeClick,
    locationElement,
}: HeaderProps) {
    const router = useRouter()
    const { colors } = useTheme()

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
            <div className="relative z-10">
                <div className="flex items-center gap-2 mb-1">
                    {showBack ? (
                        <button
                            onClick={handleBack}
                            className="w-8 h-8 rounded-full flex items-center justify-center"
                            style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
                        >
                            <ArrowLeft size={16} color={colors.accent} />
                        </button>
                    ) : (
                        <button
                            onClick={handleHome}
                            className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center shadow-lg"
                            style={{
                                background: 'linear-gradient(135deg, #f97316, #dc2626)',
                                border: '2px solid rgba(255,255,255,0.2)',
                                cursor: 'pointer',
                            }}
                        >
                            <img src="/logo.png" alt="iUser" className="w-5 h-5 sm:w-6 sm:h-6 object-contain" />
                        </button>
                    )}
                    {title && (
                        <button
                            onClick={handleHome}
                            className="text-sm sm:text-lg font-semibold opacity-90 bg-transparent border-none cursor-pointer"
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

                {showSearch && (
                    <div className="mt-2 flex items-center gap-2 pb-2">
                        <div
                            className="flex-1 flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs sm:text-sm"
                            style={{
                                background: `${colors.surface}88`,
                                backdropFilter: 'blur(10px)',
                                border: `1px solid ${colors.border}`,
                            }}
                        >
                            <Search size={14} style={{ color: colors.textSecondary }} />
                            <input
                                ref={searchRef}
                                type="text"
                                placeholder={searchPlaceholder}
                                value={searchValue}
                                onChange={(e) => {
                                    const value = e.target.value
                                    onSearch?.(value)
                                }}
                                onFocus={onSearchFocus}
                                onBlur={(e) => {
                                    if (onSearchBlur) {
                                        onSearchBlur(e)
                                    }
                                }}
                                className="flex-1 bg-transparent outline-none"
                                style={{ color: colors.textPrimary }}
                            />
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
                    opacity: 0.7;
                }
                input::-webkit-input-placeholder {
                    color: ${colors.textSecondary} !important;
                    opacity: 0.7;
                }
                input::-moz-placeholder {
                    color: ${colors.textSecondary} !important;
                    opacity: 0.7;
                }
                input:-ms-input-placeholder {
                    color: ${colors.textSecondary} !important;
                    opacity: 0.7;
                }
                input:-moz-placeholder {
                    color: ${colors.textSecondary} !important;
                    opacity: 0.7;
                }
            `}</style>
        </div>
    )
}