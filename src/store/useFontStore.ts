import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface FontState {
    fontSize: 'normal' | 'large' | 'extra-large'
    setFontSize: (size: 'normal' | 'large' | 'extra-large') => void
}

export const useFontStore = create<FontState>()(
    persist(
        (set) => ({
            fontSize: 'normal',
            setFontSize: (size) => set({ fontSize: size }),
        }),
        {
            name: 'iuser-font-storage',
        }
    )
)
