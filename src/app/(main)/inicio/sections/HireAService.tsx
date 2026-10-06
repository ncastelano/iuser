// src/app/(main)/inicio/sections/HireAService.tsx
'use client'

import { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useNavProgressStore } from '@/store/useNavProgressStore'
import { Wrench, Megaphone, Search } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import MyOpenServiceRequests from '@/components/MyOpenServiceRequests'
import { HomeGlassCard, HomeSectionHeader, HOME_GRADIENT } from './HomeSectionKit'
import FeaturedServices from './FeaturedServices'

// ===== GRADIENTE FIXO LARANJA-VERMELHO =====
const GRADIENT = HOME_GRADIENT

interface HireAServiceProps {
    dragHandle?: ReactNode
}

export default function HireAService({ dragHandle }: HireAServiceProps) {
    const { colors } = useTheme()
    const router = useRouter()
    const startNavProgress = useNavProgressStore((s) => s.start)
    const { profileSlug } = useProfile()

    const buttonStyle = {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
        padding: '0.625rem 1.25rem',
        borderRadius: '9999px',
        fontSize: '0.875rem',
        fontWeight: 700,
        transition: 'all 0.2s',
        background: GRADIENT,
        color: '#ffffff',
        border: 'none',
        boxShadow: `0 4px 12px #f9731640`,
        cursor: 'pointer',
        whiteSpace: 'nowrap' as const,
    }

    const outlineButtonStyle = {
        ...buttonStyle,
        background: 'transparent',
        color: colors.accent,
        border: `2px solid ${colors.accent}`,
        boxShadow: 'none',
    }

    // Publicar leva pra /meus-servicos — página dedicada que junta os serviços
    // da(s) loja(s) da pessoa com os pessoais. Sem perfil ainda, manda pro login.
    const goPublish = () => {
        startNavProgress()
        router.push(profileSlug ? '/meus-servicos' : '/login')
    }

    return (
        <section>
            <HomeGlassCard className="p-5 sm:p-6 relative">
                <HomeSectionHeader
                    icon={Wrench}
                    title="Serviços"
                    subtitle="Precise de ajuda ou ganhe fazendo o que você sabe"
                    dragHandle={dragHandle}
                    action={<span />}
                />

                <div className="flex flex-row flex-wrap gap-2">
                    <button
                        onClick={() => { startNavProgress(); router.push('/solicitar-servico') }}
                        className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-full font-bold text-sm transition-all shadow-lg hover:scale-105 active:scale-95"
                        style={buttonStyle}
                    >
                        <Search size={16} />
                        ver todos os serviços
                    </button>
                    <button
                        onClick={goPublish}
                        className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-full font-bold text-sm transition-all hover:scale-105 active:scale-95"
                        style={outlineButtonStyle}
                    >
                        <Megaphone size={16} />
                        publicar meu serviço
                    </button>
                </div>

                {/* Pedidos de serviço que a própria pessoa fez, com quem se candidatou */}
                <div className="mt-5">
                    <MyOpenServiceRequests limit={3} title="Seus pedidos em aberto" />
                </div>

                {/* Serviços que profissionais e lojas já oferecem */}
                <div className="mt-6">
                    <FeaturedServices title="Quem já oferece serviço" />
                </div>
            </HomeGlassCard>
        </section>
    )
}
