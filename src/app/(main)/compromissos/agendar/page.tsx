// app/(main)/compromissos/agendar/page.tsx
'use client'

import { useState, useEffect, useMemo } from 'react'
import { Store, User, Lock, CalendarDays } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTheme } from '@/app/theme'
import Header from '../../../Header'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import { supabase } from '@/lib/supabase/client'
import CriarCompromissoLoja from './CriarCompromissoLoja'
import CriarCompromissoComAlguem from './CriarCompromissoComAlguem'
import CriarCompromissoPessoal from './CriarCompromissoPessoal'
import CriarEvento from './CriarEvento'

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
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user) {
                const uid = session.user.id
                // Busca perfil
                supabase
                    .from('profiles')
                    .select('avatar_url, profileSlug, background_mode, background_image_url')
                    .eq('id', uid)
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
                    .eq('owner_id', uid)
                    .neq('name', 'Meus compromissos')
                    .then(({ data }) => {
                        if (data) setMyStores(data)
                    })
            }
        })
    }, [])

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

    const hexToRgb = (hex: string) => {
        const clean = hex.replace('#', '')
        const bigint = parseInt(clean, 16)
        return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 }
    }

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

                <div style={{ padding: '20px 20px 0' }}>
                    <div style={{ marginTop: 24, ...cardStyle, borderRadius: 28, padding: 28 }}>
                        <h3 style={{ fontWeight: 800, fontSize: 22, color: colors.textPrimary, marginBottom: 24, textAlign: 'center' }}>
                            Escolha o tipo
                        </h3>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {!isStore ? (
                                <>
                                    {/* Opções para perfil pessoal */}
                                    <OptionButton
                                        icon={<Store size={24} />}
                                        title="Agendar em loja"
                                        description="Barbearia, clínica, restaurante..."
                                        color={colors.accent}
                                        onClick={() => setActiveFlow('loja')}
                                        colors={colors}
                                    />
                                    <OptionButton
                                        icon={<User size={24} />}
                                        title="Convidar pessoa"
                                        description="Amigo, colega, profissional..."
                                        color="#7c3aed"
                                        onClick={() => setActiveFlow('com-alguem')}
                                        colors={colors}
                                    />
                                    <OptionButton
                                        icon={<Lock size={24} />}
                                        title="Somente eu"
                                        description="Compromisso pessoal e privado"
                                        color="#10b981"
                                        onClick={() => setActiveFlow('pessoal')}
                                        colors={colors}
                                    />
                                    <OptionButton
                                        icon={<CalendarDays size={24} />}
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
                                        icon={<User size={24} />}
                                        title="Convidar perfis"
                                        description="Envie convites para clientes ou parceiros"
                                        color={colors.accent}
                                        onClick={() => setActiveFlow('convite-loja')}
                                        colors={colors}
                                    />
                                    <OptionButton
                                        icon={<CalendarDays size={24} />}
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
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                padding: 18,
                borderRadius: 20,
                border: `1px solid ${colors.border}`,
                background: `rgba(0,0,0,0.2)`,
                backdropFilter: 'blur(10px)',
                cursor: 'pointer',
                textAlign: 'left',
                color: colors.textPrimary,
                transition: 'all 0.2s',
            }}
        >
            <div
                style={{
                    width: 48,
                    height: 48,
                    borderRadius: 14,
                    background: `linear-gradient(135deg, ${color}, ${color}dd)`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                }}
            >
                {icon}
            </div>
            <div>
                <p style={{ fontWeight: 700, fontSize: 17, margin: 0 }}>{title}</p>
                <p style={{ color: colors.textSecondary, fontSize: 14, margin: '4px 0 0' }}>{description}</p>
            </div>
        </button>
    )
}