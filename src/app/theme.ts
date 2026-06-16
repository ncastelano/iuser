//src/app/theme.ts
import { create } from 'zustand'

export type ThemeName = 'claro' | 'escuro-laranja' | 'escuro-cinza'

interface ThemeColors {
    name: ThemeName
    background: string
    surface: string
    textPrimary: string
    textSecondary: string
    accent: string
    accentLight: string
    accentText: string
    border: string
    shadow: string
}

const themes: Record<ThemeName, ThemeColors> = {
    'claro': {
        name: 'claro',
        background: '#ffffff',
        surface: '#f9fafb',
        textPrimary: '#111827',
        textSecondary: '#6b7280',
        accent: '#f97316',
        accentLight: '#fed7aa',
        accentText: '#ffffff',
        border: '#e5e7eb',
        shadow: '0 8px 32px rgba(0,0,0,0.08)',
    },
    'escuro-laranja': {
        name: 'escuro-laranja',
        background: '#000000',
        surface: '#1a1a1a',
        textPrimary: '#ffffff',
        textSecondary: '#9ca3af',
        accent: '#f97316',
        accentLight: '#9a3412',
        accentText: '#ffffff',
        border: '#374151',
        shadow: '0 8px 32px rgba(255,255,255,0.05)',
    },
    'escuro-cinza': {
        name: 'escuro-cinza',
        background: '#000000',
        surface: '#1a1a1a',
        textPrimary: '#ffffff',
        textSecondary: '#9ca3af',
        accent: '#6b7280',
        accentLight: '#4b5563',
        accentText: '#ffffff',
        border: '#374151',
        shadow: '0 8px 32px rgba(255,255,255,0.05)',
    },
}

interface Theme {
    current: ThemeName
    colors: ThemeColors
    setTheme: (theme: ThemeName) => void
}

export const useTheme = create<Theme>((set) => ({
    current: 'claro',
    colors: themes['claro'],
    setTheme: (theme) => set({ current: theme, colors: themes[theme] }),
}))