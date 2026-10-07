// src/components/AdminDashboard/PlatformTariffsSection.tsx
//
// Admin → Tarifas: a Tarifa da plataforma num lugar só. É o que todo motorista
// sem tarifa própria usa ("Tarifa iUser") e o valor de referência mostrado em
// toda corrida. Por tipo de veículo: valor base, quilometragem, tempo e extras.
'use client'

import { useCallback, useEffect, useState } from 'react'
import { Car, Bike, Motorbike, Route, Save } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase/client'
import { callAdminApi } from '@/lib/callAdminApi'
import { Spinner } from '@/components/Spinner'
import type { ThemeColors } from '@/app/contexts/theme'
import { PLATFORM_TARIFF_COLUMNS, loadPlatformTariffs, type PlatformTariffRow } from '@/lib/platformTariffs'
import { computeHourlyEarnings, computePickupFee, explainSuggestedPrice, type DriverPricing } from '@/lib/driverPricing'
import type { VehicleKind } from '@/lib/rideVehicle'

const VEHICLES: { kind: VehicleKind; label: string; icon: typeof Car }[] = [
    { kind: 'carro', label: 'Carro', icon: Car },
    { kind: 'moto', label: 'Moto', icon: Motorbike },
    { kind: 'bicicleta', label: 'Bicicleta', icon: Bike },
]

type Form = Record<Exclude<keyof PlatformTariffRow, 'vehicle_kind'>, string>

const MAIN_FIELDS: { key: keyof Form; label: string; hint: string }[] = [
    { key: 'base_fee', label: 'Valor base (R$)', hint: 'cobrado até a distância base' },
    { key: 'base_distance_km', label: 'Distância base (km)', hint: 'km incluídos no valor base' },
    { key: 'price_per_km', label: 'Quilometragem: extra por km (R$)', hint: 'por km acima da distância base' },
]
const TYPE_FIELDS: { key: keyof Form; label: string }[] = [
    { key: 'extra_fee_pessoa', label: 'Pessoa' },
    { key: 'extra_fee_animal', label: 'Animal' },
    { key: 'extra_fee_objeto', label: 'Objeto' },
]
const CONDITION_FIELDS: { key: keyof Form; label: string }[] = [
    { key: 'fee_condominio', label: 'Condomínio' },
    { key: 'fee_compras', label: 'Compras no mercado' },
    { key: 'fee_necessidade_especial', label: 'Pessoa com deficiência' },
    { key: 'fee_pet_sem_caixa', label: 'Pet sem caixa' },
    { key: 'fee_entrega_interna', label: 'Entrega em área interna' },
    { key: 'fee_ar_condicionado', label: 'Ar condicionado' },
]

