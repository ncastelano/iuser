// app/(main)/meus-servicos/page.tsx
//
// "Meus serviços publicados" — pra onde o botão "publicar serviço" da home
// (OfferAService.tsx) leva. Junta numa página só os dois tipos de serviço
// que a pessoa pode ter: os que uma loja dela vende (products.type=
// 'service', com store_id) e os pessoais/freelance (ProfileServiceListing,
// products.listing_type='service_offer', sem loja). Antes disso não
// existia — "publicar" mandava pro perfil e só mostrava a parte pessoal.
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { Spinner } from '@/components/Spinner'
import { ArrowLeft } from 'lucide-react'
import MyServicesBoard from '@/components/ProfileDashboard/MyServicesBoard'
import MyOpenServiceRequests from '@/components/MyOpenServiceRequests'

export default function MeusServicosPage() {
    const { colors } = useTheme()
    const router = useRouter()
    const { userId, profileSlug, loading: profileLoading } = useProfile()

    useEffect(() => {
        if (!profileLoading && !userId) router.replace('/login')
    }, [profileLoading, userId, router])

    if (profileLoading || !userId) {
        return (
            <div className="min-h-dvh flex items-center justify-center" style={{ background: colors.background }}>
                <Spinner size={32} color={colors.accent} />
            </div>
        )
    }

    return (
        <div className="min-h-dvh px-4 py-6" style={{ background: colors.background }}>
            <div className="max-w-2xl mx-auto flex flex-col gap-5">
                <button
                    onClick={() => router.back()}
                    className="flex items-center gap-1.5 text-sm font-bold w-fit"
                    style={{ color: colors.textSecondary }}
                >
                    <ArrowLeft size={16} /> Voltar
                </button>

                {/* ===== Pedidos de serviço que eu fiz (mesmos cards de "Seus pedidos em aberto" da home) ===== */}
                <MyOpenServiceRequests limit={30} title="Seus pedidos em aberto" />

                <div>
                    <h1 className="text-xl font-black" style={{ color: colors.textPrimary }}>Meus serviços publicados</h1>
                    <p className="text-sm mt-1" style={{ color: colors.textSecondary }}>
                        Os serviços das suas lojas (o valor é opcional) e os do seu perfil (sem valor: o cliente combina com você).
                    </p>
                </div>

                <MyServicesBoard profileId={userId} profileSlug={profileSlug || ''} linkToProfile />
            </div>
        </div>
    )
}
