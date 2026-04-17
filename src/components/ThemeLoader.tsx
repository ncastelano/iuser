'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export function ThemeLoader() {
  const supabase = createClient()

  useEffect(() => {
    async function applyTheme() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data } = await supabase
          .from('profiles')
          .select('theme_mode')
          .eq('id', user.id)
          .single()

        if (data?.theme_mode === 'light') {
          document.body.classList.add('light')
        } else {
          document.body.classList.remove('light')
        }
      }
    }

    applyTheme()
    
    // Also listen for changes in the same session (for ConfiguracoesPage immediate update)
    const channel = supabase
      .channel('theme_changes')
      .on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'profiles' 
      }, (payload) => {
        if (payload.new.theme_mode === 'light') {
          document.body.classList.add('light')
        } else {
          document.body.classList.remove('light')
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase])

  return null
}
