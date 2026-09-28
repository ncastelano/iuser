// components/AdminDashboard/ExpenseForm.tsx
'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Spinner } from '@/components/Spinner'
import { callAdminApi } from '@/lib/callAdminApi'
import type { ThemeColors } from '@/app/contexts/theme'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

export interface ExpenseRow {
    id: string
    service_name: string
    category: string | null
    plan_name: string | null
    monthly_cost: number
    billing_cycle: 'monthly' | 'yearly' | 'usage' | 'one_time'
    currency: string
    next_due_date: string | null
    billing_url: string | null
    notes: string | null
    is_active: boolean
}

export const BILLING_CYCLE_LABEL: Record<ExpenseRow['billing_cycle'], string> = {
    monthly: 'Mensal',
    yearly: 'Anual',
    usage: 'Por uso (variável)',
    one_time: 'Pagamento único',
}

export function normalizedMonthlyCost(row: ExpenseRow): number {
    if (row.billing_cycle === 'yearly') return Number(row.monthly_cost) / 12
    if (row.billing_cycle === 'usage' || row.billing_cycle === 'one_time') return 0
    return Number(row.monthly_cost)
}

export function daysUntil(dateStr: string | null): number | null {
    if (!dateStr) return null
    const diff = new Date(dateStr + 'T00:00:00').getTime() - new Date(new Date().toDateString()).getTime()
    return Math.round(diff / (24 * 60 * 60 * 1000))
}

// Formulário de criar/editar um serviço pago rastreado na aba Financeiro
// — compartilhado entre a lista genérica (FinanceSection) e os cards
// dedicados de serviço específico (ex: SupabaseUsagePanel), que editam
// a mesma linha de service_expenses sem duplicar UI.
export function ExpenseForm({
    colors,
    cardStyle,
    initial,
    onCancel,
    onSaved,
}: {
    colors: ThemeColors
    cardStyle: React.CSSProperties
    initial: ExpenseRow | null
    onCancel: () => void
    onSaved: () => void
}) {
    const [serviceName, setServiceName] = useState(initial?.service_name || '')
    const [category, setCategory] = useState(initial?.category || '')
    const [planName, setPlanName] = useState(initial?.plan_name || '')
    const [monthlyCost, setMonthlyCost] = useState(initial ? String(initial.monthly_cost) : '')
    const [billingCycle, setBillingCycle] = useState<ExpenseRow['billing_cycle']>(initial?.billing_cycle || 'monthly')
    const [nextDueDate, setNextDueDate] = useState(initial?.next_due_date || '')
    const [billingUrl, setBillingUrl] = useState(initial?.billing_url || '')
    const [notes, setNotes] = useState(initial?.notes || '')
    const [isActive, setIsActive] = useState(initial ? initial.is_active : true)
    const [saving, setSaving] = useState(false)

    const inputStyle: React.CSSProperties = {
        background: colors.background,
        border: `1px solid ${colors.border}`,
        color: colors.textPrimary,
        borderRadius: 12,
        padding: '8px 12px',
        fontSize: 13,
    }

    const submit = async () => {
        if (!serviceName.trim()) {
            toast.error('Nome do serviço é obrigatório')
            return
        }
        setSaving(true)
        try {
            await callAdminApi('/api/admin/expenses/save', {
                id: initial?.id,
                serviceName,
                category,
                planName,
                monthlyCost: Number(monthlyCost.replace(',', '.')) || 0,
                billingCycle,
                nextDueDate: nextDueDate || null,
                billingUrl,
                notes,
                isActive,
            })
            toast.success(initial ? 'Serviço atualizado!' : 'Serviço adicionado!')
            onSaved()
        } catch (err: any) {
            toast.error(err.message || 'Erro ao salvar')
        } finally {
            setSaving(false)
        }
    }

    return (
        <div style={cardStyle} className="space-y-3">
            <p className="text-xs font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                {initial ? 'Editar serviço' : 'Novo serviço'}
            </p>
            <div className="grid grid-cols-2 gap-2">
                <input type="text" placeholder="Nome (ex: Supabase)" value={serviceName} onChange={(e) => setServiceName(e.target.value)} style={inputStyle} className="col-span-2" />
                <input type="text" placeholder="Categoria" value={category} onChange={(e) => setCategory(e.target.value)} style={inputStyle} />
                <input type="text" placeholder="Plano" value={planName} onChange={(e) => setPlanName(e.target.value)} style={inputStyle} />
                <input type="text" inputMode="decimal" placeholder="Custo (R$)" value={monthlyCost} onChange={(e) => setMonthlyCost(e.target.value)} style={inputStyle} />
                <select value={billingCycle} onChange={(e) => setBillingCycle(e.target.value as ExpenseRow['billing_cycle'])} style={inputStyle}>
                    <option value="monthly">Mensal</option>
                    <option value="yearly">Anual</option>
                    <option value="usage">Por uso (variável)</option>
                    <option value="one_time">Pagamento único</option>
                </select>
                <div className="col-span-2 flex flex-col gap-0.5">
                    <span className="text-[10px]" style={{ color: colors.textSecondary }}>Próximo vencimento</span>
                    <input type="date" value={nextDueDate} onChange={(e) => setNextDueDate(e.target.value)} style={inputStyle} />
                </div>
                <input type="text" placeholder="Link da cobrança (opcional)" value={billingUrl} onChange={(e) => setBillingUrl(e.target.value)} style={inputStyle} className="col-span-2" />
                <textarea placeholder="Notas" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} style={inputStyle} className="col-span-2 resize-none" />
            </div>
            <label className="flex items-center gap-1.5 text-[11px] font-bold" style={{ color: colors.textPrimary }}>
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                Ativo (conta pro total de gastos)
            </label>
            <div className="flex gap-2">
                <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl text-sm font-bold" style={{ background: `${colors.border}30`, color: colors.textPrimary }}>
                    Cancelar
                </button>
                <button onClick={submit} disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-60" style={{ background: GRADIENT }}>
                    {saving ? <Spinner size={14} color="#ffffff" /> : 'Salvar'}
                </button>
            </div>
        </div>
    )
}
