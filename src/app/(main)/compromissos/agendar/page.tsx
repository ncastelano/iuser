// app/(main)/compromissos/agendar/page.tsx
'use client'

import { useState, useEffect, useMemo } from 'react'
import { Store, User, Lock, CalendarDays } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTheme } from '@/app/contexts/theme'
import Header from '@/components/Header'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import { supabase } from '@/lib/supabase/client'
import { useProfile } from '@/app/contexts/ProfileContext'
import CriarCompromissoLoja from './CriarCompromissoLoja'
import CriarCompromissoComAlguem from './CriarCompromissoComAlguem'
import CriarCompromissoPessoal from './CriarCompromissoPessoal'
import CriarEvento from './CriarEvento'
import { hexToRgb } from '@/lib/color'

type FlowType =
    | 'none'
    | 'loja'           // agendar em loja (pessoal)
    | 'com-alguem'     // convidar pessoa (pessoal)
    | 'pessoal'        // somente eu (pessoal)
    | 'evento-perfil'  // promover evento (pessoal)
    | 'convite-loja'   // convidar perfis (loja)
    | 'evento-loja'    // promover evento (loja)

export default function AgendarPage() {
    const router = useRouter()
    const { colors } = useTheme()
    const { userId } = useProfile()
    const [activeFlow, setActiveFlow] = useState<FlowType>('none')

    // Estados do fundo
    const [bgMode, setBgMode] = useState<'animated' | 'black' | 'custom'>('black')
    const [customBgUrl, setCustomBgUrl] = useState<string | null>(null)

    // Dados do usuário
    const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null)
    const [userProfileSlug, setUserProfileSlug] = useState<string | null>(null)
    const [myStores, setMyStores] = useState<any[]>([])
    const [activeTab, setActiveTab] = useState<string>('pessoal') // 'pessoal' ou id da loja

    useEffect(() => {
        if (!userId) return
        // Busca perfil
        supabase
            .from('profiles')
            .select('avatar_url, profileSlug, background_mode, background_image_url')
            .eq('id', userId)
            .single()
            .then(({ data }) => {
                if (data) {
                    if (data.avatar_url) setUserAvatarUrl(data.avatar_url)
                    if (data.profileSlug) setUserProfileSlug(data.profileSlug)
                    if (data.background_mode) setBgMode(data.background_mode)
                    if (data.background_image_url) setCustomBgUrl(data.background_image_url)
                }
            })
        // Busca lojas
        supabase
            .from('stores')
            .select('id, name, storeSlug, logo_url')
            .eq('owner_id', userId)
            .neq('name', 'Meus compromissos')
            .then(({ data }) => {
                if (data) setMyStores(data)
            })
    }, [userId])

    // Helper para obter URL pública de avatar/logo
    const getPublicUrl = (path: string | null, bucket: 'avatars' | 'store-logos') => {
        if (!path) return null
        if (path.startsWith('http')) return path
        const { data } = supabase.storage.from(bucket).getPublicUrl(path)
        return data?.publicUrl || null
    }

    // Abas do header
    const tabs = useMemo(() => {
        const personalTab = {
            id: 'pessoal',
            label: userProfileSlug ? `@${userProfileSlug}` : 'Perfil',
            icon: User as any,
            imageUrl: getPublicUrl(userAvatarUrl, 'avatars'),
        }
        const storeTabs = myStores.map((store) => ({
            id: store.id,
            label: store.name,
            icon: Store as any,
            imageUrl: getPublicUrl(store.logo_url, 'store-logos'),
        }))
        return [personalTab, ...storeTabs]
    }, [userAvatarUrl, userProfileSlug, myStores])

    const handleBack = () => setActiveFlow('none')

    const cardStyle = {
        background: `rgba(${hexToRgb(colors.surface).r}, ${hexToRgb(colors.surface).g}, ${hexToRgb(colors.surface).b}, 0.6)`,
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: `1px solid ${colors.border}`,
        boxShadow: colors.shadow,
    }

    // Se já escolheu um fluxo, renderiza o subcomponente correspondente
    if (activeFlow === 'loja' || activeFlow === 'convite-loja') {
        // Ambos usam CriarCompromissoLoja, passando contexto
        return (
            <CriarCompromissoLoja
                onBack={handleBack}
                context={activeTab === 'pessoal' ? 'pessoal' : 'loja'}
                storeId={activeTab !== 'pessoal' ? activeTab : undefined}
                activeFlow={activeFlow}
                myStores={myStores}
            />
        )
    }
    if (activeFlow === 'com-alguem') {
        return <CriarCompromissoComAlguem onBack={handleBack} context="pessoal" />
    }
    if (activeFlow === 'pessoal') {
        return <CriarCompromissoPessoal onBack={handleBack} context="pessoal" />
    }
    if (activeFlow === 'evento-perfil' || activeFlow === 'evento-loja') {
        return (
            <CriarEvento
                onBack={handleBack}
                context={activeTab === 'pessoal' ? 'pessoal' : 'loja'}
                storeId={activeTab !== 'pessoal' ? activeTab : undefined}
                activeFlow={activeFlow}
                myStores={myStores}
            />
        )
    }

    // Tela de seleção de tipo
    const isStore = activeTab !== 'pessoal'

    return (
        <main style={{ minHeight: '100vh', background: colors.background, paddingBottom: 40, position: 'relative' }}>
            <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />

            <div className="relative z-10">
                <Header
                    title="Agendar"
                    showBack={true}
                    onBack={() => router.back()}
                    greeting="Novo compromisso"
                    avatarUrl={getPublicUrl(userAvatarUrl, 'avatars')}
                    tabs={tabs.map(tab => ({
                        ...tab,
                        onClick: () => {
                            setActiveTab(tab.id)
                            setActiveFlow('none')
                        },
                        isActive: activeTab === tab.id,
                    }))}
                    showSearch={false}
                    onHomeClick={() => router.push('/')}
                />

                <div className="px-5 pt-0">
                    <div className="mt-6 rounded-2xl p-7" style={cardStyle}>
                        <h3 className="text-xs font-black uppercase tracking-widest mb-6" style={{ color: colors.textPrimary }}>
                            Escolha o tipo
                        </h3>

                        <div className="flex flex-col gap-3">
                            {!isStore ? (
                                <>
                                    {/* Opções para perfil pessoal */}
                                    <OptionButton
                                        icon={<Store size={18} />}
                                        title="Agendar em loja"
                                        description="Barbearia, clínica, restaurante..."
                                        color={colors.accent}
                                        onClick={() => setActiveFlow('loja')}
                                        colors={colors}
                                    />
                                    <OptionButton
                                        icon={<User size={18} />}
                                        title="Convidar pessoa"
                                        description="Amigo, colega, profissional..."
                                        color="#7c3aed"
                                        onClick={() => setActiveFlow('com-alguem')}
                                        colors={colors}
                                    />
                                    <OptionButton
                                        icon={<Lock size={18} />}
                                        title="Somente eu"
                                        description="Compromisso pessoal e privado"
                                        color="#10b981"
                                        onClick={() => setActiveFlow('pessoal')}
                                        colors={colors}
                                    />
                                    <OptionButton
                                        icon={<CalendarDays size={18} />}
                                        title="Promover evento"
                                        description="Crie um evento público ou privado"
                                        color="#f59e0b"
                                        onClick={() => setActiveFlow('evento-perfil')}
                                        colors={colors}
                                    />
                                </>
                            ) : (
                                <>
                                    {/* Opções para loja */}
                                    <OptionButton
                                        icon={<User size={18} />}
                                        title="Convidar perfis"
                                        description="Envie convites para clientes ou parceiros"
                                        color={colors.accent}
                                        onClick={() => setActiveFlow('convite-loja')}
                                        colors={colors}
                                    />
                                    <OptionButton
                                        icon={<CalendarDays size={18} />}
                                        title="Promover evento"
                                        description="Divulgue um evento da sua loja"
                                        color="#f59e0b"
                                        onClick={() => setActiveFlow('evento-loja')}
                                        colors={colors}
                                    />
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </main>
    )
}

/* Componente auxiliar para os botões de opção */
function OptionButton({
    icon,
    title,
    description,
    color,
    onClick,
    colors,
}: {
    icon: React.ReactNode
    title: string
    description: string
    color: string
    onClick: () => void
    colors: any
}) {
    return (
        <button
            onClick={onClick}
            className="flex items-center gap-4 p-4 rounded-2xl text-left cursor-pointer transition hover:scale-[1.02] active:scale-95"
            style={{
                border: `1px solid ${colors.border}`,
                background: 'rgba(255,255,255,0.08)',
                color: colors.textPrimary,
            }}
        >
            <div
                className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                style={{
                    background: `linear-gradient(135deg, ${color}, ${color}dd)`,
                    color: '#fff',
                }}
            >
                {icon}
            </div>
            <div>
                <p className="text-sm font-bold m-0">{title}</p>
                <p className="text-xs mt-1 m-0" style={{ color: colors.textSecondary }}>{description}</p>
            </div>
        </button>
    )
}