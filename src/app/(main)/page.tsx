// src/app/(main)/inicio/page.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import AnimatedBackground from '@/components/AnimatedBackground'
import { Search, User, Settings } from 'lucide-react'
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
import AgendamentosSection from './compromissos/AgendamentosSection'
import SortableSection from './inicio/sections/SortableSection'

export default function HomePage() {
    const router = useRouter()
    const [sections, setSections] = useState([
        'categorias',
        'transporte',
        'motorista',
        'promocoes',
        'agendamentos',
    ])

    const [session, setSession] = useState<any>(null)
    const [profileSlug, setProfileSlug] = useState<string | null>(null)
    const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null)

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session)
            if (session?.user) {
                fetchProfile(session.user.id)
            }
        })

        const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session)
            if (session?.user) {
                fetchProfile(session.user.id)
            } else {
                setProfileSlug(null)
                setUserAvatarUrl(null)
            }
        })

        return () => {
            authListener.subscription.unsubscribe()
        }
    }, [])

    const fetchProfile = useCallback(async (userId: string) => {
        const { data } = await supabase
            .from('profiles')
            .select('profileSlug, avatar_url')
            .eq('id', userId)
            .single()
        if (data) {
            setProfileSlug(data.profileSlug)
            setUserAvatarUrl(data.avatar_url || null)
        }
    }, [])

    function handleDragEnd(event: DragEndEvent) {
        const { active, over } = event
        if (!over || active.id === over.id) return
        setSections((items) => {
            const oldIndex = items.indexOf(active.id as string)
            const newIndex = items.indexOf(over.id as string)
            return arrayMove(items, oldIndex, newIndex)
        })
    }

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
            case 'agendamentos':
                return <AgendamentosSection />
            default:
                return null
        }
    }

    const handleAvatarClick = () => {
        if (!session) {
            router.push(`/login?redirect=${encodeURIComponent(window.location.pathname)}`)
        } else if (profileSlug) {
            router.push(`/${profileSlug}`)
        }
    }

    const handleSettingsClick = () => {
        router.push('/configuracoes')
    }

    const avatarInitial = profileSlug ? profileSlug.charAt(0).toUpperCase() : ''

    // Helper para URL pública do avatar
    const getPublicUrl = (path: string | null | undefined, bucket: string): string | null => {
        if (!path) return null
        if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('/')) return path
        const { data } = supabase.storage.from(bucket).getPublicUrl(path)
        return data?.publicUrl || null
    }

    const avatarUrl = getPublicUrl(userAvatarUrl, 'avatars')

    // Abas inspiradas nas do compromissos
    const tabs = [
        {
            id: 'perfil',
            label: session ? (profileSlug ? `@${profileSlug}` : 'Perfil') : 'Entrar',
            icon: User,
            imageUrl: avatarUrl,
            onClick: handleAvatarClick,
        },
        {
            id: 'config',
            label: 'Ajustes',
            icon: Settings,
            imageUrl: null,
            onClick: handleSettingsClick,
        },
    ]

    return (
        <div className="relative min-h-screen">
            <div className="fixed inset-0 z-0">
                <AnimatedBackground />
            </div>

            <main className="relative z-10 min-h-screen pb-24">
                {/* HEADER – IDÊNTICO AO COMPROMISSOS, COM BOTÃO DE VOLTAR COM LOGO */}
                <div
                    style={{
                        background: 'linear-gradient(135deg, #000000ff, #000000)',
                        padding: '20px 24px',
                        color: '#ffffff',
                        borderBottomLeftRadius: 36,
                        borderBottomRightRadius: 36,
                        boxShadow: '0 10px 40px rgba(124,58,237,0.25)',
                        position: 'relative',
                        overflow: 'hidden',
                    }}
                >
                    {/* Imagem decorativa à direita */}
                    <div
                        style={{
                            position: 'absolute',
                            right: -30,
                            top: -30,
                            opacity: 0.35,
                            transform: 'rotate(10deg)',
                            maskImage: 'radial-gradient(ellipse at center, rgba(0,0,0,0.8) 30%, rgba(0,0,0,0) 70%)',
                            WebkitMaskImage: 'radial-gradient(ellipse at center, rgba(0,0,0,0.8) 30%, rgba(0,0,0,0) 70%)',
                        }}
                    >
                        {avatarUrl ? (
                            <img
                                src={avatarUrl}
                                alt=""
                                style={{ width: 360, height: 360, objectFit: 'cover' }}
                            />
                        ) : (
                            <img
                                src="/logotransparente.png"
                                alt="Logo"
                                style={{ width: 360, height: 360, objectFit: 'contain' }}
                            />
                        )}
                    </div>

                    {/* Conteúdo do header */}
                    <div className="relative z-10">
                        {/* Linha superior: botão de voltar com logo + texto "Compromissos" */}
                        <div className="flex items-center gap-3 mb-1">
                            <button
                                onClick={() => router.back()}
                                className="w-10 h-10 rounded-full flex items-center justify-center"
                                style={{
                                    background: 'rgba(255,255,255,0.15)',
                                    backdropFilter: 'blur(10px)',
                                    border: 'none',
                                    cursor: 'pointer',
                                }}
                            >
                                <img
                                    src="/logo.png"
                                    alt="Logo"
                                    className="w-6 h-6 object-contain"
                                />
                            </button>
                            <h2 className="text-lg font-semibold opacity-90">iUser</h2>
                        </div>

                        {/* Título principal (saudação) */}
                        <h1 className="text-3xl font-extrabold mt-2 tracking-tight">
                            Olá, {session ? (profileSlug ? `@${profileSlug}` : 'Visitante') : 'Visitante'}
                        </h1>

                        {/* Abas (perfil e ajustes) */}
                        <div className="flex gap-2 mt-5 overflow-x-auto pb-1">
                            {tabs.map((tab) => (
                                <button
                                    key={tab.id}
                                    onClick={tab.onClick}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold transition-all duration-200 whitespace-nowrap"
                                    style={{
                                        background: 'rgba(255,255,255,0.15)',
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

                        {/* Barra de busca */}
                        <div
                            className="mt-4 flex items-center gap-2.5 px-4 py-3 rounded-2xl text-sm"
                            style={{
                                background: 'rgba(255,255,255,0.15)',
                                backdropFilter: 'blur(10px)',
                            }}
                        >
                            <Search size={18} className="opacity-70" />
                            <span className="opacity-70">Buscar restaurantes, mercados...</span>
                        </div>
                    </div>
                </div>

                {/* Seções arrastáveis */}
                <div>
                    <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                        <SortableContext items={sections} strategy={verticalListSortingStrategy}>
                            <div className="space-y-6 mt-6">
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
                </div>
            </main>
        </div>
    )
}