// components/FeaturedProfiles.tsx
'use client'

import { useState, useEffect, useMemo, ReactNode } from 'react'
import { ViewServicesButton } from './ViewServicesButton'
import { useTheme } from '@/app/contexts/theme'
import { useRouter } from 'next/navigation'
import { useNavProgressStore } from '@/store/useNavProgressStore'
import { supabase } from '@/lib/supabase/client'
import { getAvatarUrl } from '@/lib/avatar'
import { HomeSectionHeader } from './HomeSectionKit'

// ===== GRADIENTE FIXO LARANJA-VERMELHO =====
const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

// ---------- Tipos ----------
interface ProfileCard {
    id: string
    slug: string
    name: string
    avatarUrl: string | null
}

// ---------- Props ----------
interface FeaturedProfilesProps {
    dragHandle?: ReactNode
    title?: string
    maxItems?: number
    className?: string
    onProfileClick?: (profileId: string, slug: string) => void
}

// ---------- Hook de dados ----------
function useFeaturedProfiles() {
    const [profiles, setProfiles] = useState<ProfileCard[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchProfiles = async () => {
            setLoading(true)
            try {
                const { data, error } = await supabase
                    .from('profiles')
                    .select('id, name, avatar_url, "profileSlug"')
                    .eq('is_active', true)
                    .not('profileSlug', 'is', null)
                    // Do mais novo que entrou pro mais antigo, da esquerda pra direita
                    .order('created_at', { ascending: false })
                    .limit(30)

                if (error) {
                    console.error('[FeaturedProfiles] Erro ao buscar perfis:', error)
                    setLoading(false)
                    return
                }

                if (!data || data.length === 0) {
                    setProfiles([])
                    setLoading(false)
                    return
                }

                const cards: ProfileCard[] = data.map((p: any) => ({
                    id: p.id,
                    slug: p.profileSlug || p.id,
                    name: p.name || 'Usuário',
                    avatarUrl: p.avatar_url ? (getAvatarUrl(supabase, p.avatar_url) || null) : null,
                }))

                setProfiles(cards)
            } catch (error) {
                console.error('[FeaturedProfiles] Erro inesperado:', error)
            } finally {
                setLoading(false)
            }
        }

        fetchProfiles()
    }, [])

    return { profiles, loading }
}

// ---------- Componente Principal ----------
// Fileira horizontal de avatares redondos, igual ao "Pessoas" do
// /modelodehomepage — trocou o grid paginado por scroll lateral direto,
// mais simples de navegar no celular (é só arrastar o dedo).
export default function FeaturedProfiles({
    dragHandle,
    title = 'Pessoas em destaque',
    maxItems,
    className = '',
    onProfileClick,
}: FeaturedProfilesProps) {
    const router = useRouter()
    const startNavProgress = useNavProgressStore((s) => s.start)
    const { colors } = useTheme()

    const { profiles, loading } = useFeaturedProfiles()

    const displayProfiles = useMemo(() => {
        return maxItems && profiles.length > maxItems
            ? profiles.slice(0, maxItems)
            : profiles
    }, [profiles, maxItems])

    const hasProfiles = displayProfiles.length > 0

    const handleProfileClick = (profile: ProfileCard) => {
        if (onProfileClick) {
            onProfileClick(profile.id, profile.slug)
            return
        }
        startNavProgress()
        router.push(`/${profile.slug}`)
    }

    const handleViewAll = () => {
        startNavProgress()
        router.push('/social')
    }

    // ===== LOADING =====
    if (loading) {
        return (
            <div className={`w-full ${className}`}>
                <div className="flex items-center gap-2 mb-4">
                    {dragHandle}
                    <div className="h-6 rounded w-48 animate-pulse" style={{ background: `${colors.border}60` }} />
                </div>
                <div className="flex gap-3 overflow-hidden">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="w-24 flex-shrink-0 flex flex-col items-center gap-2">
                            <div className="w-20 h-20 rounded-full animate-pulse" style={{ background: `${colors.border}40` }} />
                            <div className="h-2.5 w-16 rounded-full animate-pulse" style={{ background: `${colors.border}40` }} />
                        </div>
                    ))}
                </div>
            </div>
        )
    }

    if (!profiles.length) return null

    // ===== RENDER =====
    return (
        <div className={`relative w-full ${className}`}>
            <HomeSectionHeader
                title={title}
                subtitle="Melhores perfis"
                dragHandle={dragHandle}
                action={hasProfiles ? (
                    <ViewServicesButton label="ver pessoas" count={profiles.length} onClick={handleViewAll} />
                ) : <span />}
            />

            <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4" style={{ scrollbarWidth: 'none' }}>
                {displayProfiles.map((profile) => (
                    <div
                        key={profile.id}
                        onClick={() => handleProfileClick(profile)}
                        className="w-24 flex-shrink-0 flex flex-col items-center gap-2 cursor-pointer group"
                    >
                        {profile.avatarUrl ? (
                            <img
                                src={profile.avatarUrl}
                                alt={profile.name}
                                loading="lazy"
                                className="w-20 h-20 rounded-full object-cover transition-transform duration-300 group-hover:scale-105"
                            />
                        ) : (
                            <div
                                className="w-20 h-20 rounded-full flex items-center justify-center font-black text-white text-xl transition-transform duration-300 group-hover:scale-105"
                                style={{ background: GRADIENT }}
                            >
                                {profile.slug?.charAt(0).toUpperCase() || '?'}
                            </div>
                        )}
                        <div className="text-center w-24">
                            <p className="text-[11px] font-bold truncate" style={{ color: colors.textPrimary }}>{profile.name}</p>
                            <p className="text-[9px] opacity-50 truncate" style={{ color: colors.textPrimary }}>@{profile.slug}</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
