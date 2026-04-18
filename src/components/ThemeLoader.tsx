'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useThemeStore } from '@/store/useThemeStore'

export function ThemeLoader() {
  const supabase = createClient()
  const { setTheme } = useThemeStore()

  useEffect(() => {
    async function initTheme() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('theme_mode')
          .eq('id', user.id)
          .single()
        
        if (profile?.theme_mode) {
          setTheme(profile.theme_mode as 'light' | 'dark')
        }
      }
    }

    initTheme()
    
    // Listen for changes from other tabs/sessions
    const channel = supabase
      .channel('theme_global_sync')
      .on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'profiles' 
      }, (payload) => {
        if (payload.new.theme_mode) {
          setTheme(payload.new.theme_mode)
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, setTheme])

  return null
}
