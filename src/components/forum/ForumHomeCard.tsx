// src/components/forum/ForumHomeCard.tsx — o Fórum do iUser na HOME (logo depois de "Preciso de / Quero ganhar"):
// a última versão (o que entrou) e a ideia mais votada no momento, com os atalhos "Ver novidades" e "Sugerir ideia".
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, ChevronUp, ChevronRight, Lightbulb, Megaphone } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { supabase } from '@/lib/supabase/client'

const ORANGE = '#f97316'
type Rel = { version: string; title: string; added: string[] }
type Top = { id: string; title: string; score: number }

export default function ForumHomeCard() {
    const router = useRouter()
    const { colors } = useTheme()
    const [rel, setRel] = useState<Rel | null>(null)
    const [top, setTop] = useState<Top | null>(null)
    const [ideas, setIdeas] = useState(0)

    useEffect(() => {
        let alive = true
        supabase.from('forum_releases').select('version, title, added').order('released_at', { ascending: false }).limit(1).maybeSingle()
            .then(({ data }) => { if (alive && data) setRel(data as Rel) })
        supabase.from('forum_ideas').select('id, title, up_count, down_count', { count: 'exact' }).order('up_count', { ascending: false }).limit(20)
            .then(({ data, count }) => {
                if (!alive) return
                setIdeas(count || 0)
                const best = (data || []).map((i: any) => ({ id: i.id, title: i.title, score: i.up_count - i.down_count })).sort((a, b) => b.score - a.score)[0]
                if (best) setTop(best)
            })
        return () => { alive = false }
    }, [])

    const row = { background: `${colors.border}22` }
    return (
        <section className="mt-5 rounded-3xl p-4 border" style={{ background: colors.surface, borderColor: `${ORANGE}55`, boxShadow: colors.shadow }}>
            <button onClick={() => router.push('/forum')} className="w-full flex items-center gap-3 text-left">
                <span className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: `${ORANGE}1f`, color: ORANGE }}><Sparkles size={22} /></span>
                <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-black leading-tight" style={{ color: colors.textPrimary }}>Fórum do iUser</span>
                    <span className="block text-xs mt-0.5" style={{ color: colors.textSecondary }}>Novidades, ideias, votos e tutorial{ideas ? ` · ${ideas} ${ideas === 1 ? 'ideia' : 'ideias'}` : ''}</span>
                </span>
                <ChevronRight size={17} style={{ color: colors.textSecondary }} />
            </button>

            {rel && (
                <button onClick={() => router.push('/forum')} className="mt-3 w-full rounded-2xl p-3 text-left" style={row}>
                    <span className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide" style={{ color: ORANGE }}><Megaphone size={13} /> Novidade · v{rel.version}</span>
                    <span className="block text-[13.5px] font-black mt-0.5" style={{ color: colors.textPrimary }}>{rel.title}</span>
                    {rel.added[0] && <span className="block text-[12px] mt-0.5 truncate" style={{ color: colors.textSecondary }}>+ {rel.added[0]}{rel.added.length > 1 ? ` e mais ${rel.added.length - 1}` : ''}</span>}
                </button>
            )}
            {top && (
                <button onClick={() => router.push(`/forum?ideia=${top.id}`)} className="mt-2 w-full rounded-2xl p-3 text-left flex items-center gap-3" style={row}>
                    <span className="flex flex-col items-center flex-shrink-0 w-9" style={{ color: ORANGE }}><ChevronUp size={18} strokeWidth={2.6} /><span className="text-[13px] font-black">{top.score}</span></span>
                    <span className="min-w-0">
                        <span className="block text-[11px] font-black uppercase tracking-wide" style={{ color: colors.textSecondary }}>Ideia mais votada</span>
                        <span className="block text-[13.5px] font-black truncate" style={{ color: colors.textPrimary }}>{top.title}</span>
                    </span>
                </button>
            )}

            <div className="mt-3 grid grid-cols-3 gap-2">
                <button onClick={() => router.push('/forum')} className="h-10 rounded-full text-[13px] font-black" style={{ background: `${colors.border}40`, color: colors.textPrimary }}>Novidades</button>
                <button onClick={() => router.push('/forum?nova=1')} className="h-10 rounded-full text-[13px] font-black text-white flex items-center justify-center gap-1.5" style={{ background: ORANGE }}><Lightbulb size={14} /> Ideia</button>
                <button onClick={() => router.push('/forum?aba=guia')} className="h-10 rounded-full text-[13px] font-black" style={{ background: `${colors.border}40`, color: colors.textPrimary }}>Tutorial</button>
            </div>
        </section>
    )
}
