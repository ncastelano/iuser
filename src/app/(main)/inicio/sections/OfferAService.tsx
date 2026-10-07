// src/app/(main)/inicio/sections/OfferAService.tsx
//
// Seção da home "Quem já oferece serviço": vitrine dos serviços que
// profissionais e lojas já publicaram, sem card em volta (tudo flutuante), com o "ver serviços" (badge com o total)
// ao lado do atalho "Oferecer um serviço" pra quem quer publicar o seu.
'use client'

import { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Megaphone } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { useNavProgressStore } from '@/store/useNavProgressStore'
import { ViewServicesButton } from './ViewServicesButton'
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
            <FeaturedServices
                title="Quem já oferece serviço"
                subtitle="Profissionais e lojas prontos para te atender"
                hideIcon
                dragHandle={dragHandle}
                footer={(count) => (
                    <div className="flex gap-2">
                        <ViewServicesButton onClick={() => { startNavProgress(); router.push('/solicitar-servico') }} count={count} />
                        <button
                            onClick={goPublish}
                            className="flex-1 flex items-center justify-center gap-2 py-2 rounded-full font-black text-xs transition-all hover:scale-[1.02] active:scale-95"
                            style={{ background: 'transparent', color: colors.accent, border: `2px solid ${colors.accent}` }}
                        >
                            <Megaphone size={14} />
                            Oferecer um serviço
                        </button>
                    </div>
                )}
            />
        </section>
    )
}
