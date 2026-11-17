// src/components/driver/ProfileQuoteCard.tsx
//
// "Valor do botão do seu perfil" (Canal do Motorista → Tarifa; 17/11/2026): o motorista escolhe qual valor o botão "Solicitar corrida" da página
// dele manda — Tarifa iUser (o padrão), a tarifa própria por km ou a por tempo. Grava `driver_pricing.profile_quote` (a linha é do próprio
// motorista; RLS de sempre). A conta mora em modules/driver-profile; a página pública lê get_driver_public_quote.
'use client'

import { useEffect, useState } from 'react'
import { Check, ExternalLink } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { toast } from '@/lib/toast'
import { useTheme } from '@/app/contexts/theme'
import { QUOTE_MODES, type QuoteMode } from '@/modules/driver-profile'

const GREEN = '#16a34a'

export default function ProfileQuoteCard({ driverId, profileSlug }: { driverId: string; profileSlug?: string | null }) {
    const { colors } = useTheme()
    const [mode, setMode] = useState<QuoteMode | null>(null)
    const [custom, setCustom] = useState(false)
    const [hasTime, setHasTime] = useState(false)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        let alive = true
        supabase.from('driver_pricing').select('profile_quote, pricing_mode, price_per_minute').eq('driver_id', driverId).maybeSingle().then(({ data }) => {
            if (!alive) return
            const d = data as any
            setCustom(d?.pricing_mode === 'custom')
            setHasTime(d?.price_per_minute != null)
            setMode((d?.profile_quote as QuoteMode) || (d?.pricing_mode === 'custom' ? 'km' : 'platform'))
        })
        return () => { alive = false }
    }, [driverId])

    if (mode === null) return null
    const choose = async (m: QuoteMode) => {
        if (m === mode || saving) return
        const prev = mode
        setMode(m); setSaving(true)
        const { data, error } = await supabase.from('driver_pricing').update({ profile_quote: m }).eq('driver_id', driverId).select('driver_id')
        let err = error
        if (!err && (!data || data.length === 0)) ({ error: err } = await supabase.from('driver_pricing').insert({ driver_id: driverId, profile_quote: m }))
        setSaving(false)
        if (err) { setMode(prev); toast.error('Não deu para salvar: ' + err.message); return }
        toast.success('O botão do seu perfil agora usa: ' + QUOTE_MODES.find((x) => x.id === m)!.title)
    }
    const note = (m: QuoteMode) =>
        m === 'km' && !custom ? 'Você ainda não tem tarifa própria por km: vale a Tarifa iUser até definir.'
            : m === 'time' && !hasTime ? 'Sem valor por minuto próprio: vale o mínimo do iUser (R$ 40 por hora).'
                : null

    return (
        <section className="rounded-3xl p-4 flex flex-col gap-3" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
            <div>
                <h3 className="text-[15px] font-black" style={{ color: colors.textPrimary }}>Valor do botão do seu perfil</h3>
                <p className="text-[12px] leading-snug mt-0.5" style={{ color: colors.textSecondary }}>Quem abre o seu perfil toca em <b>Solicitar corrida</b> e o pedido já vai com este valor como oferta: é só você aceitar.</p>
            </div>
            <div className="flex flex-col gap-2" role="radiogroup" aria-label="Valor do botão do perfil">
                {QUOTE_MODES.map((m) => {
                    const on = m.id === mode
                    const n = note(m.id)
                    return (
                        <button key={m.id} type="button" role="radio" aria-checked={on} onClick={() => choose(m.id)} disabled={saving}
                            className="w-full rounded-2xl p-3 flex items-center gap-3 text-left transition active:scale-[0.99] disabled:opacity-70"
                            style={{ background: on ? `${GREEN}12` : `${colors.border}25`, boxShadow: on ? `inset 0 0 0 2px ${GREEN}` : undefined }}>
                            <span className="min-w-0 flex-1">
                                <span className="block text-[14px] font-black" style={{ color: colors.textPrimary }}>{m.title}{m.id === 'platform' ? <span className="text-[11px] font-bold" style={{ color: colors.textSecondary }}> · padrão</span> : null}</span>
                                <span className="block text-[11.5px] leading-snug" style={{ color: colors.textSecondary }}>{m.desc}</span>
                                {on && n && <span className="block text-[11px] font-bold mt-1" style={{ color: '#b45309' }}>{n}</span>}
                            </span>
                            <span className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={on ? { background: GREEN, color: '#fff' } : { boxShadow: `inset 0 0 0 2px ${colors.border}` }}>{on && <Check size={14} strokeWidth={3} />}</span>
                        </button>
                    )
                })}
            </div>
            {profileSlug && (
                <a href={`/${profileSlug}`} className="h-10 rounded-full flex items-center justify-center gap-1.5 text-[12.5px] font-black" style={{ background: `${GREEN}14`, color: GREEN }}>
                    Ver o meu perfil como o cliente vê <ExternalLink size={13} />
                </a>
            )}
        </section>
    )
}
