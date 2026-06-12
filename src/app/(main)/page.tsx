// src/app/(main)/inicio/page.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
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

export default function HomePage() {
    const router = useRouter()
    const [sections, setSections] = useState([
        'categorias',
        'transporte',
        'motorista',
        'promocoes',
        'compromissosPessoal',
        'compromissosLoja',
    ])

    const [session, setSession] = useState<any>(null)
    const [profileSlug, setProfileSlug] = useState<string | null>(null)
    const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null)

    const [showConfig, setShowConfig] = useState(false)

    // Fundo preto como padrão, sem opção branca
    const [bgMode, setBgMode] = useState<'animated' | 'black' | 'custom'>('black')
    const [customBgUrl, setCustomBgUrl] = useState<string | null>(null)

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
        try {
            // Tenta buscar todos os campos (inclusive os de fundo, se existirem)
            const { data } = await supabase
                .from('profiles')
                .select(`profileSlug, avatar_url, background_mode, background_image_url`)
                .eq('id', userId)
                .single()

            if (data) {
                setProfileSlug(data.profileSlug)
                setUserAvatarUrl(data.avatar_url || null)

                // Só atualiza fundo se as propriedades existirem no objeto (coluna presente)
                if ('background_mode' in data) {
                    setBgMode(data.background_mode)
                }
                if ('background_image_url' in data) {
                    setCustomBgUrl(data.background_image_url)
                }
            }
        } catch (error) {
            // Fallback: se deu erro (ex.: coluna inexistente), busca apenas os campos antigos
            console.warn('Erro ao buscar perfil com fundo, tentando fallback:', error)
            const { data } = await supabase
                .from('profiles')
                .select('profileSlug, avatar_url')
                .eq('id', userId)
                .single()

            if (data) {
                setProfileSlug(data.profileSlug)
                setUserAvatarUrl(data.avatar_url || null)
                // Mantém bgMode e customBgUrl com os valores padrão (preto, sem imagem)
            }
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
            case 'compromissosPessoal':
                return <AtalhoCompromissosPessoal profileSlug={profileSlug} />
            case 'compromissosLoja':
                return <AtalhoCompromissosDaLoja />
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

    const getPublicUrl = (path: string | null | undefined, bucket: string): string | null => {
        if (!path) return null
        if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('/')) return path
        const { data } = supabase.storage.from(bucket).getPublicUrl(path)
        return data?.publicUrl || null
    }

    const avatarUrl = getPublicUrl(userAvatarUrl, 'avatars')

    const tabs = [
        {
            id: 'perfil',
            label: session ? (profileSlug ? `@${profileSlug}` : 'Perfil') : 'Entrar',
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
        <div className="relative min-h-dvh" style={{ background: '#000' }}>
            <div className="fixed inset-0 z-0">
                <AnimatedBackgroundiUser
                    bgMode={bgMode}
                    customBgUrl={customBgUrl}
                />
            </div>

            <main className="relative z-10 min-h-dvh" style={{ overscrollBehavior: 'none' }}>
                <div
                    style={{
                        background: 'linear-gradient(135deg, #000000ff, #000000)',
                        padding: '20px 24px',
                        color: '#ffffff',
                        borderBottomLeftRadius: 36,
                        borderBottomRightRadius: 36,
                        boxShadow: '0 10px 40px rgba(255,255,255,0.25)',
                        position: 'sticky',
                        top: 0,
                        zIndex: 20,
                        overflow: 'hidden',
                    }}
                >
                    <div
                        style={{
                            position: 'absolute',
                            right: -20,
                            top: -20,
                            opacity: 0.4,
                            transform: 'rotate(10deg)',
                            maskImage: 'radial-gradient(ellipse at center, rgba(0,0,0,0.8) 30%, rgba(0,0,0,0) 70%)',
                            WebkitMaskImage: 'radial-gradient(ellipse at center, rgba(0,0,0,0.8) 30%, rgba(0,0,0,0) 70%)',
                        }}
                    >
                        {avatarUrl ? (
                            <img src={avatarUrl} alt="" style={{ width: 280, height: 280, objectFit: 'cover' }} />
                        ) : (
                            <img src="/logotransparente.png" alt="Logo" style={{ width: 280, height: 280, objectFit: 'contain' }} />
                        )}
                    </div>
                    <div className="relative z-10">
                        {/* Cabeçalho condicional */}
                        <div className="flex items-center gap-3 mb-1">
                            {showConfig ? (
                                // Modo Configurações: botão de voltar e título
                                <>
                                    <button
                                        onClick={() => setShowConfig(false)}
                                        className="w-10 h-10 rounded-full flex items-center justify-center"
                                        style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(10px)', border: 'none', cursor: 'pointer' }}
                                    >
                                        <ArrowLeft size={20} color="#fff" />
                                    </button>
                                    <h2 className="text-lg font-semibold opacity-90">Configurações</h2>
                                </>
                            ) : (
                                // Modo normal: logo e nome do app
                                <>
                                    <button
                                        onClick={() => router.back()}
                                        className="w-10 h-10 rounded-full flex items-center justify-center"
                                        style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(10px)', border: 'none', cursor: 'pointer' }}
                                    >
                                        <img src="/logo.png" alt="Logo" className="w-6 h-6 object-contain" />
                                    </button>
                                    <h2 className="text-lg font-semibold opacity-90">iUser</h2>
                                </>
                            )}
                        </div>

                        <h1 className="text-3xl font-extrabold mt-2 tracking-tight">
                            Olá, {session ? (profileSlug ? `@${profileSlug}` : 'Visitante') : 'Visitante'}
                        </h1>
                        <div className="flex gap-2 mt-5 overflow-x-auto pb-1">
                            {tabs.map((tab) => {
                                // Esconde o botão "Configurações" quando já estiver nela
                                if (tab.id === 'config' && showConfig) return null
                                return (
                                    <button
                                        key={tab.id}
                                        onClick={tab.onClick}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold transition-all duration-200 whitespace-nowrap"
                                        style={{
                                            background: tab.isActive ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.08)',
                                            backdropFilter: 'blur(10px)',
                                        }}
                                    >
                                        {tab.imageUrl ? <img src={tab.imageUrl} alt="" className="w-5 h-5 rounded-full object-cover" /> : <tab.icon size={16} />}
                                        <span>{tab.label}</span>
                                    </button>
                                )
                            })}
                        </div>
                        <div className="mt-4 flex items-center gap-2.5 px-4 py-3 rounded-2xl text-sm" style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(10px)' }}>
                            <Search size={18} className="opacity-70" />
                            <span className="opacity-70">Buscar restaurantes, mercados...</span>
                        </div>
                    </div>
                </div>

                {showConfig ? (
                    <ConfiguracoesContent
                        onBack={() => setShowConfig(false)}
                        bgMode={bgMode}
                        setBgMode={setBgMode}
                        customBgUrl={customBgUrl}
                        setCustomBgUrl={setCustomBgUrl}
                    />
                ) : (
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
                )}
            </main>
        </div>
    )
}