// src/components/uploads/MySpace.tsx — "MEU ESPAÇO": para cada tipo de envio, as REGRAS de tamanho (por arquivo, por hora, por dia, no total) e quanto a pessoa já usou, com uma barra
// (verde até 80%, amarela perto do limite, vermelha cheia). Serve para a pessoa saber ANTES de enviar. Quem recusa de verdade é o banco; isto só mostra o que ele decide.
'use client'

import { useEffect, useState } from 'react'
import { HardDrive } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { fetchMyUploadLimits } from '@/lib/myUploadLimits'
import { formatBytes, percentUsed, ruleText, spaceTone, type UploadLimit } from '@/modules/uploads'

const TONE = { ok: '#22c55e', warn: '#f59e0b', full: '#ef4444' } as const

export default function MySpace({ kinds, onlyUsed = false, limits: given, title = 'Meu espaço' }: { kinds?: string[]; onlyUsed?: boolean; limits?: Record<string, UploadLimit> | null; title?: string }) {
    const { colors } = useTheme()
    const { userId } = useProfile()
    const [own, setOwn] = useState<Record<string, UploadLimit> | null>(null)
    useEffect(() => { if (given !== undefined || !userId) return; let on = true; fetchMyUploadLimits().then((l) => { if (on) setOwn(l) }); return () => { on = false } }, [given, userId])
    const all = given !== undefined ? given : own
    if (!all) return null
    const list = Object.values(all).filter((l) => (!kinds || kinds.includes(l.kind)) && l.enabled !== undefined && (!onlyUsed || l.usedBytes > 0)).sort((a, b) => (kinds ? kinds.indexOf(a.kind) - kinds.indexOf(b.kind) : a.label.localeCompare(b.label)))
    if (list.length === 0) return null

    return (
        <section className="rounded-2xl p-3 flex flex-col gap-3" style={{ background: `${colors.border}1f`, border: `1px solid ${colors.border}` }}>
            <p className="text-sm font-black flex items-center gap-1.5" style={{ color: colors.textPrimary }}><HardDrive size={15} style={{ color: '#f97316' }} /> {title}</p>
            {list.map((l) => {
                const pct = percentUsed(l.usedBytes, l.perUserBytes)
                const dayPct = percentUsed(l.usedDayBytes, l.perDayBytes)
                const tone = spaceTone(Math.max(pct, dayPct))
                return (
                    <div key={l.kind} className="flex flex-col gap-1">
                        <div className="flex items-baseline justify-between gap-2">
                            <span className="text-[13px] font-black min-w-0" style={{ color: colors.textPrimary }}>{l.label}</span>
                            <span className="text-[11px] font-bold flex-shrink-0" style={{ color: tone === 'ok' ? colors.textSecondary : TONE[tone] }}>
                                {formatBytes(l.usedBytes)}{l.perUserBytes ? ` de ${formatBytes(l.perUserBytes)}` : ''}
                            </span>
                        </div>
                        {l.perUserBytes ? <div className="h-1.5 rounded-full overflow-hidden" style={{ background: colors.border }}><div className="h-full rounded-full" style={{ width: `${Math.max(pct, l.usedBytes > 0 ? 2 : 0)}%`, background: TONE[spaceTone(pct)], transition: 'width .4s' }} /></div> : null}
                        <p className="text-[11px] leading-snug" style={{ color: colors.textSecondary }}>
                            {l.enabled ? ruleText(l) : 'Envio desligado no momento'}
                            {l.perDayBytes && l.usedDayBytes > 0 ? <> · hoje: <b style={{ color: dayPct >= 80 ? TONE[spaceTone(dayPct)] : colors.textPrimary }}>{formatBytes(l.usedDayBytes)} de {formatBytes(l.perDayBytes)}</b></> : null}
                        </p>
                    </div>
                )
            })}
        </section>
    )
}
