import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type AppMode = 'commercial' | 'personal'

interface AppState {
  mode: AppMode
  toggleMode: () => void
  setMode: (mode: AppMode) => void
}

export const useAppModeStore = create<AppState>()(
  persist(
    (set) => ({
      mode: 'commercial',
      toggleMode: () => set((state) => ({ 
        mode: state.mode === 'commercial' ? 'personal' : 'commercial' 
      })),
      setMode: (mode) => set({ mode }),
    }),
    {
      name: 'iuser-app-mode',
    }
  )
)
