// app/(main)/inicio/page.tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Search, User, Settings, ArrowLeft } from 'lucide-react'
import {
    DndContext,
    closestCenter,
    DragEndEvent,
} from '@dnd-kit/core'
import {
    SortableContext,
    verticalListSortingStrategy,
    arrayMove,
} from '@dnd-kit/sortable'

import CategoriasSection from './inicio/sections/CanIhelp'
import TransporteSection from './inicio/sections/TransporteSection'
import MotoristaSection from './inicio/sections/MotoristaSection'
import PromocoesSection from './inicio/sections/PromocoesSection'
import SortableSection from './inicio/sections/SortableSection'
import AtalhoCompromissosDaLoja from './compromissos/AtalhoCompromissosDaLoja'
import AtalhoCompromissosPessoal from './compromissos/AtalhoCompromissosPessoal'
import ConfiguracoesContent from './Configuracoes'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import { useProfile } from '../contexts/ProfileContext'
import { useTheme } from '../theme'
import OrderShortcuts from '@/components/OrderShortcuts'

const DEFAULT_SECTIONS = [
    'categorias',
    'transporte',
    'motorista',
    'promocoes',
    'compromissosPessoal',
    'compromissosLoja',
]

const ORDER_STORAGE_KEY = 'homepage_sections_order'

export default function HomePage() {
    const router = useRouter()
    const {
        profileSlug,
        avatarUrl,
        bgMode,
        customBgUrl,
        loading,
        setBgMode,
        setCustomBgUrl,
    } = useProfile()

    const { colors } = useTheme()

    const [sections, setSections] = useState<string[]>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem(ORDER_STORAGE_KEY)
            if (saved) {
                try {
                    const parsed = JSON.parse(saved)
                    if (Array.isArray(parsed) && parsed.length === DEFAULT_SECTIONS.length) {
                        return parsed
                    }
                } catch { }
            }
        }
        return DEFAULT_SECTIONS
    })

    const [showConfig, setShowConfig] = useState(false)
    const [editMode, setEditMode] = useState(false)

    function handleDragEnd(event: DragEndEvent) {
        const { active, over } = event
        if (!over || active.id === over.id) return
        setSections((items) => {
            const oldIndex = items.indexOf(active.id as string)
            const newIndex = items.indexOf(over.id as string)
            return arrayMove(items, oldIndex, newIndex)
        })
    }

    const handleSaveOrder = () => {
        localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(sections))
        setEditMode(false)
    }

    const handleRestoreOrder = () => {
        const saved = localStorage.getItem(ORDER_STORAGE_KEY)
        if (saved) {
            try {
                const parsed = JSON.parse(saved)
                if (Array.isArray(parsed) && parsed.length === DEFAULT_SECTIONS.length) {
                    setSections(parsed)
                    setEditMode(false)
                    return
                }
            } catch { }
        }
        setSections(DEFAULT_SECTIONS)
        setEditMode(false)
    }

    const toggleEditMode = () => setEditMode((prev) => !prev)

    const renderSection = (sectionId: string) => {
        switch (sectionId) {
            case 'categorias':
                return <CategoriasSection />
            case 'transporte':
                return <TransporteSection />
            case 'motorista':
                return <MotoristaSection />
            case 'promocoes':
                return <PromocoesSection />
            case 'compromissosPessoal':
                return <AtalhoCompromissosPessoal profileSlug={profileSlug} />
            case 'compromissosLoja':
                return <AtalhoCompromissosDaLoja profileSlug={profileSlug} />   // 👈 AQUI
            default:
                return null
        }
    }

    const handleAvatarClick = () => {
        if (!profileSlug) {
            router.push(`/login?redirect=${encodeURIComponent(window.location.pathname)}`)
        } else {
            router.push(`/${profileSlug}`)
        }
    }

    const tabs = [
        {
            id: 'perfil',
            label: profileSlug ? `@${profileSlug}` : loading ? '...' : 'Entrar',
            icon: User,
            imageUrl: avatarUrl,
            onClick: handleAvatarClick,
            isActive: !showConfig,
        },
        {
            id: 'config',
            label: 'Configurações',
            icon: Settings,
            imageUrl: null,
            onClick: () => setShowConfig(!showConfig),
            isActive: showConfig,
        },
    ]

    return (
        <div className="relative min-h-dvh" style={{ background: colors.background }}>
            <div className="fixed inset-0 z-0">
                <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
            </div>

            <main className="relative z-10 min-h-dvh" style={{ overscrollBehavior: 'none' }}>
                {/* CABEÇALHO */}
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
                            {showConfig ? (
                                <>
                                    <button
                                        onClick={() => setShowConfig(false)}
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
                                    <h2 className="text-lg font-semibold opacity-90">Configurações</h2>
                                </>
                            ) : (
                                <>
                                    <button
                                        onClick={() => router.back()}
                                        className="w-10 h-10 rounded-full flex items-center justify-center"
                                        style={{
                                            background: colors.accentLight,
                                            backdropFilter: 'blur(10px)',
                                            border: 'none',
                                            cursor: 'pointer',
                                        }}
                                    >
                                        <img src="/logo.png" alt="Logo" className="w-6 h-6 object-contain" />
                                    </button>
                                    <h2 className="text-lg font-semibold opacity-90">iUser</h2>
                                </>
                            )}
                        </div>

                        <h1 className="text-3xl font-extrabold mt-2 tracking-tight">
                            Olá, {loading ? '...' : profileSlug ? `@${profileSlug}` : 'Visitante'}
                        </h1>

                        {/* Tabs */}
                        <div className="flex gap-2 mt-5 overflow-x-auto pb-1">
                            {tabs.map((tab) => {
                                if (tab.id === 'config' && showConfig) return null
                                return (
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
                                )
                            })}
                        </div>

                        {/* Barra de busca + Ordenação */}
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
                                <span style={{ color: colors.textSecondary }}>Buscar restaurantes, mercados...</span>
                            </div>
                            <OrderShortcuts
                                isEditing={editMode}
                                onToggleEdit={toggleEditMode}
                                onSave={handleSaveOrder}
                                onRestore={handleRestoreOrder}
                                disabled={loading}
                            />
                        </div>
                    </div>
                </div>

                {/* CONTEÚDO PRINCIPAL */}
                {showConfig ? (
                    <ConfiguracoesContent
                        onBack={() => setShowConfig(false)}
                        bgMode={bgMode}
                        setBgMode={setBgMode}
                        customBgUrl={customBgUrl}
                        setCustomBgUrl={setCustomBgUrl}
                    />
                ) : (
                    <div className="mt-6 px-4 md:px-6">
                        {editMode ? (
                            <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                                <SortableContext items={sections} strategy={verticalListSortingStrategy}>
                                    <div className="space-y-6">
                                        {sections.map((sectionId) => {
                                            const section = renderSection(sectionId)
                                            if (!section) return null
                                            return (
                                                <SortableSection key={sectionId} id={sectionId}>
                                                    {section}
                                                </SortableSection>
                                            )
                                        })}
                                    </div>
                                </SortableContext>
                            </DndContext>
                        ) : (
                            <div className="space-y-6">
                                {sections.map((sectionId) => {
                                    const section = renderSection(sectionId)
                                    if (!section) return null
                                    return <div key={sectionId}>{section}</div>
                                })}
                            </div>
                        )}
                    </div>
                )}
            </main>
        </div>
    )
}