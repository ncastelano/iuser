// components/Header.tsx
'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft, Search } from 'lucide-react'
import { useTheme } from '@/app/theme'

export interface Tab {
    id: string
    label: string
    icon: React.ComponentType<{ size?: number }>
    imageUrl?: string | null
    onClick: () => void
    isActive: boolean
}

interface StoreInfo {
    slug: string
    logoUrl: string | null
    name: string
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
    profileSlug?: string | null
    store?: StoreInfo | null
    stores?: StoreInfo[]
    // Corrigido para receber o evento de foco
    onSearchFocus?: () => void
    onSearchBlur?: (e: React.FocusEvent<HTMLInputElement>) => void
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
    profileSlug,
    store,
    stores,
    onSearchFocus,
    onSearchBlur,
}: HeaderProps) {
    const router = useRouter()
    const { colors } = useTheme()

    const handleBack = () => {
        if (onBack) onBack()
        else router.back()
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

    return (
        <div
            style={{
                color: colors.textPrimary,
                padding: '20px 24px 0 24px',
                position: 'sticky',
                top: 0,
                zIndex: 20,
                overflow: 'hidden',
                background: gradientBg,
                backdropFilter: 'blur(20px) saturate(180%)',
                WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                minHeight: 160,
            }}
        >
            {/* Marca d'água */}
            <div
                style={{
                    position: 'absolute',
                    right: avatarUrl ? -40 : -30,
                    top: avatarUrl ? -40 : -30,
                    width: avatarUrl ? 240 : 180,
                    height: avatarUrl ? 240 : 180,
                    opacity: avatarUrl ? 0.5 : 0.4,
                    transform: 'rotate(10deg)',
                    maskImage:
                        'radial-gradient(ellipse at center, rgba(0,0,0,0.8) 30%, rgba(0,0,0,0) 70%)',
                    WebkitMaskImage:
                        'radial-gradient(ellipse at center, rgba(0,0,0,0.8) 30%, rgba(0,0,0,0) 70%)',
                    pointerEvents: 'none',
                    background: avatarUrl ? 'transparent' : colors.accent,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1,
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
                            borderRadius: '50%',
                        }}
                    />
                ) : (
                    <img
                        src="/logotransparente.png"
                        alt="Logo"
                        style={{
                            width: 90,
                            height: 90,
                            objectFit: 'contain',
                        }}
                    />
                )}
            </div>

            {/* Conteúdo do header */}
            <div className="relative z-10">
                <div className="flex items-center gap-3 mb-1">
                    {showBack ? (
                        <button
                            onClick={handleBack}
                            className="w-10 h-10 rounded-full flex items-center justify-center"
                            style={{
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                            }}
                        >
                            <ArrowLeft size={20} color={colors.accent} />
                        </button>
                    ) : (
                        <button
                            onClick={() => router.push('/')}
                            className="w-11 h-11 rounded-full flex items-center justify-center shadow-lg"
                            style={{
                                background: 'linear-gradient(135deg, #f97316, #ef4444)',
                                border: '2px solid rgba(255,255,255,0.2)',
                                cursor: 'pointer',
                            }}
                        >
                            <img
                                src="/logo.png"
                                alt="iUser"
                                className="w-7 h-7 object-contain"
                            />
                        </button>
                    )}
                    {title && (
                        <h2 className="text-lg font-semibold opacity-90">{title}</h2>
                    )}
                </div>

                {greeting && (
                    <h1 className="text-3xl font-extrabold mt-2 tracking-tight">
                        {greeting}
                    </h1>
                )}

                {enhancedTabs.length > 0 && (
                    <div className="flex gap-2 mt-5 overflow-x-auto pb-1">
                        {enhancedTabs.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={tab.onClick}
                                disabled={loading}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold transition-all duration-200 whitespace-nowrap disabled:opacity-50"
                                style={{
                                    background: tab.isActive
                                        ? colors.accent
                                        : `${colors.surface}88`,
                                    backdropFilter: 'blur(10px)',
                                    color: tab.isActive
                                        ? colors.accentText
                                        : colors.textSecondary,
                                }}
                            >
                                {tab.imageUrl ? (
                                    <img
                                        src={tab.imageUrl}
                                        alt=""
                                        className="w-5 h-5 rounded-full object-cover"
                                    />
                                ) : (
                                    <tab.icon size={16} />
                                )}
                                <span>{tab.label}</span>
                            </button>
                        ))}
                    </div>
                )}

                {showSearch && (
                    <div className="mt-4 flex items-center gap-3 flex-wrap pb-4">
                        <div
                            className="flex-1 flex items-center gap-2.5 px-4 py-3 rounded-2xl text-sm"
                            style={{
                                background: `${colors.surface}88`,
                                backdropFilter: 'blur(10px)',
                                border: `1px solid ${colors.border}`,
                            }}
                        >
                            <Search size={18} style={{ color: colors.textSecondary }} />
                            <input
                                type="text"
                                placeholder={searchPlaceholder}
                                onChange={(e) => onSearch?.(e.target.value)}
                                onFocus={onSearchFocus}
                                onBlur={onSearchBlur}
                                className="flex-1 bg-transparent outline-none"
                                style={{ color: colors.textPrimary }}
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}