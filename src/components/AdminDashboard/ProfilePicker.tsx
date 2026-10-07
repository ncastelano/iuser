// src/components/AdminDashboard/ProfilePicker.tsx
//
// Campo "Perfil (@)" do admin com sugestões: digite parte do nome ou do @ e escolha na lista.
// Continua aceitando um @ digitado na mão (value é sempre o @ do perfil, sem o "@").
'use client'

import { useEffect, useRef, useState } from 'react'
import { callAdminApi } from '@/lib/callAdminApi'
import { Spinner } from '@/components/Spinner'
import type { ThemeColors } from '@/app/contexts/theme'

interface Suggestion {
    id: string
    name: string | null
    profileSlug: string
    avatarUrl: string | null
}

interface ProfilePickerProps {
    value: string
    onChange: (slug: string) => void
    colors: ThemeColors
    placeholder?: string
    style?: React.CSSProperties
}

export default function ProfilePicker({ value, onChange, colors, placeholder = 'Nome ou @ do perfil', style }: ProfilePickerProps) {
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [items, setItems] = useState<Suggestion[]>([])
    const [text, setText] = useState(value)
    const [picked, setPicked] = useState<Suggestion | null>(null)
    const wrapRef = useRef<HTMLDivElement>(null)
    const seq = useRef(0)

    // Quando o pai limpa o campo (depois de conceder), limpa aqui também
    useEffect(() => {
        if (value === '') { setText(''); setPicked(null) }
    }, [value])

    // Busca com atraso curto enquanto digita (ignora respostas antigas)
    useEffect(() => {
        const q = text.trim().replace(/^@/, '')
        if (picked || q.length < 2) { setItems([]); setLoading(false); return }
        const mine = ++seq.current
        setLoading(true)
        const t = setTimeout(async () => {
            try {
                const res = await callAdminApi<{ profiles: Suggestion[] }>('/api/admin/profiles/search', { query: q })
                if (mine === seq.current) setItems(res.profiles)
            } catch {
                if (mine === seq.current) setItems([])
            }
            if (mine === seq.current) setLoading(false)
        }, 250)
        return () => clearTimeout(t)
    }, [text, picked])

    // Fecha ao clicar fora
    useEffect(() => {
        const onDown = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false) }
        document.addEventListener('mousedown', onDown)
        return () => document.removeEventListener('mousedown', onDown)
    }, [])

    const pick = (s: Suggestion) => {
        setPicked(s)
        setText(`@${s.profileSlug}`)
        onChange(s.profileSlug)
        setOpen(false)
    }

    return (
        <div ref={wrapRef} className="relative">
            <input
                value={text}
                onChange={(e) => {
                    setText(e.target.value)
                    setPicked(null)
                    onChange(e.target.value.trim().replace(/^@/, ''))
                    setOpen(true)
                }}
                onFocus={() => setOpen(true)}
                placeholder={placeholder}
                autoComplete="off"
                style={{ background: colors.background, border: `1px solid ${colors.border}`, color: colors.textPrimary, borderRadius: 12, padding: '8px 12px', fontSize: 13, width: '100%', ...style }}
            />
            {picked && <p className="text-[11px] mt-1 font-bold" style={{ color: '#16a34a' }}>{picked.name || `@${picked.profileSlug}`}</p>}

            {open && !picked && (loading || items.length > 0 || text.trim().replace(/^@/, '').length >= 2) && (
                <div
                    className="absolute left-0 right-0 top-full mt-1 z-30 rounded-xl overflow-hidden max-h-64 overflow-y-auto"
                    style={{ background: colors.surface, border: `1px solid ${colors.border}`, boxShadow: '0 8px 24px rgba(0,0,0,0.18)' }}
                >
                    {loading && items.length === 0 && (
                        <div className="flex justify-center py-3"><Spinner size={16} color={colors.accent} /></div>
                    )}
                    {!loading && items.length === 0 && (
                        <p className="text-xs px-3 py-3" style={{ color: colors.textSecondary }}>Nenhum perfil encontrado.</p>
                    )}
                    {items.map((s) => (
                        <button
                            key={s.id}
                            type="button"
                            onClick={() => pick(s)}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:opacity-80"
                            style={{ borderBottom: `1px solid ${colors.border}` }}
                        >
                            {s.avatarUrl ? (
                                <img src={s.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                            ) : (
                                <span className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-black text-white" style={{ background: 'linear-gradient(135deg, #f97316, #dc2626)' }}>
                                    {(s.name || s.profileSlug).charAt(0).toUpperCase()}
                                </span>
                            )}
                            <span className="min-w-0">
                                <span className="block text-xs font-bold truncate" style={{ color: colors.textPrimary }}>{s.name || 'Sem nome'}</span>
                                <span className="block text-[11px] truncate" style={{ color: colors.textSecondary }}>@{s.profileSlug}</span>
                            </span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}
