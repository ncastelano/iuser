// src/components/profile/ProfileTypePicker.tsx
//
// Escolha do TIPO DO PERFIL (Pessoal, Serviços, Agendamentos, Motorista): um cartão por tipo, no desenho do seletor de modelo da loja (`StoreModelPicker`),
// com uma miniatura de como a página fica e qual é o botão principal. Só apresentação: quem usa guarda o valor (cadastro) ou salva (painel do perfil).
'use client'

import { Calendar, Car, Check, User, Wrench } from 'lucide-react'
import { PROFILE_TYPES, type ProfileType } from '@/lib/profileType'

const ICON = { pessoal: User, servicos: Wrench, agendamentos: Calendar, motorista: Car } as const

// miniatura da página do perfil: a foto redonda, linhas de conteúdo e o botão principal do tipo
function Mini({ type, color, colors }: { type: ProfileType; color: string; colors: any }) {
    const bar = `${colors.border}90`
    return (
        <div className="w-[64px] h-[84px] rounded-xl p-2 flex flex-col items-center gap-1.5 flex-shrink-0" style={{ background: `${colors.border}30` }} aria-hidden>
            <span className="w-5 h-5 rounded-full" style={{ background: bar }} />
            <span className="h-1.5 w-8 rounded-full" style={{ background: bar }} />
            {type === 'pessoal' ? (
                <div className="flex gap-1 w-full"><span className="h-3 flex-1 rounded-full" style={{ background: color }} /><span className="h-3 flex-1 rounded-full" style={{ border: `1.5px solid ${color}` }} /></div>
            ) : <span className="h-3 w-full rounded-full" style={{ background: color }} />}
            {type === 'agendamentos'
                ? <div className="grid grid-cols-3 gap-0.5 w-full flex-1">{[0, 1, 2, 3, 4, 5].map((i) => <span key={i} className="rounded-sm" style={{ background: i === 1 ? color : bar }} />)}</div>
                : type === 'pessoal'
                    ? <div className="grid grid-cols-2 gap-0.5 w-full flex-1">{[0, 1, 2, 3].map((i) => <span key={i} className="rounded-sm" style={{ background: bar }} />)}</div>
                    : <div className="flex flex-col gap-0.5 w-full flex-1">{[0, 1].map((i) => <span key={i} className="flex-1 rounded-sm" style={{ background: bar }} />)}</div>}
        </div>
    )
}

export default function ProfileTypePicker({ value, onChange, colors, compact = false }: { value: ProfileType; onChange: (t: ProfileType) => void; colors: any; compact?: boolean }) {
    return (
        <div className={compact ? 'grid grid-cols-2 gap-2' : 'space-y-2'} role="radiogroup" aria-label="Tipo do perfil">
            {PROFILE_TYPES.map((t) => {
                const on = value === t.id
                const Icon = ICON[t.id]
                return (
                    <button
                        key={t.id}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => onChange(t.id)}
                        className={`w-full flex ${compact ? 'flex-col items-start gap-1.5 p-3' : 'items-center gap-3 p-3'} rounded-3xl text-left transition active:scale-[0.99] relative`}
                        style={{ background: on ? `${t.color}14` : `${colors.border}25`, boxShadow: on ? `inset 0 0 0 2px ${t.color}` : undefined }}
                    >
                        {compact
                            ? <span className="w-9 h-9 rounded-xl flex items-center justify-center text-white" style={{ background: t.color }}><Icon size={18} /></span>
                            : <Mini type={t.id} color={t.color} colors={colors} />}
                        <span className="min-w-0 flex-1">
                            <span className="block text-[14px] font-black" style={{ color: colors.textPrimary }}>{t.title}</span>
                            <span className="block text-[11.5px] leading-snug" style={{ color: colors.textSecondary }}>{t.desc}</span>
                            {!compact && <span className="block text-[12px] font-black mt-1" style={{ color: t.color }}>{t.main}</span>}
                        </span>
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${compact ? 'absolute top-3 right-3' : ''}`} style={on ? { background: t.color, color: '#fff' } : { boxShadow: `inset 0 0 0 2px ${colors.border}` }}>
                            {on && <Check size={14} strokeWidth={3} />}
                        </span>
                    </button>
                )
            })}
        </div>
    )
}
