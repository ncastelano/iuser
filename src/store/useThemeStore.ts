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
  theme: 'dark', // Default
  setTheme: (theme) => {
    set({ theme })
    if (typeof document !== 'undefined') {
      if (theme === 'light') {
        document.documentElement.classList.add('light')
        document.documentElement.classList.remove('dark')
      } else {
        document.documentElement.classList.add('dark')
        document.documentElement.classList.remove('light')
      }
    }
  },
  toggleTheme: () => {
    const next = get().theme === 'light' ? 'dark' : 'light'
    get().setTheme(next)
  },
  syncTheme: async (userId) => {
    const supabase = createClient()
    const { theme } = get()
    await supabase.from('profiles').update({ theme_mode: theme }).eq('id', userId)
  }
}))
