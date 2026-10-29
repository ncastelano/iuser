// src/components/digital/DigitalCurriculum.tsx — "O que você recebe": o sumário do produto digital na vitrine (módulos, aulas, arquivos), com cadeado no que ainda está
// fechado e "Assistir grátis" nas aulas de prévia. Sem caminho nem link: só títulos (get_digital_curriculum).
'use client'

import { useEffect, useState } from 'react'
import { FileText, Link2, Lock, Music, PlayCircle, Unlock } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { fetchCurriculum, formatDuration, formatSize, groupByModule, curriculumSummary, type CurriculumItem } from '@/modules/digital'
import DigitalViewer from './DigitalViewer'

export const kindIcon = (k: CurriculumItem['kind'], size = 16) =>
    k === 'video' ? <PlayCircle size={size} /> : k === 'audio' ? <Music size={size} /> : k === 'link' ? <Link2 size={size} /> : <FileText size={size} />

export default function DigitalCurriculum({ productId, onLoaded }: { productId: string; onLoaded?: (items: CurriculumItem[]) => void }) {
    const { colors } = useTheme()
    const [items, setItems] = useState<CurriculumItem[] | null>(null)
    const [open, setOpen] = useState<string | null>(null)

    useEffect(() => {
        let alive = true
        fetchCurriculum(productId).then((d) => { if (alive) { setItems(d); onLoaded?.(d) } }).catch(() => { if (alive) setItems([]) })
        return () => { alive = false }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [productId])

    if (!items) return null
    if (items.length === 0) return null
    const groups = groupByModule(items)
    return (
        <section className="rounded-3xl p-4 flex flex-col gap-3" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
            <div>
                <h2 className="text-base font-black" style={{ color: colors.textPrimary }}>O que você recebe</h2>
                <p className="text-[12px]" style={{ color: colors.textSecondary }}>{curriculumSummary(items)}</p>
            </div>
            {open && <DigitalViewer itemId={open} title={items.find((i) => i.id === open)?.title || ''} />}
            {groups.map((g, gi) => (
                <div key={gi} className="flex flex-col gap-1.5">
                    {g.title && <p className="text-[11px] font-black uppercase tracking-wide" style={{ color: colors.textSecondary }}>{g.title}</p>}
                    {g.items.map((it) => {
                        const canOpen = it.unlocked
                        return (
                            <button key={it.id} type="button" disabled={!canOpen} onClick={() => setOpen(open === it.id ? null : it.id)}
                                className="w-full flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition active:scale-[0.99] disabled:active:scale-100"
                                style={{ background: open === it.id ? '#f9731614' : `${colors.border}26`, border: `1px solid ${open === it.id ? '#f97316' : 'transparent'}` }}>
                                <span style={{ color: canOpen ? '#f97316' : colors.textSecondary }}>{kindIcon(it.kind, 18)}</span>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-[13px] font-bold truncate" style={{ color: colors.textPrimary }}>{it.title}</span>
                                    <span className="block text-[11px]" style={{ color: colors.textSecondary }}>{[formatDuration(it.duration_seconds), formatSize(it.size_bytes)].filter(Boolean).join(' · ') || ' '}</span>
                                </span>
                                {it.is_preview ? <span className="text-[10px] font-black rounded-full px-2 py-0.5" style={{ background: '#22c55e22', color: '#16a34a' }}>Grátis</span> : null}
                                {canOpen ? <Unlock size={14} style={{ color: '#16a34a' }} /> : <Lock size={14} style={{ color: colors.textSecondary }} />}
                            </button>
                        )
                    })}
                </div>
            ))}
        </section>
    )
}
