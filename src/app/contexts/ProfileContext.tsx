// contexts/ProfileContext.tsx
'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/theme'
import { useFontStore } from '@/store/useFontStore'

type BgMode = 'animated' | 'black' | 'custom'

interface ProfileContextType {
    profileSlug: string | null
    avatarUrl: string | null
    bgMode: BgMode
    customBgUrl: string | null
    loading: boolean
    setBgMode: (mode: BgMode) => void
    setCustomBgUrl: (url: string | null) => void
    refreshProfile: () => Promise<void>
}

const ProfileContext = createContext<ProfileContextType>({
    profileSlug: null,
    avatarUrl: null,
    bgMode: 'black',
    customBgUrl: null,
    loading: true,
    setBgMode: () => { },
    setCustomBgUrl: () => { },
    refreshProfile: async () => { },
})

export function ProfileProvider({ children }: { children: React.ReactNode }) {
    const [profileSlug, setProfileSlug] = useState<string | null>(null)
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
    const [bgMode, setBgMode] = useState<BgMode>('black')
    const [customBgUrl, setCustomBgUrl] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)

    const { setTheme } = useTheme()
    const { setFontSize } = useFontStore()

    const getPublicUrl = useCallback((path: string | null, bucket: string): string | null => {
        if (!path) return null
        if (path.startsWith('http')) return path
        const { data } = supabase.storage.from(bucket).getPublicUrl(path)
        return data?.publicUrl || null
    }, [])

    const fetchProfile = useCallback(async (userId: string) => {
        try {
            // Seleciona também as colunas de tema e fonte
            const { data, error } = await supabase
                .from('profiles')
                .select('profileSlug, avatar_url, background_mode, background_image_url, app_theme, font_size')
                .eq('id', userId)
                .single()

            if (error) throw error

            if (data) {
                setProfileSlug(data.profileSlug)
                setAvatarUrl(getPublicUrl(data.avatar_url, 'avatars'))
                if (data.background_mode) setBgMode(data.background_mode as BgMode)
                if (data.background_image_url) setCustomBgUrl(data.background_image_url)

                // Aplica o tema e a fonte salvos
                if (data.app_theme) {
                    setTheme(data.app_theme)
                }
                if (data.font_size) {
                    setFontSize(data.font_size)
                }
            }
        } catch (err) {
            // Fallback: tenta buscar ao menos os campos básicos
            console.warn('Erro ao carregar perfil completo, tentando fallback:', err)
            try {
                const { data } = await supabase
                    .from('profiles')
                    .select('profileSlug, avatar_url, app_theme, font_size')
                    .eq('id', userId)
                    .single()
                if (data) {
                    setProfileSlug(data.profileSlug)
                    setAvatarUrl(getPublicUrl(data.avatar_url, 'avatars'))
                    if (data.app_theme) setTheme(data.app_theme)
                    if (data.font_size) setFontSize(data.font_size)
                }
            } catch (fallbackErr) {
                console.error('Fallback de perfil falhou:', fallbackErr)
            }
        } finally {
            setLoading(false)
        }
    }, [getPublicUrl, setTheme, setFontSize])

    // Inicializa o perfil ao montar e escuta mudanças na autenticação
    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user) {
                fetchProfile(session.user.id)
            } else {
                setLoading(false)
            }
        })

        const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
            if (session?.user) {
                fetchProfile(session.user.id)
            } else {
                // Reset ao deslogar
                setProfileSlug(null)
                setAvatarUrl(null)
                setBgMode('black')
                setCustomBgUrl(null)
                setLoading(false)
                // Volta ao tema e fonte padrão
                setTheme('claro')
                setFontSize('normal')
            }
        })

        return () => {
            authListener.subscription.unsubscribe()
        }
    }, [fetchProfile, setTheme, setFontSize])

    const refreshProfile = useCallback(async () => {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user) {
            await fetchProfile(session.user.id)
        }
    }, [fetchProfile])

    return (
        <ProfileContext.Provider
            value={{
                profileSlug,
                avatarUrl,
                bgMode,
                customBgUrl,
                loading,
                setBgMode,
                setCustomBgUrl,
                refreshProfile,
            }}
        >
            {children}
        </ProfileContext.Provider>
    )
}

export const useProfile = () => useContext(ProfileContext)