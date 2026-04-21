import { create } from 'zustand'
import { createClient } from '@/lib/supabase/client'

type Theme = 'light' | 'dark'

interface ThemeState {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
  syncTheme: (userId: string) => Promise<void>
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: 'light', // Always light
  setTheme: (theme) => {
    // Force light mode regardless of what is passed
    const forcedTheme = 'light'
    set({ theme: forcedTheme })
    if (typeof document !== 'undefined') {
      document.documentElement.classList.add('light')
      document.documentElement.classList.remove('dark')
    }
  },
  toggleTheme: () => {
    // Do nothing or force light
    get().setTheme('light')
  },
  syncTheme: async (userId) => {
    const supabase = createClient()
    // Always sync 'light' to the profile
    await supabase.from('profiles').update({ theme_mode: 'light' }).eq('id', userId)
  }
}))

