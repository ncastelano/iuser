// src/app/(main)/inicio/sections/OfferAService.tsx
//
// Seção da home "Quem já oferece serviço": vitrine dos serviços que
// profissionais e lojas já publicaram, sem card em volta (tudo flutuante), 
// "ver serviços" (com o total) no cabeçalho e o botão "Publicar o seu" embaixo, igual ao "Quem procura serviço".
'use client'

import { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useProfile } from '@/app/contexts/ProfileContext'
import { useNavProgressStore } from '@/store/useNavProgressStore'
import { Plus } from 'lucide-react'
import { HOME_GRADIENT } from './HomeSectionKit'
import FeaturedServices from './FeaturedServices'

interface OfferAServiceProps {
    dragHandle?: ReactNode
}

export default function OfferAService({ dragHandle }: OfferAServiceProps) {
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
                onViewAll={() => { startNavProgress(); router.push('/solicitar-servico') }}
            />

            {/* Mesmo botão padrão (laranja → vermelho) do "Peça o seu", fora do carrossel pra ficar sempre à mão */}
            <button
                onClick={goPublish}
                className="mt-3 w-full flex items-center justify-center gap-2 py-3 rounded-full font-black text-sm transition-all hover:scale-[1.02] active:scale-95"
                style={{ background: HOME_GRADIENT, color: '#fff', boxShadow: '0 4px 12px #f9731640' }}
            >
                <Plus size={16} />
                Tem um serviço? Publique o seu
            </button>
        </section>
    )
}
