// contexts/ProfileContext.tsx
'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'

type BgMode = 'animated' | 'black' | 'custom'

interface ProfileContextType {
    profileSlug: string | null
    avatarUrl: string | null
    bgMode: BgMode
    customBgUrl: string | null
    loading: boolean
    setBgMode: (mode: BgMode) => void
    setCustomBgUrl: (url: string | null) => void
}

const ProfileContext = createContext<ProfileContextType>({
    profileSlug: null,
    avatarUrl: null,
    bgMode: 'black',
    customBgUrl: null,
    loading: true,
    setBgMode: () => { },
    setCustomBgUrl: () => { },
})

export function ProfileProvider({ children }: { children: React.ReactNode }) {
    const [profileSlug, setProfileSlug] = useState<string | null>(null)
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
    const [bgMode, setBgMode] = useState<BgMode>('black')
    const [customBgUrl, setCustomBgUrl] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)

    const getPublicUrl = useCallback((path: string | null, bucket: string): string | null => {
        if (!path) return null
        if (path.startsWith('http')) return path
        const { data } = supabase.storage.from(bucket).getPublicUrl(path)
        return data?.publicUrl || null
    }, [])

    const fetchProfile = useCallback(async (userId: string) => {
        try {
            const { data } = await supabase
                .from('profiles')
                .select('profileSlug, avatar_url, background_mode, background_image_url')
                .eq('id', userId)
                .single()

            if (data) {
                setProfileSlug(data.profileSlug)
                setAvatarUrl(getPublicUrl(data.avatar_url, 'avatars'))
                if (data.background_mode) setBgMode(data.background_mode)
                if (data.background_image_url) setCustomBgUrl(data.background_image_url)
            }
        } catch {
            const { data } = await supabase
                .from('profiles')
                .select('profileSlug, avatar_url')
                .eq('id', userId)
                .single()
            if (data) {
                setProfileSlug(data.profileSlug)
                setAvatarUrl(getPublicUrl(data.avatar_url, 'avatars'))
            }
        } finally {
            setLoading(false)
        }
    }, [getPublicUrl])

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user) {
                fetchProfile(session.user.id)
            } else {
                setLoading(false)
            }
        })

        const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
            if (session?.user) {
                fetchProfile(session.user.id)
            } else {
                setProfileSlug(null)
                setAvatarUrl(null)
                setBgMode('black')
                setCustomBgUrl(null)
                setLoading(false)
            }
        })

        return () => {
            authListener.subscription.unsubscribe()
        }
    }, [fetchProfile])

    return (
        <ProfileContext.Provider value={{ profileSlug, avatarUrl, bgMode, customBgUrl, loading, setBgMode, setCustomBgUrl }}>
            {children}
        </ProfileContext.Provider>
    )
}

export const useProfile = () => useContext(ProfileContext)