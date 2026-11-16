//src/app/(main)/[ownerSlug]/OwnerClientPage.tsx

'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import OwnerSkeleton, { rememberOwnerType } from '@/components/v3/OwnerSkeleton'
import { useTheme } from '@/app/contexts/theme'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import { useProfile } from '@/app/contexts/ProfileContext'
import Header from '@/components/Header'
import { Profile } from './Profile'
import { Store } from './Store'
import { usePublicationsStore } from '@/store/usePublicationStore'
import { PublicationsListView } from './PublicationsListView'
import { captureReferral } from '@/lib/referralCapture'
import { useMaintenance } from '@/components/MaintenanceNotice'

type OwnerType = 'profile' | 'store'

// Falha de consulta (cota/queda do Supabase) — diferente de "o perfil não existe"
const LOAD_FAILED = 'LOAD_FAILED'

export default function OwnerClientPage() {
    const params = useParams()
    const router = useRouter()
    const searchParams = useSearchParams()
    const { colors } = useTheme()
    const {
        userId,
        bgMode,
        customBgUrl,
        profileSlug: loggedUserSlug,
        avatarUrl: loggedUserAvatarUrl,
        loading: profileLoading
    } = useProfile()
    const publicationsStore = usePublicationsStore()

    const ownerSlug = Array.isArray(params.ownerSlug) ? params.ownerSlug[0] : params.ownerSlug

    const [loading, setLoading] = useState(true)
    const [ownerType, setOwnerType] = useState<OwnerType | null>(null)
    const [, setOwnerId] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [loadFailed, setLoadFailed] = useState(false)
    const maintenance = useMaintenance()
    // quando o Supabase volta (aviso de manutenção desliga), recarrega a página que não conseguiu abrir
    const wasMaintenance = useRef(false)
    useEffect(() => {
        if (maintenance) wasMaintenance.current = true
        else if (wasMaintenance.current && loadFailed) window.location.reload()
    }, [maintenance, loadFailed])
    const [showPublications, setShowPublications] = useState(false)

    // ========== FUNÇÃO PARA ABRIR PUBLICAÇÕES ==========
    const handleOpenPublications = useCallback((publications: any[], initialIndex: number, storeSlug: string) => {
        // Definir as publicações na store antes de abrir
        publicationsStore.setPublicationFeed(publications, initialIndex, undefined, storeSlug)

        // Abrir o overlay de publicações
        setShowPublications(true)
    }, [publicationsStore])

    // ========== DETECTAR OWNER ==========
    const detectOwnerType = async (slug: string) => {
        if (!slug) return null

        // Tenta encontrar como perfil
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('id')
            .eq('profileSlug', slug)
            .maybeSingle()

        if (profile && !profileError) {
            return { type: 'profile' as OwnerType, id: profile.id, ownerProfileId: profile.id }
        }

        // Tenta encontrar como loja
        const { data: store, error: storeError } = await supabase
            .from('stores')
            .select('id, owner_id')
            .eq('storeSlug', slug)
            .maybeSingle()

        if (store && !storeError) {
            return { type: 'store' as OwnerType, id: store.id, ownerProfileId: store.owner_id as string | null }
        }

        // Consulta com ERRO (402 da cota, queda) não é "não existe": sinaliza falha de carga para mostrar o aviso de manutenção
        if (profileError || storeError) throw new Error(LOAD_FAILED)

        return null
    }


    const closePublications = () => {
        setShowPublications(false)
        router.replace(`/${ownerSlug}`, { scroll: false })
    }

    // ========== CARREGAR DADOS ==========
    const [referralOwnerProfileId, setReferralOwnerProfileId] = useState<string | null>(null)

    useEffect(() => {
        const loadOwner = async () => {
            if (!ownerSlug) {
                setError('Parâmetro inválido')
                setLoading(false)
                return
            }

            setLoading(true)
            setError(null)

            try {
                const result = await detectOwnerType(ownerSlug)
                if (!result) {
                    setError('Perfil ou loja não encontrado')
                    setLoading(false)
                    return
                }

                setOwnerType(result.type)
                rememberOwnerType(ownerSlug, result.type)
                setOwnerId(result.id)
                setReferralOwnerProfileId(result.ownerProfileId)
            } catch (err: any) {
                console.error('Erro ao detectar owner:', err)
                if (err?.message === LOAD_FAILED) setLoadFailed(true)
                setError(err.message || 'Erro ao carregar página')
            } finally {
                setLoading(false)
            }
        }

        loadOwner()
    }, [ownerSlug])

    // Qualquer link de loja/perfil compartilhado vale como convite:
    // visitante ainda não logado vira indicado do dono desta página se
    // se cadastrar depois.
    useEffect(() => {
        if (!referralOwnerProfileId || userId || profileLoading) return
        captureReferral(supabase, { ownerId: referralOwnerProfileId })
    }, [referralOwnerProfileId, userId, profileLoading])

    // ========== LINK ANTIGO DO PAINEL (ex.: aviso de pedido novo: /<loja>?dashboard=pedidos) → a página de pedidos da loja ==========
    useEffect(() => {
        if (ownerType === 'store' && searchParams.get('dashboard') === 'pedidos') router.replace(`/painel-loja/${ownerSlug}/pedidos`)
    }, [ownerType, ownerSlug, searchParams, router])

    // ========== RENDER ==========
    if (loading) {
        // esqueleto da página (em vez de "Carregando..."): a forma da loja já aparece e o conteúdo entra no lugar
        return (
            <div className="min-h-screen" style={{ background: colors.background }}>
                <OwnerSkeleton />
            </div>
        )
    }

    if (loadFailed || (maintenance && (error || !ownerType))) {
        return (
            <div className="min-h-screen flex items-center justify-center px-4" style={{ background: colors.background }}>
                <div className="flex flex-col items-center gap-4 max-w-sm text-center">
                    <div className="text-6xl">🔧</div>
                    <h2 className="text-2xl font-black" style={{ color: colors.textPrimary }}>O iUser está em manutenção</h2>
                    <p className="text-sm" style={{ color: colors.textSecondary }}>
                        Não conseguimos carregar esta página agora. Estamos atualizando o servidor e o design do app: voltamos já, com novidades!
                    </p>
                    <button
                        onClick={() => window.location.reload()}
                        className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition hover:scale-105"
                        style={{ background: colors.accent, color: '#fff' }}
                    >
                        Tentar de novo
                    </button>
                    <button onClick={() => router.push('/')} className="text-sm font-bold underline" style={{ color: colors.textSecondary }}>
                        Voltar ao início
                    </button>
                </div>
            </div>
        )
    }

    if (error || !ownerType || !ownerSlug) {
        return (
            <div className="min-h-screen flex items-center justify-center px-4" style={{ background: colors.background }}>
                <div className="flex flex-col items-center gap-4 max-w-sm text-center">
                    <div className="text-6xl">🔍</div>
                    <h2 className="text-2xl font-black" style={{ color: colors.textPrimary }}>
                        {error || 'Não encontrado'}
                    </h2>
                    <p className="text-sm" style={{ color: colors.textSecondary }}>
                        O perfil ou loja que você está procurando não existe.
                    </p>
                    <button
                        onClick={() => router.push('/')}
                        className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition hover:scale-105"
                        style={{ background: colors.accent, color: '#fff' }}
                    >
                        Voltar ao início
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="relative min-h-dvh" style={{ background: colors.background }}>
            {/* Background animado */}
            <div className="fixed inset-0 z-0">
                <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
            </div>

            {/* Conteúdo principal com z-index */}
            <main className="relative z-10 min-h-dvh pb-28" style={{ overscrollBehavior: 'none' }}>
                <Header
                    title="iUser"
                    // na página de uma loja o voltar fica na mesma linha do logo e do nome, dentro do cabeçalho da loja
                    showBack={!(ownerType === 'store' && !showPublications)}
                    onBack={showPublications ? closePublications : () => (window.history.length > 1 ? router.back() : router.push('/'))}
                    tabs={[]}
                    showSearch={false}
                    searchPlaceholder="Buscar..."
                    onSearch={() => { }}
                />

                {/* ===== RENDERIZAR CONTEÚDO ===== */}
                {showPublications ? (
                    <PublicationsListView
                        ownerSlug={ownerSlug}
                        storeSlug={ownerType === 'store' ? ownerSlug : undefined}
                        onClose={closePublications}
                    />
                ) : ownerType === 'profile' ? (
                    <Profile
                        ownerSlug={ownerSlug}
                        colors={colors}
                        bgMode={bgMode}
                        customBgUrl={customBgUrl}
                        loggedUserSlug={loggedUserSlug}
                    />
                ) : (
                    <Store
                        ownerSlug={ownerSlug}
                        colors={colors}
                        bgMode={bgMode}
                        customBgUrl={customBgUrl}
                        loggedUserSlug={loggedUserSlug}
                        onOpenPublications={handleOpenPublications}
                    />
                )}
            </main>
        </div>
    )
}