const toForm = (row: PlatformTariffRow): Form => {
    const { vehicle_kind: _k, ...rest } = row
    return Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, String(v)])) as Form
}
const num = (v: string) => Number(String(v).replace(',', '.')) || 0
const brl = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`

export default function PlatformTariffsSection({ cardStyle, colors }: { cardStyle: React.CSSProperties; colors: ThemeColors }) {
    const [loading, setLoading] = useState(true)
    const [vehicle, setVehicle] = useState<VehicleKind>('carro')
    const [forms, setForms] = useState<Partial<Record<VehicleKind, Form>>>({})
    const [saving, setSaving] = useState(false)
    const [missingTable, setMissingTable] = useState(false)

    const load = useCallback(async () => {
        setLoading(true)
        const { data, error } = await supabase.from('platform_tariffs').select(PLATFORM_TARIFF_COLUMNS)
        if (error || !data) {
            setMissingTable(true)
        } else {
            setMissingTable(false)
            const next: Partial<Record<VehicleKind, Form>> = {}
            for (const row of data as PlatformTariffRow[]) next[row.vehicle_kind] = toForm(row)
            setForms(next)
        }
        setLoading(false)
    }, [])

    useEffect(() => { load() }, [load])

    const form = forms[vehicle]
    const setField = (key: keyof Form, value: string) => setForms((prev) => ({ ...prev, [vehicle]: { ...(prev[vehicle] as Form), [key]: value } }))

    const save = async () => {
        if (!form) return
        setSaving(true)
        try {
            await callAdminApi('/api/admin/platform-tariffs/update', {
                vehicleKind: vehicle,
                ...Object.fromEntries(Object.entries(form).map(([k, v]) => [k, num(v)])),
            })
            await loadPlatformTariffs(supabase, true)
            toast.success(`Tarifa de ${VEHICLES.find((v) => v.kind === vehicle)?.label.toLowerCase()} atualizada!`)
        } catch (err: any) {
            toast.error(err.message || 'Erro ao salvar a tarifa')
        } finally {
            setSaving(false)
        }
    }

    const inputStyle: React.CSSProperties = {
        background: colors.background,
        border: `1px solid ${colors.border}`,
        color: colors.textPrimary,
        borderRadius: 12,
        padding: '8px 12px',
        fontSize: 13,
        width: '100%',
    }

    if (loading) return <div style={cardStyle} className="flex justify-center py-8"><Spinner size={24} color={colors.accent} /></div>

    if (missingTable || !form) {
        return (
            <div style={cardStyle}>
                <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>Tarifas ainda não disponíveis</p>
                <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>
                    A tabela platform_tariffs não foi encontrada. Rode a migration 20261020000000_platform_tariffs.sql (supabase db push) e recarregue.
                </p>
            </div>
        )
    }

    // Exemplo ao vivo com os valores digitados: 10 km e 20 min
    const live: DriverPricing = {
        baseDistanceKm: num(form.base_distance_km),
        baseFee: num(form.base_fee),
        pricePerKmAfterBase: num(form.price_per_km),
        extraFees: { pessoa: 0, animal: 0, objeto: 0 },
        conditionExtraFees: { condominio: 0, compras: 0, necessidade_especial: 0, pet_sem_caixa: 0, entrega_interna: 0, ar_condicionado: 0 },
    }
    const example = explainSuggestedPrice(10, live)
    // Ganho por hora do exemplo: corrida de 10 km + 2 km até o passageiro, a 40 km/h.
    // A Tarifa iUser soma o deslocamento (km × valor/km); as horas contam o deslocamento também.
    const pickupFee = computePickupFee(live, 2)
    const hourly = computeHourlyEarnings(example.total + pickupFee, 10, 2)

    const field = (key: keyof Form, label: string, hint?: string) => (
        <div key={key} className="flex flex-col gap-0.5">
            <span className="text-[10px] font-bold" style={{ color: colors.textSecondary }}>{label}</span>
            <input type="text" inputMode="decimal" value={form[key]} onChange={(e) => setField(key, e.target.value)} style={inputStyle} />
            {hint && <span className="text-[9px]" style={{ color: colors.textSecondary }}>{hint}</span>}
        </div>
    )

    return (
        <div className="space-y-4">
            <div style={cardStyle} className="space-y-1">
                <p className="text-xs font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>Tarifa da plataforma</p>
                <p className="text-xs" style={{ color: colors.textSecondary }}>
                    Tudo da Tarifa iUser num lugar só. O preço de uma corrida é: <strong style={{ color: colors.textPrimary }}>valor base + quilometragem acima da distância base + extras</strong>. A mudança vale na hora para todos os motoristas que usam a tarifa da plataforma.
                </p>
            </div>

            <div className="flex gap-2">
                {VEHICLES.map(({ kind, label, icon: Icon }) => (
                    <button
                        key={kind}
                        onClick={() => setVehicle(kind)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-full text-xs font-black"
                        style={vehicle === kind
                            ? { background: colors.accent, color: colors.accentText, border: `1px solid ${colors.accent}` }
                            : { background: 'transparent', color: colors.textPrimary, border: `1px solid ${colors.border}` }}
                    >
                        <Icon size={14} />
                        {label}
                    </button>
                ))}
            </div>

            <div style={cardStyle} className="space-y-3">
                <p className="text-xs font-black flex items-center gap-1.5" style={{ color: colors.textPrimary }}>
                    <Route size={13} /> Valor base e quilometragem
                </p>
                <div className="grid grid-cols-2 gap-3">
                    {MAIN_FIELDS.map((f) => field(f.key, f.label, f.hint))}
                </div>
                <div className="rounded-xl p-3 text-[11px] leading-snug" style={{ background: `${colors.accent}12`, color: colors.textPrimary, border: `1px solid ${colors.border}` }}>
                    <strong>Exemplo (10 km):</strong> {brl(example.base)} base + {brl(example.kmPart)} de quilometragem ({example.extraKm.toFixed(1).replace('.', ',')} km acima da base × {brl(live.pricePerKmAfterBase)}) = <strong>{brl(example.total)}</strong>
                </div>
                {hourly && (
                    <div className="rounded-xl p-3 text-[11px] leading-snug" style={{ background: '#22c55e14', color: colors.textPrimary, border: '1px solid #22c55e40' }}>
                        <strong>Ganho por hora (exemplo):</strong> corrida de 10 km + 2 km até o passageiro, sempre a 40 km/h ({hourly.totalMin} min no total). {brl(example.total)} da corrida + {brl(pickupFee)} do deslocamento = {brl(example.total + pickupFee)} ÷ {hourly.hours.toFixed(2).replace('.', ',')} h = <strong>{brl(hourly.perHour)} por hora</strong>
                    </div>
                )}
            </div>

            <div style={cardStyle} className="space-y-3">
                <p className="text-xs font-black" style={{ color: colors.textPrimary }}>Extra por tipo de corrida</p>
                <div className="grid grid-cols-3 gap-3">
                    {TYPE_FIELDS.map((f) => field(f.key, f.label))}
                </div>
            </div>

            <div style={cardStyle} className="space-y-3">
                <p className="text-xs font-black" style={{ color: colors.textPrimary }}>Extra por condição da corrida</p>
                <div className="grid grid-cols-2 gap-3">
                    {CONDITION_FIELDS.map((f) => field(f.key, f.label))}
                </div>
            </div>

            <button
                onClick={save}
                disabled={saving}
                className="w-full py-3 rounded-full text-sm font-black flex items-center justify-center gap-2 disabled:opacity-60"
                style={{ background: colors.accent, color: colors.accentText }}
            >
                {saving ? <Spinner size={16} /> : <Save size={16} />}
                Salvar tarifa de {VEHICLES.find((v) => v.kind === vehicle)?.label.toLowerCase()}
            </button>
        </div>
    )
}
