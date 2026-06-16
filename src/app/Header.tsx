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
}: HeaderProps) {
    const router = useRouter()
    const { colors } = useTheme()

    const handleBack = () => {
        if (onBack) onBack()
        else router.back()
    }

    return (
        <div
            style={{
                background: colors.surface,
                color: colors.textPrimary,
                padding: '20px 24px',
                borderBottomLeftRadius: 36,
                borderBottomRightRadius: 36,
                boxShadow: colors.shadow,
                position: 'sticky',
                top: 0,
                zIndex: 20,
                overflow: 'hidden',
            }}
        >
            {/* Marca d'água */}
            <div
                style={{
                    position: 'absolute',
                    right: -20,
                    top: -20,
                    opacity: 0.4,
                    transform: 'rotate(10deg)',
                    maskImage:
                        'radial-gradient(ellipse at center, rgba(0,0,0,0.8) 30%, rgba(0,0,0,0) 70%)',
                    WebkitMaskImage:
                        'radial-gradient(ellipse at center, rgba(0,0,0,0.8) 30%, rgba(0,0,0,0) 70%)',
                }}
            >
                {avatarUrl ? (
                    <img src={avatarUrl} alt="" style={{ width: 280, height: 280, objectFit: 'cover' }} />
                ) : (
                    <img
                        src="/logotransparente.png"
                        alt="Logo"
                        style={{ width: 280, height: 280, objectFit: 'contain' }}
                    />
                )}
            </div>

            <div className="relative z-10">
                {/* Linha superior */}
                <div className="flex items-center gap-3 mb-1">
                    {showBack && (
                        <button
                            onClick={handleBack}
                            className="w-10 h-10 rounded-full flex items-center justify-center"
                            style={{
                                background: colors.accentLight,
                                backdropFilter: 'blur(10px)',
                                border: 'none',
                                cursor: 'pointer',
                            }}
                        >
                            <ArrowLeft size={20} color={colors.accent} />
                        </button>
                    )}
                    {title && (
                        <h2 className="text-lg font-semibold opacity-90">{title}</h2>
                    )}
                </div>

                {/* Saudação */}
                {greeting && (
                    <h1 className="text-3xl font-extrabold mt-2 tracking-tight">
                        {greeting}
                    </h1>
                )}

                {/* Abas */}
                {tabs && tabs.length > 0 && (
                    <div className="flex gap-2 mt-5 overflow-x-auto pb-1">
                        {tabs.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={tab.onClick}
                                disabled={loading}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold transition-all duration-200 whitespace-nowrap disabled:opacity-50"
                                style={{
                                    background: tab.isActive
                                        ? colors.accent
                                        : colors.background,
                                    color: tab.isActive
                                        ? colors.accentText
                                        : colors.textSecondary,
                                    backdropFilter: 'blur(10px)',
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

                {/* Busca */}
                {showSearch && (
                    <div className="mt-4 flex items-center gap-3 flex-wrap">
                        <div
                            className="flex-1 flex items-center gap-2.5 px-4 py-3 rounded-2xl text-sm"
                            style={{
                                background: colors.background,
                                backdropFilter: 'blur(10px)',
                                border: `1px solid ${colors.border}`,
                            }}
                        >
                            <Search size={18} style={{ color: colors.textSecondary }} />
                            <input
                                type="text"
                                placeholder={searchPlaceholder}
                                onChange={(e) => onSearch?.(e.target.value)}
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