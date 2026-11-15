'use client'

// src/components/digital/DigitalKindPicker.tsx — o LOJISTA escolhe que tipo de conteúdo digital é o produto (curso, música, audiolivro, filme...).
// Vale no cadastro do produto e na edição do conteúdo. O tipo decide em qual prateleira da aba "Digitais" da loja o produto aparece e o selo do cartão.
import { Disc3, FileText, Film, GraduationCap, Headphones, ListMusic, Mic, Music, BookOpen, Package, Play } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTheme } from '@/app/contexts/theme'
import { CHOOSABLE_KINDS, type DigitalProductKind } from '@/modules/digital'

const ICON: Record<DigitalProductKind, ReactNode> = {
    curso: <GraduationCap size={16} />, aula: <Play size={16} />, filme: <Film size={16} />, musica: <Music size={16} />, album: <Disc3 size={16} />,
    audiolivro: <Headphones size={16} />, podcast: <Mic size={16} />, playlist: <ListMusic size={16} />, ebook: <BookOpen size={16} />, arquivo: <FileText size={16} />, programa: <Package size={16} />,
}

export default function DigitalKindPicker({ value, onChange, disabled }: { value: DigitalProductKind | null; onChange: (k: DigitalProductKind) => void; disabled?: boolean }) {
    const { colors } = useTheme()
    const hint = CHOOSABLE_KINDS.find((k) => k.kind === value)?.hint
    return (
        <div>
            <div className="grid grid-cols-2 gap-2">
                {CHOOSABLE_KINDS.map((k) => {
                    const on = value === k.kind
                    return (
                        <button key={k.kind} type="button" disabled={disabled} onClick={() => onChange(k.kind)} aria-pressed={on}
                            className="flex items-center gap-2 px-3 h-11 rounded-xl text-left text-[13px] font-black transition active:scale-95 disabled:opacity-50"
                            style={on ? { background: '#8b5cf6', color: '#fff' } : { background: colors.surface, border: `1px solid ${colors.border}`, color: colors.textPrimary }}>
                            {ICON[k.kind]}<span className="truncate">{k.label}</span>
                        </button>
                    )
                })}
            </div>
            <p className="text-[11.5px] mt-2 leading-snug" style={{ color: colors.textSecondary }}>{hint ? <>{hint}. Aparece na prateleira certa da sua loja.</> : 'Escolha o que é: assim o conteúdo aparece na prateleira certa da sua loja.'}</p>
        </div>
    )
}
