// app/(main)/inicio/page.tsx
'use client'

import { useState } from 'react'
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
import OrderSection from '@/components/OrderSection'
import SearchResultsSection from '@/components/SearchResultsSection' // nova seção
import Header from '../Header'

const DEFAULT_SECTIONS = [
    'categorias',
    'transporte',
    'motorista',
    'promocoes',
    'compromissosPessoal',
    'compromissosLoja',
    'orderSection',
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
    const [searchQuery, setSearchQuery] = useState('')

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
            case 'orderSection':
                return (
                    <OrderSection
                        isEditing={editMode}
                        onToggleEdit={toggleEditMode}
                        onSave={handleSaveOrder}
                        onRestore={handleRestoreOrder}
                        disabled={loading}
                    />
                )
            case 'categorias':
                // Se houver busca, mostra resultados; senão, grade normal
                return searchQuery.trim() ? (
                    <SearchResultsSection searchQuery={searchQuery} />
                ) : (
                    <CategoriasSection />
                )
            case 'transporte':
                return <TransporteSection />
            case 'motorista':
                return <MotoristaSection />
            case 'promocoes':
                return <PromocoesSection />
            case 'compromissosPessoal':
                return <AtalhoCompromissosPessoal profileSlug={profileSlug} />
            case 'compromissosLoja':
                return <AtalhoCompromissosDaLoja profileSlug={profileSlug} />
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
            icon: User as React.ComponentType<{ size?: number }>,
            imageUrl: avatarUrl,
            onClick: handleAvatarClick,
            isActive: !showConfig,
        },
        {
            id: 'config',
            label: 'Configurações',
            icon: Settings as React.ComponentType<{ size?: number }>,
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
                <Header
                    title={showConfig ? 'Configurações' : 'iUser'}
                    showBack={showConfig}
                    onBack={() => setShowConfig(false)}
                    greeting={`Olá, ${loading ? '...' : profileSlug ? `@${profileSlug}` : 'Visitante'}`}
                    avatarUrl={avatarUrl}
                    loading={loading}
                    tabs={showConfig ? undefined : tabs}
                    showSearch={!showConfig}
                    searchPlaceholder="Buscar restaurantes, mercados..."
                    onSearch={setSearchQuery}
                />

                {showConfig ? (
                    <ConfiguracoesContent
                        onBack={() => setShowConfig(false)}
                        bgMode={bgMode}
                        setBgMode={setBgMode}
                        customBgUrl={customBgUrl}
                        setCustomBgUrl={setCustomBgUrl}
                    />
                ) : (
                    <div className="mt-2 px-4 md:px-6">
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