// contexts/ProfileContext.tsx
'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { useFontStore } from '@/store/useFontStore'

type BgMode = 'animated' | 'black' | 'custom'

interface ProfileContextType {
    userId: string | null
    isLoggedIn: boolean
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
    userId: null,
    isLoggedIn: false,
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
    const [userId, setUserId] = useState<string | null>(null)
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
                setUserId(session.user.id)
                fetchProfile(session.user.id)
            } else {
                setUserId(null)
                setLoading(false)
            }
        })

        const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
            if (session?.user) {
                setUserId(session.user.id)
                fetchProfile(session.user.id)
            } else {
                // Reset ao deslogar
                setUserId(null)
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

    // Avisa o banco que a pessoa está online (abrir o app, voltar pra aba e a cada 2 min com a aba visível).
    // Quem pode ver isso é escolha de cada um (Visto por último, no perfil).
    useEffect(() => {
        if (!userId) return
        // Status escolhido: 'auto' (online só com o app à vista), 'online' (mantém online em segundo plano) ou 'offline'
        let mode: 'auto' | 'online' | 'offline' = 'auto'
        const send = (online: boolean) => { supabase.rpc('touch_last_seen', { p_online: online }).then(() => {}, () => {}) }
        const ping = () => {
            if (mode === 'offline') return
            if (document.visibilityState === 'visible' || mode === 'online') send(true)
        }
        const onVisibility = () => {
            if (document.visibilityState === 'visible') ping()
            else if (mode === 'auto') send(false)          // saiu da aba: já fica offline
        }
        const onLeave = () => { if (mode === 'auto') send(false) }
        const onMode = (e: Event) => { mode = (e as CustomEvent<'auto' | 'online' | 'offline'>).detail; ping() }

        supabase.from('profile_presence').select('mode').eq('profile_id', userId).maybeSingle()
            .then(({ data }) => { if (data?.mode) mode = data.mode as typeof mode; ping() }, () => ping())
        const timer = setInterval(ping, 60000)
        document.addEventListener('visibilitychange', onVisibility)
        window.addEventListener('pagehide', onLeave)
        window.addEventListener('iuser:presence-mode', onMode)
        return () => {
            clearInterval(timer)
            document.removeEventListener('visibilitychange', onVisibility)
            window.removeEventListener('pagehide', onLeave)
            window.removeEventListener('iuser:presence-mode', onMode)
        }
    }, [userId])

    // Localização em tempo real (se a pessoa ligou em Informações do Perfil): manda a posição a cada 5 min com o app à vista
    useEffect(() => {
        if (!userId) return
        let live = false
        const send = () => {
            if (!live || document.visibilityState !== 'visible' || !navigator.geolocation) return
            navigator.geolocation.getCurrentPosition(
                (pos) => { supabase.rpc('update_live_location', { p_lat: pos.coords.latitude, p_lng: pos.coords.longitude }).then(() => {}, () => {}) },
                () => {},
                { timeout: 10000, maximumAge: 120000 }
            )
        }
        const onToggle = (e: Event) => { live = !!(e as CustomEvent<boolean>).detail; send() }
        supabase.from('profiles').select('live_location').eq('id', userId).maybeSingle()
            .then(({ data }) => { live = !!data?.live_location; send() }, () => {})
        const timer = setInterval(send, 300000)
        document.addEventListener('visibilitychange', send)
        window.addEventListener('iuser:live-location', onToggle)
        return () => { clearInterval(timer); document.removeEventListener('visibilitychange', send); window.removeEventListener('iuser:live-location', onToggle) }
    }, [userId])

    const refreshProfile = useCallback(async () => {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user) {
            setUserId(session.user.id)
            await fetchProfile(session.user.id)
        } else {
            setUserId(null)
        }
    }, [fetchProfile])

    return (
        <ProfileContext.Provider
            value={{
                userId,
                isLoggedIn: userId !== null,
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