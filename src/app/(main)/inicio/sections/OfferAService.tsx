// src/app/(main)/inicio/sections/OfferAService.tsx
//
// Card da home "Quem já oferece serviço": vitrine dos serviços que
// profissionais e lojas já publicaram, com o total no botão "ver serviços" e
// o atalho "Oferecer um serviço" pra quem quer publicar o seu.
'use client'

import { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Megaphone } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { useNavProgressStore } from '@/store/useNavProgressStore'
import { HomeGlassCard } from './HomeSectionKit'
import FeaturedServices from './FeaturedServices'

interface OfferAServiceProps {
    dragHandle?: ReactNode
}

export default function OfferAService({ dragHandle }: OfferAServiceProps) {
    const { colors } = useTheme()
    const router = useRouter()
    const startNavProgress = useNavProgressStore((s) => s.start)
    const { profileSlug } = useProfile()

    // Publicar leva pra /meus-servicos — página dedicada que junta os serviços
    // da(s) loja(s) da pessoa com os pessoais. Sem perfil ainda, manda pro login.
    const goPublish = () => {
        startNavProgress()
        router.push(profileSlug ? '/meus-servicos' : '/login')
    }

    return (
        <section>
            <HomeGlassCard className="p-5 sm:p-6 relative">
                <FeaturedServices
                    title="Quem já oferece serviço"
                    subtitle="Profissionais e lojas prontos para te atender"
                    dragHandle={dragHandle}
                    onViewAll={() => { startNavProgress(); router.push('/solicitar-servico') }}
                />
                <button
                    onClick={goPublish}
                    className="mt-3 w-full flex items-center justify-center gap-2 py-3 rounded-full font-black text-sm transition-all hover:scale-[1.02] active:scale-95"
                    style={{ background: 'transparent', color: colors.accent, border: `2px solid ${colors.accent}` }}
                >
                    <Megaphone size={16} />
                    Oferecer um serviço
                </button>
            </HomeGlassCard>
        </section>
    )
}
