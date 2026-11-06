// src/components/DriverEarningGoalCard.tsx
//
// "Meu ganho mínimo por hora" do motorista: opcional, privado (o passageiro nunca vê) e individual. Conta o tempo de ir buscar + a corrida.
// Proteção: só AVISAR quando uma oferta fica abaixo, ou NÃO ACEITAR abaixo do mínimo. Fica na aba Tarifa do painel do motorista.
'use client'

import { useEffect, useState } from 'react'
import { ShieldCheck, TrendingUp } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { Spinner } from '@/components/Spinner'
import { toast } from '@/lib/toast'
import { DEFAULT_MIN_HOURLY, loadEarningGoal, parseMoney, saveEarningGoal, validateAmount } from '@/modules/negotiation'

export default function DriverEarningGoalCard({ driverId }: { driverId: string | null }) {
    const { colors } = useTheme()
    const [value, setValue] = useState('')
    const [protection, setProtection] = useState<'warn' | 'block'>('warn')
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState<{ v: string; p: 'warn' | 'block' } | null>(null)
    // o padrão do iUser (R$/h) vale enquanto a pessoa não definir o dela; o campo fica vazio e mostra o padrão
    const [defaultHourly, setDefaultHourly] = useState(DEFAULT_MIN_HOURLY)
    const [usingDefault, setUsingDefault] = useState(true)

    useEffect(() => {
        if (!driverId) { setLoading(false); return }
        let alive = true
        void loadEarningGoal(driverId).then((g) => {
            if (!alive) return
            const own = !g.isDefault && g.minHourly != null
            const v = own ? String(g.minHourly).replace('.', ',') : ''
            setDefaultHourly(g.defaultHourly ?? DEFAULT_MIN_HOURLY); setUsingDefault(!own)
            setValue(v); setProtection(g.protection); setSaved({ v, p: g.protection }); setLoading(false)
        }).catch(() => { if (alive) setLoading(false) })
        return () => { alive = false }
    }, [driverId])

    if (!driverId) return null
    const dirty = !saved || saved.v !== value || saved.p !== protection

    const save = async () => {
        const trimmed = value.trim()
        let minHourly: number | null = null
        if (trimmed) {
            minHourly = parseMoney(trimmed)
            const err = validateAmount(minHourly)
            if (err || (minHourly != null && (minHourly < 1 || minHourly > 1000))) { toast.error('Digite um valor por hora entre R$ 1 e R$ 1.000'); return }
        }
        setSaving(true)
        try {
            await saveEarningGoal(driverId, { minHourly, protection })
            setSaved({ v: value, p: protection })
            setUsingDefault(!minHourly)
            toast.success(minHourly ? `Ganho mínimo salvo: R$ ${minHourly.toLocaleString('pt-BR')}/h` : `Voltou ao padrão do iUser: R$ ${defaultHourly.toLocaleString('pt-BR')}/h`)
        } catch (e: any) {
            toast.error(e?.message || 'Não foi possível salvar')
        } finally { setSaving(false) }
    }

    const opt = (on: boolean) => ({ background: on ? '#f9731614' : 'transparent', border: `2px solid ${on ? '#f97316' : colors.border}`, color: colors.textPrimary })

    return (
        <section className="rounded-2xl p-4 flex flex-col gap-3" style={{ background: colors.surface, border: `1px solid ${colors.border}` }} aria-label="Meu ganho mínimo por hora">
            <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#f973161f', color: '#f97316' }}><TrendingUp size={20} /></span>
                <div className="min-w-0">
                    <h3 className="text-[15px] font-black leading-tight" style={{ color: colors.textPrimary }}>Meu ganho mínimo por hora</h3>
                    <p className="text-[11px] leading-snug" style={{ color: colors.textSecondary }}>Só seu: o passageiro nunca vê. Contamos o tempo de ir buscar mais a corrida.</p>
                </div>
            </div>

            {loading ? <div className="flex justify-center py-3"><Spinner size={18} color={colors.accent} /></div> : (
                <>
                    <p className="text-[12px] leading-snug rounded-xl px-3 py-2" style={{ background: usingDefault ? '#f973161a' : `${colors.border}30`, color: colors.textPrimary }}>
                        {usingDefault
                            ? <>Hoje vale o <strong>padrão do iUser: R$ {defaultHourly.toLocaleString('pt-BR')} por hora</strong>. Escreva outro valor para usar o seu.</>
                            : <>Vale o <strong>seu</strong> valor. Apague e salve para voltar ao padrão do iUser (R$ {defaultHourly.toLocaleString('pt-BR')}/h).</>}
                    </p>
                    <label className="block">
                        <span className="block text-[11px] font-bold mb-1" style={{ color: colors.textSecondary }}>Quanto você quer ganhar, no mínimo, por hora de trabalho? (R$)</span>
                        <input
                            inputMode="decimal"
                            value={value}
                            onChange={(e) => setValue(e.target.value.replace(/[^\d.,]/g, '').slice(0, 7))}
                            placeholder={`Padrão do iUser: ${defaultHourly.toLocaleString('pt-BR')}`}
                            className="w-full px-4 py-3 rounded-full text-sm font-black outline-none"
                            style={{ background: colors.background, border: `1.5px solid ${colors.border}`, color: colors.textPrimary }}
                        />
                    </label>

                    {(value.trim() || usingDefault) && (
                        <div className="flex flex-col gap-2">
                            <p className="text-[11px] font-black flex items-center gap-1.5" style={{ color: colors.textSecondary }}><ShieldCheck size={13} /> Proteção do ganho mínimo</p>
                            <button onClick={() => setProtection('warn')} className="rounded-2xl p-3 text-left transition active:scale-[0.99]" style={opt(protection === 'warn')}>
                                <span className="block text-[13px] font-black">Apenas avisar</span>
                                <span className="block text-[11px]" style={{ color: colors.textSecondary }}>Mostra um alerta quando uma oferta fica abaixo do seu mínimo, mas você decide.</span>
                            </button>
                            <button onClick={() => setProtection('block')} className="rounded-2xl p-3 text-left transition active:scale-[0.99]" style={opt(protection === 'block')}>
                                <span className="block text-[13px] font-black">Não aceitar abaixo do mínimo</span>
                                <span className="block text-[11px]" style={{ color: colors.textSecondary }}>Impede aceitar ofertas abaixo do seu mínimo, inclusive pelos avisos do celular.</span>
                            </button>
                        </div>
                    )}

                    <button onClick={save} disabled={saving || !dirty} className="w-full h-11 rounded-full text-sm font-black text-white disabled:opacity-50 flex items-center justify-center gap-2" style={{ background: 'linear-gradient(135deg, #f97316, #dc2626)' }}>
                        {saving ? <Spinner size={14} /> : dirty ? 'Salvar ganho mínimo' : (usingDefault ? 'Usando o padrão do iUser' : 'Salvo')}
                    </button>
                </>
            )}
        </section>
    )
}
