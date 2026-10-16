// src/components/AdminDashboard/DeliverySettingsSection.tsx
//
// Admin → Entregas: como a oferta de entrega iUser dos pedidos da loja procura motorista.
// O frete inicial é a Tarifa iUser (Admin → Tarifas). Se ninguém aceita, a cada intervalo o raio
// cresce e o sistema PROPÕE ao cliente um frete maior (só vale se o cliente autorizar).
'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase/client'
import { callAdminApi } from '@/lib/callAdminApi'
import { Spinner } from '@/components/Spinner'
import type { ThemeColors } from '@/app/contexts/theme'

type Form = {
    retry_interval_minutes: string
    increase_kind: 'fixed' | 'percent'
    increase_value: string
    initial_radius_km: string
    radius_step_km: string
    max_freight: string
    max_rounds: string
    platform_fee_percent: string
}

const num = (v: string) => Number(String(v).replace(',', '.')) || 0

export default function DeliverySettingsSection({ cardStyle, colors }: { cardStyle: React.CSSProperties; colors: ThemeColors }) {
    const [form, setForm] = useState<Form | null>(null)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        supabase.from('delivery_dispatch_settings').select('*').eq('id', true).maybeSingle().then(({ data }) => {
            if (data) setForm({
                retry_interval_minutes: String(data.retry_interval_minutes),
                increase_kind: data.increase_kind,
                increase_value: String(data.increase_value),
                initial_radius_km: String(data.initial_radius_km),
                radius_step_km: String(data.radius_step_km),
                max_freight: String(data.max_freight),
                max_rounds: String(data.max_rounds),
                platform_fee_percent: String(data.platform_fee_percent),
            })
        })
    }, [])

    if (!form) return <div style={cardStyle} className="flex justify-center py-8"><Spinner size={24} color={colors.accent} /></div>

    const set = (k: keyof Form, v: string) => setForm({ ...form, [k]: v } as Form)
    const inputStyle: React.CSSProperties = { background: colors.background, border: `1px solid ${colors.border}`, color: colors.textPrimary, borderRadius: 12, padding: '8px 12px', fontSize: 13, width: '100%' }

    const save = async () => {
        setSaving(true)
        try {
            await callAdminApi('/api/admin/delivery-settings', {
                increase_kind: form.increase_kind,
                retry_interval_minutes: num(form.retry_interval_minutes),
                increase_value: num(form.increase_value),
                initial_radius_km: num(form.initial_radius_km),
                radius_step_km: num(form.radius_step_km),
                max_freight: num(form.max_freight),
                max_rounds: num(form.max_rounds),
                platform_fee_percent: num(form.platform_fee_percent),
            })
            toast.success('Regras de entrega salvas!')
        } catch (err: any) {
            toast.error(err.message || 'Erro ao salvar')
        } finally {
            setSaving(false)
        }
    }

    const field = (k: Exclude<keyof Form, 'increase_kind'>, label: string, hint: string) => (
        <label key={k} className="flex flex-col gap-0.5">
            <span className="text-[11px] font-bold" style={{ color: colors.textPrimary }}>{label}</span>
            <input type="text" inputMode="decimal" value={form[k]} onChange={(e) => set(k, e.target.value)} style={inputStyle} />
            <span className="text-[10px]" style={{ color: colors.textSecondary }}>{hint}</span>
        </label>
    )

    return (
        <div style={cardStyle} className="flex flex-col gap-4">
            <div>
                <h3 className="text-base font-black" style={{ color: colors.textPrimary }}>Entregas dos pedidos (entregador iUser)</h3>
                <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>
                    A loja aceita o pedido, a oferta aparece para os motoristas dentro do raio com o frete da Tarifa iUser (moto + extra de objeto).
                    Se ninguém aceitar, o raio cresce e o cliente é convidado a aumentar o frete. Nada é cobrado a mais sem ele autorizar,
                    e o acréscimo nunca sai da loja nem do iUser.
                </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {field('initial_radius_km', 'Raio inicial (km)', 'Distância da loja em que o motorista vê a oferta')}
                {field('radius_step_km', 'Expansão do raio por tentativa (km)', 'Soma a cada intervalo sem motorista')}
                {field('retry_interval_minutes', 'Tempo entre tentativas (min)', 'Quanto esperar antes de ampliar o raio e propor aumento')}
                {field('max_rounds', 'Número máximo de tentativas', 'Depois disso a busca segue sem novas propostas')}
                <label className="flex flex-col gap-0.5">
                    <span className="text-[11px] font-bold" style={{ color: colors.textPrimary }}>Tipo de aumento</span>
                    <select value={form.increase_kind} onChange={(e) => set('increase_kind', e.target.value)} style={inputStyle}>
                        <option value="fixed">Valor fixo (R$)</option>
                        <option value="percent">Percentual (%) do frete atual</option>
                    </select>
                    <span className="text-[10px]" style={{ color: colors.textSecondary }}>Como cada proposta ao cliente é calculada</span>
                </label>
                {field('increase_value', form.increase_kind === 'fixed' ? 'Aumento por tentativa (R$)' : 'Aumento por tentativa (%)', 'Proposto ao cliente a cada tentativa')}
                {field('max_freight', 'Frete máximo permitido (R$)', 'Nenhuma proposta passa desse valor')}
                {field('platform_fee_percent', 'Taxa da plataforma sobre o frete (%)', 'Contabilizada à parte: o motorista recebe o frete menos essa taxa')}
            </div>

            <button
                onClick={save}
                disabled={saving}
                className="self-start px-5 py-2 rounded-full text-sm font-black disabled:opacity-60"
                style={{ background: colors.accent, color: colors.accentText }}
            >
                {saving ? 'Salvando...' : 'Salvar'}
            </button>
        </div>
    )
}
