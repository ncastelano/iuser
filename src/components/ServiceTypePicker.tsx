// src/components/ServiceTypePicker.tsx
//
// "Tipo de profissional" de um pedido de serviço: os tipos fixos + os "Outro" que mais gente pediu.
// Ao escolher "Outro" a pessoa digita o nome e escolhe um ícone; quando mais de 2 pessoas pedem o mesmo nome,
// ele passa a aparecer na lista pra todo mundo (ver usePopularCustomServices).
'use client'

import { SERVICE_ICON_OPTIONS, SERVICE_TYPES, getServiceIcon } from '@/lib/serviceTypes'
import { usePopularCustomServices } from '@/hooks/usePopularCustomServices'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

export interface ServiceTypeValue {
    type: string
    customName: string
    customIcon: string | null
}

interface Props {
    value: ServiceTypeValue
    onChange: (next: ServiceTypeValue) => void
    colors: any
}

export default function ServiceTypePicker({ value, onChange, colors }: Props) {
    const popular = usePopularCustomServices()

    const chip = (key: string, label: string, Icon: ReturnType<typeof getServiceIcon>, active: boolean, onClick: () => void) => (
        <button
            key={key}
            type="button"
            onClick={onClick}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black"
            style={active ? { background: GRADIENT, color: '#fff' } : { background: colors.surface, color: colors.textSecondary, border: `1px solid ${colors.border}` }}
        >
            <Icon size={12} />
            {label}
        </button>
    )

    return (
        <div>
            <div className="flex flex-wrap gap-1.5">
                {SERVICE_TYPES.filter((t) => t.id !== 'outro').map((t) =>
                    chip(t.id, t.label, t.icon, value.type === t.id, () => onChange({ type: t.id, customName: '', customIcon: null })),
                )}
                {popular.map((p) =>
                    chip(
                        `popular-${p.label}`,
                        p.label,
                        getServiceIcon('outro', p.icon),
                        value.type === 'outro' && value.customName.trim().toLowerCase() === p.label.toLowerCase(),
                        () => onChange({ type: 'outro', customName: p.label, customIcon: p.icon }),
                    ),
                )}
                {chip('outro', 'Outro', getServiceIcon('outro'), value.type === 'outro' && !popular.some((p) => p.label.toLowerCase() === value.customName.trim().toLowerCase()),
                    () => onChange({ type: 'outro', customName: value.type === 'outro' ? value.customName : '', customIcon: value.customIcon }))}
            </div>

            {value.type === 'outro' && (
                <div className="mt-3 flex flex-col gap-2.5">
                    <input
                        type="text"
                        value={value.customName}
                        onChange={(e) => onChange({ ...value, customName: e.target.value })}
                        placeholder="Que tipo de profissional? Ex: tosador, fotógrafo..."
                        maxLength={60}
                        className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                        style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                    />
                    <div>
                        <p className="text-[11px] font-bold mb-1.5" style={{ color: colors.textSecondary }}>Escolha um ícone</p>
                        <div className="flex flex-wrap gap-1.5">
                            {SERVICE_ICON_OPTIONS.map((o) => {
                                const OIcon = o.icon
                                const active = (value.customIcon || 'briefcase') === o.key
                                return (
                                    <button
                                        key={o.key}
                                        type="button"
                                        title={o.label}
                                        aria-label={o.label}
                                        onClick={() => onChange({ ...value, customIcon: o.key })}
                                        className="w-9 h-9 rounded-xl flex items-center justify-center"
                                        style={active ? { background: GRADIENT, color: '#fff' } : { background: colors.surface, color: colors.textSecondary, border: `1px solid ${colors.border}` }}
                                    >
                                        <OIcon size={16} />
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                    <p className="text-[11px]" style={{ color: colors.textSecondary }}>
                        Quando mais de 2 pessoas pedirem esse mesmo tipo, ele entra na lista pra todo mundo.
                    </p>
                </div>
            )}
        </div>
    )
}
