// components/ColloriUser.tsx
'use client'

import { Paintbrush, Check } from 'lucide-react'
import { useTheme, type ThemeName } from '@/app/theme'

const themeOptions: { id: ThemeName; label: string; preview: { bg: string; text: string; accent: string } }[] = [
    {
        id: 'claro',
        label: 'Claro',
        preview: { bg: '#ffffff', text: '#111827', accent: '#f97316' },
    },
    {
        id: 'escuro-laranja',
        label: 'Escuro + Laranja',
        preview: { bg: '#000000', text: '#ffffff', accent: '#f97316' },
    },
    {
        id: 'escuro-cinza',
        label: 'Escuro + Cinza',
        preview: { bg: '#000000', text: '#ffffff', accent: '#6b7280' },
    },
]

export default function ColloriUser() {
    const { current, setTheme, colors } = useTheme() // ← pega as cores do tema atual

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                    <Paintbrush className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                    <h3
                        className="text-base font-black uppercase tracking-tighter"
                        style={{ color: colors.textPrimary }} // ← dinâmico
                    >
                        Tema do iUser
                    </h3>
                    <p
                        className="text-[9px] font-black uppercase tracking-wider"
                        style={{ color: colors.textSecondary }} // ← dinâmico
                    >
                        Escolha a identidade visual
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
                {themeOptions.map((theme) => (
                    <button
                        key={theme.id}
                        onClick={() => setTheme(theme.id)}
                        className={`relative rounded-2xl p-4 transition-all border-2 ${current === theme.id
                                ? 'border-purple-500 shadow-lg shadow-purple-200'
                                : 'border-gray-200 hover:border-gray-300'
                            }`}
                        style={{ background: theme.preview.bg }}
                    >
                        {current === theme.id && (
                            <div className="absolute -top-2 -right-2 w-6 h-6 bg-purple-500 rounded-full flex items-center justify-center">
                                <Check size={14} className="text-white" />
                            </div>
                        )}
                        <div className="space-y-2">
                            <div className="flex gap-1">
                                <div className="w-3 h-3 rounded-full" style={{ background: theme.preview.accent }} />
                                <div className="w-3 h-3 rounded-full" style={{ background: theme.preview.text, opacity: 0.3 }} />
                            </div>
                            <p className="text-[10px] font-bold" style={{ color: theme.preview.text }}>
                                {theme.label}
                            </p>
                            <div
                                className="h-1 w-8 rounded-full"
                                style={{ background: theme.preview.accent }}
                            />
                        </div>
                    </button>
                ))}
            </div>
        </div>
    )
}