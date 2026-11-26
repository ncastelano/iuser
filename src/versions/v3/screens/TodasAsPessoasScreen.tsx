// src/versions/v3/screens/TodasAsPessoasScreen.tsx — "Todas as pessoas do iUser": a lista completa (mais novas primeiro), em grade,
// com busca por nome ou @ e "Ver mais" de 30 em 30. Vem do botão "Ver todas" de "Novos por aqui" na página Social.
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import { useTheme } from '@/app/contexts/theme'
import { avatarOf, loadAllPeople } from '@/modules/people/load'
import type { Person } from '@/modules/people/domain'

const PAGE = 30

function Tile({ p, onOpen, textPrimary, textSecondary, surface, border }: { p: Person; onOpen: () => void; textPrimary: string; textSecondary: string; surface: string; border: string }) {
    const img = avatarOf(p.avatarPath)
    return (
        <button onClick={onOpen} className="rounded-2xl p-3 flex flex-col items-center gap-2 text-center active:scale-95 transition" style={{ background: surface, border: `1px solid ${border}` }}>
            {img ? (
                <img src={img} alt="" className="w-16 h-16 rounded-full object-cover" />
            ) : (
                <span className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-black" style={{ background: `${border}60`, color: textPrimary }}>{(p.name || '?').charAt(0).toUpperCase()}</span>
            )}
            <span className="w-full min-w-0">
                <span className="block text-[12.5px] font-black leading-tight truncate" style={{ color: textPrimary }}>{p.name}</span>
                <span className="block text-[11px] font-semibold truncate" style={{ color: textSecondary }}>@{p.slug}</span>
            </span>
        </button>
    )
}

export default function TodasAsPessoasScreen() {
    const { colors } = useTheme()
    const router = useRouter()
    const [q, setQ] = useState('')
    const [term, setTerm] = useState('')
    const [people, setPeople] = useState<Person[] | null>(null)
    const [more, setMore] = useState(true)
    const [busy, setBusy] = useState(false)

    // a busca espera a pessoa parar de digitar
    useEffect(() => {
        const t = setTimeout(() => setTerm(q.trim()), 300)
        return () => clearTimeout(t)
    }, [q])

    useEffect(() => {
        let cancelled = false
        setPeople(null)
        setMore(true)
        loadAllPeople({ offset: 0, limit: PAGE, q: term })
            .then((r) => { if (!cancelled) { setPeople(r); setMore(r.length === PAGE) } })
            .catch(() => { if (!cancelled) setPeople([]) })
        return () => { cancelled = true }
    }, [term])

    const verMais = async () => {
        if (!people || busy) return
        setBusy(true)
        try {
            const r = await loadAllPeople({ offset: people.length, limit: PAGE, q: term })
            setPeople([...people, ...r])
            setMore(r.length === PAGE)
        } finally {
            setBusy(false)
        }
    }

    return (
        <main className="min-h-dvh pb-28" style={{ background: colors.background }}>
            <Header title="Todas as pessoas" showBack onBack={() => router.back()} showSearch searchPlaceholder="Procurar por nome ou @..." onSearch={setQ} searchValue={q} />
            <div className="px-4 pt-3">
                <p className="text-[12px] font-bold mb-3" style={{ color: colors.textSecondary }}>
                    {people === null ? 'Carregando…' : people.length === 0 ? 'Ninguém encontrado' : `${people.length}${more ? '+' : ''} ${people.length === 1 ? 'pessoa' : 'pessoas'}${term ? ' encontradas' : ' no iUser'}`}
                </p>
                {people === null ? (
                    <div className="grid grid-cols-3 gap-2.5">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="rounded-2xl h-36 animate-pulse" style={{ background: `${colors.border}40` }} />)}</div>
                ) : (
                    <>
                        <div className="grid grid-cols-3 gap-2.5">
                            {people.map((p) => (
                                <Tile key={p.id} p={p} onOpen={() => router.push(`/${p.slug}`)} textPrimary={colors.textPrimary} textSecondary={colors.textSecondary} surface={colors.surface} border={colors.border} />
                            ))}
                        </div>
                        {more && (
                            <button onClick={verMais} disabled={busy} className="w-full mt-4 h-11 rounded-full text-[13px] font-black active:scale-95 disabled:opacity-60" style={{ background: `${colors.border}40`, color: colors.textPrimary }}>
                                {busy ? 'Carregando…' : 'Ver mais pessoas'}
                            </button>
                        )}
                    </>
                )}
            </div>
        </main>
    )
}
