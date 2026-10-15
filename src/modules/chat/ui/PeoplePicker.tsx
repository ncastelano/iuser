// src/modules/chat/ui/PeoplePicker.tsx
//
// Escolher pessoas do iUser: primeiro quem a pessoa segue, e a busca por nome/@usuário alcança qualquer perfil.
// Usado ao criar uma conversa/grupo e ao convidar mais gente pra um grupo.
'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, Search } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { Spinner } from '@/components/Spinner'
import { listFollowing, searchPeople, type PersonHit } from '../api'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

export function PersonAvatar({ p, size = 40 }: { p: { avatar: string | null; slug?: string | null; name?: string | null }; size?: number }) {
    return p.avatar ? (
        <img src={p.avatar} alt="" className="rounded-full object-cover flex-shrink-0" style={{ width: size, height: size }} />
    ) : (
        <span className="rounded-full flex items-center justify-center text-white font-black flex-shrink-0" style={{ width: size, height: size, background: GRADIENT, fontSize: size * 0.4 }}>
            {(p.slug || p.name || '?').charAt(0).toUpperCase()}
        </span>
    )
}

export default function PeoplePicker({ me, selected, onToggle, excludeIds }: {
    me: string
    selected: PersonHit[]
    onToggle: (p: PersonHit) => void
    excludeIds?: Set<string>
}) {
    const { colors } = useTheme()
    const [following, setFollowing] = useState<PersonHit[] | null>(null)
    const [query, setQuery] = useState('')
    const [results, setResults] = useState<PersonHit[] | null>(null)
    const [searching, setSearching] = useState(false)

    useEffect(() => {
        let cancelled = false
        listFollowing(me).then((l) => { if (!cancelled) setFollowing(l) }).catch(() => { if (!cancelled) setFollowing([]) })
        return () => { cancelled = true }
    }, [me])

    useEffect(() => {
        const q = query.trim()
        if (q.replace(/^@/, '').length < 2) { setResults(null); setSearching(false); return }
        setSearching(true)
        let cancelled = false
        const t = setTimeout(() => {
            searchPeople(q, me)
                .then((r) => { if (!cancelled) { setResults(r); setSearching(false) } })
                .catch(() => { if (!cancelled) { setResults([]); setSearching(false) } })
        }, 250)
        return () => { cancelled = true; clearTimeout(t) }
    }, [query, me])

    const selectedIds = useMemo(() => new Set(selected.map((s) => s.id)), [selected])
    const visible = (list: PersonHit[]) => list.filter((p) => !excludeIds?.has(p.id))
    const shown = results !== null ? visible(results) : visible(following || [])

    const row = (p: PersonHit) => {
        const on = selectedIds.has(p.id)
        return (
            <button
                key={p.id}
                onClick={() => onToggle(p)}
                className="w-full flex items-center gap-3 text-left rounded-2xl px-2 py-2 transition active:scale-[0.99]"
                style={{ background: on ? `${colors.accent}14` : 'transparent' }}
            >
                <PersonAvatar p={p} size={44} />
                <span className="min-w-0 flex-1">
                    <span className="block text-sm font-black truncate" style={{ color: colors.textPrimary }}>{p.name || (p.slug ? `@${p.slug}` : 'Perfil')}</span>
                    {p.slug && <span className="block text-xs truncate" style={{ color: colors.textSecondary }}>@{p.slug}</span>}
                </span>
                <span
                    className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition"
                    style={on ? { background: GRADIENT, color: '#fff' } : { background: `${colors.border}60` }}
                >
                    {on && <Check size={14} strokeWidth={3} />}
                </span>
            </button>
        )
    }

    return (
        <div className="flex flex-col min-h-0">
            <div className="flex items-center gap-2 px-4 rounded-full flex-shrink-0" style={{ height: 46, background: `${colors.border}40` }}>
                <Search size={18} style={{ color: colors.textSecondary }} className="flex-shrink-0" />
                <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar por nome ou @usuário"
                    className="flex-1 min-w-0 bg-transparent text-sm focus:outline-none"
                    style={{ color: colors.textPrimary }}
                />
            </div>

            <div className="mt-3 flex-1 min-h-0 overflow-y-auto">
                <p className="px-2 pb-1 text-[11px] font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                    {results !== null ? 'Resultados' : 'Quem eu sigo'}
                </p>
                {(following === null && results === null) || searching ? (
                    <div className="flex justify-center py-8"><Spinner size={20} color={colors.accent} /></div>
                ) : shown.length === 0 ? (
                    <p className="px-2 py-6 text-sm text-center" style={{ color: colors.textSecondary }}>
                        {results !== null
                            ? 'Ninguém encontrado com esse nome.'
                            : 'Você ainda não segue ninguém. Busque pelo nome ou @usuário acima.'}
                    </p>
                ) : shown.map(row)}
            </div>
        </div>
    )
}
