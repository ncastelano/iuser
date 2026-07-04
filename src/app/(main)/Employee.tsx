'use client'

import React, { useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/theme'
import { toast } from 'sonner'
import {
    Truck,
    ChevronRight,
    X,
    Plus,
    Pencil,
    Trash2,
    Save,
} from 'lucide-react'

interface EmployeeType {
    id: string
    name: string
    phone?: string
    is_active: boolean
}

interface RouteStop {
    lat: number | null
    lng: number | null
    label: string
    address: string
    status: string
    payment_method: string
    total_amount: number
    delivery_fee: number
    items: { product_name: string; quantity: number }[]
}

interface RouteData {
    employeeId: string
    employeeName: string
    color: string
    stops: RouteStop[]
}

interface EmployeeProps {
    employees: EmployeeType[]
    employeeRoutes: RouteData[]
    assignmentMap: Map<string, { employeeName: string; status: string }>
    expandedEmployee: string | null
    onToggleExpand: (id: string | null) => void
    storeId: string
    onRefresh: () => void
}

export default function Employee({
    employees,
    employeeRoutes,
    expandedEmployee,
    onToggleExpand,
    storeId,
    onRefresh,
}: EmployeeProps) {
    const { colors } = useTheme()

    const [dialogOpen, setDialogOpen] = useState(false)
    const [editingEmployee, setEditingEmployee] = useState<EmployeeType | null>(null)
    const [formName, setFormName] = useState('')
    const [formPhone, setFormPhone] = useState('')
    const [saving, setSaving] = useState(false)

    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState<EmployeeType | null>(null)
    const [deleting, setDeleting] = useState(false)

    const handleAdd = () => {
        setEditingEmployee(null)
        setFormName('')
        setFormPhone('')
        setDialogOpen(true)
    }

    const handleEdit = (emp: EmployeeType) => {
        setEditingEmployee(emp)
        setFormName(emp.name)
        setFormPhone(emp.phone || '')
        setDialogOpen(true)
    }

    const handleSave = async () => {
        if (!formName.trim()) {
            toast.error('Nome é obrigatório')
            return
        }
        setSaving(true)
        try {
            if (editingEmployee) {
                const { error } = await supabase
                    .from('employees')
                    .update({ name: formName.trim(), phone: formPhone.trim() })
                    .eq('id', editingEmployee.id)
                if (error) throw error
                toast.success('Funcionário atualizado!')
            } else {
                const { error } = await supabase.from('employees').insert({
                    store_id: storeId,
                    name: formName.trim(),
                    phone: formPhone.trim(),
                    is_active: true,
                })
                if (error) throw error
                toast.success('Funcionário adicionado!')
            }
            setDialogOpen(false)
            onRefresh()
        } catch (err: any) {
            toast.error(err.message || 'Erro ao salvar')
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async () => {
        if (!deleteConfirmOpen) return
        setDeleting(true)
        try {
            const { error } = await supabase
                .from('employees')
                .update({ is_active: false })
                .eq('id', deleteConfirmOpen.id)
            if (error) throw error
            toast.success('Funcionário removido!')
            setDeleteConfirmOpen(null)
            onRefresh()
        } catch (err: any) {
            toast.error(err.message || 'Erro ao remover')
        } finally {
            setDeleting(false)
        }
    }

    return (
        <>
            <div className="mb-6 rounded-2xl p-4 border" style={{ background: 'transparent', borderColor: colors.border }}>
                <div className="flex justify-between items-center mb-2">
                    <h3 className="text-sm font-bold flex items-center gap-2" style={{ color: colors.textPrimary }}>
                        <Truck size={16} /> Funcionários ({employees.length})
                    </h3>
                    <button
                        onClick={handleAdd}
                        className="text-xs font-bold px-3 py-1 rounded-full"
                        style={{ background: colors.accent, color: 'white' }}
                    >
                        <Plus size={14} className="inline mr-1" />
                        Adicionar
                    </button>
                </div>

                {employees.length === 0 ? (
                    <p className="text-xs" style={{ color: colors.textSecondary }}>Nenhum funcionário cadastrado.</p>
                ) : (
                    <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                        {employees.map(emp => {
                            const route = employeeRoutes.find(r => r.employeeId === emp.id)
                            const isExpanded = expandedEmployee === emp.id

                            return (
                                <div
                                    key={emp.id}
                                    className="rounded-xl border"
                                    style={{ background: 'transparent', borderColor: colors.border }}
                                >
                                    <div
                                        onClick={() => onToggleExpand(isExpanded ? null : emp.id)}
                                        className="flex items-center justify-between p-3 cursor-pointer hover:bg-white/5 transition-colors"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div
                                                className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white"
                                                style={{ background: route?.color || '#6b7280' }}
                                            >
                                                {emp.name.charAt(0).toUpperCase()}
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>{emp.name}</p>
                                                <p className="text-xs" style={{ color: colors.textSecondary }}>
                                                    {route ? `${route.stops.length} paradas` : 'Sem entregas'}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    handleEdit(emp)
                                                }}
                                                className="p-1 rounded-full hover:bg-white/10"
                                                title="Editar funcionário"
                                            >
                                                <Pencil size={14} style={{ color: colors.textSecondary }} />
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    setDeleteConfirmOpen(emp)
                                                }}
                                                className="p-1 rounded-full hover:bg-white/10"
                                                title="Remover funcionário"
                                            >
                                                <Trash2 size={14} style={{ color: colors.textSecondary }} />
                                            </button>
                                            {route && route.stops.length > 0 && (
                                                <div className="flex -space-x-1">
                                                    {route.stops.slice(0, 3).map((stop, i) => (
                                                        <div
                                                            key={i}
                                                            className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] text-white border border-black/20"
                                                            style={{ background: route.color }}
                                                        >
                                                            {stop.label}
                                                        </div>
                                                    ))}
                                                    {route.stops.length > 3 && (
                                                        <div className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] text-white bg-gray-600 border border-black/20">
                                                            +{route.stops.length - 3}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                            <ChevronRight
                                                size={16}
                                                className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                                                style={{ color: colors.textSecondary }}
                                            />
                                        </div>
                                    </div>

                                    {isExpanded && route && (
                                        <div className="px-3 pb-3 pt-0">
                                            <div className="space-y-2 mt-2">
                                                <p className="text-xs font-bold" style={{ color: colors.textSecondary }}>
                                                    Entregas atribuídas:
                                                </p>
                                                {route.stops.map((stop: RouteStop, idx: number) => (
                                                    <div
                                                        key={idx}
                                                        className="p-3 rounded-lg text-xs"
                                                        style={{ background: `${route.color}10`, border: `1px solid ${route.color}30` }}
                                                    >
                                                        <div className="flex items-center justify-between mb-2">
                                                            <div className="flex items-center gap-2">
                                                                <span
                                                                    className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] text-white font-bold"
                                                                    style={{ background: route.color }}
                                                                >
                                                                    {stop.label}
                                                                </span>
                                                                <span className="font-medium" style={{ color: colors.textPrimary }}>
                                                                    {stop.address
                                                                        ? stop.address.substring(0, 40) + (stop.address.length > 40 ? '...' : '')
                                                                        : 'Sem endereço'}
                                                                </span>
                                                            </div>
                                                            <span
                                                                className="px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                                                                style={{
                                                                    background:
                                                                        stop.status === 'delivered' ? '#22c55e' :
                                                                            stop.status === 'in_transit' ? '#f59e0b' : '#94a3b8',
                                                                    color: 'white',
                                                                }}
                                                            >
                                                                {stop.status === 'pending' ? 'Pendente' :
                                                                    stop.status === 'in_transit' ? 'A caminho' : 'Entregue'}
                                                            </span>
                                                        </div>

                                                        <div className="ml-7 space-y-2">
                                                            {stop.items && stop.items.length > 0 && (
                                                                <div>
                                                                    <p className="text-[10px] font-bold mb-1" style={{ color: colors.textSecondary }}>
                                                                        Produtos:
                                                                    </p>
                                                                    <ul className="list-disc list-inside text-[10px]" style={{ color: colors.textPrimary }}>
                                                                        {stop.items.map((item, i) => (
                                                                            <li key={i}>
                                                                                {item.product_name} x{item.quantity}
                                                                            </li>
                                                                        ))}
                                                                    </ul>
                                                                </div>
                                                            )}

                                                            <div className="flex flex-col gap-1 text-[10px]" style={{ color: colors.textSecondary }}>
                                                                <div className="flex items-center gap-1">
                                                                    <span className="font-bold">Pagamento:</span>
                                                                    <span className="capitalize" style={{ color: colors.textPrimary }}>
                                                                        {stop.payment_method === 'credit_card' ? '💳 Cartão' :
                                                                            stop.payment_method === 'pix' ? '🔷 Pix' :
                                                                                stop.payment_method === 'money' ? '💵 Dinheiro' :
                                                                                    stop.payment_method || '—'}
                                                                    </span>
                                                                    {stop.payment_method === 'credit_card' && (
                                                                        <span className="text-red-400 font-bold">(Levar máquina)</span>
                                                                    )}
                                                                    {stop.payment_method === 'money' && (
                                                                        <span className="text-yellow-400 font-bold">(Levar troco)</span>
                                                                    )}
                                                                </div>
                                                                <div className="flex items-center gap-1">
                                                                    <span className="font-bold">Total:</span>
                                                                    <span style={{ color: colors.textPrimary }}>
                                                                        R$ {Number(stop.total_amount || 0).toFixed(2)}
                                                                    </span>
                                                                    {stop.delivery_fee > 0 && (
                                                                        <span style={{ color: colors.textSecondary }}>
                                                                            (frete R$ {Number(stop.delivery_fee).toFixed(2)})
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}

                                                {route.stops.length === 0 && (
                                                    <p className="text-xs text-center py-2" style={{ color: colors.textSecondary }}>
                                                        Nenhuma entrega mapeada.
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>

            {/* Diálogo de Adicionar / Editar */}
            {dialogOpen && (
                <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setDialogOpen(false)}>
                    <div className="w-full max-w-xs rounded-3xl p-6 shadow-2xl" style={{ background: colors.surface }} onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between mb-4">
                            <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>
                                {editingEmployee ? 'Editar funcionário' : 'Novo funcionário'}
                            </h3>
                            <button onClick={() => setDialogOpen(false)}><X size={20} /></button>
                        </div>
                        <div className="space-y-3">
                            <input
                                type="text"
                                placeholder="Nome"
                                className="w-full border rounded-lg px-3 py-2 text-sm"
                                style={{ background: colors.surface, borderColor: colors.border, color: colors.textPrimary }}
                                value={formName}
                                onChange={e => setFormName(e.target.value)}
                            />
                            <input
                                type="text"
                                placeholder="Telefone (opcional)"
                                className="w-full border rounded-lg px-3 py-2 text-sm"
                                style={{ background: colors.surface, borderColor: colors.border, color: colors.textPrimary }}
                                value={formPhone}
                                onChange={e => setFormPhone(e.target.value)}
                            />
                            <button
                                onClick={handleSave}
                                disabled={saving || !formName.trim()}
                                className="w-full py-2 rounded-full font-bold text-sm flex items-center justify-center gap-2"
                                style={{ background: colors.accent, color: 'white' }}
                            >
                                {saving ? (
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <><Save size={14} /> Salvar</>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Diálogo de confirmação de exclusão */}
            {deleteConfirmOpen && (
                <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setDeleteConfirmOpen(null)}>
                    <div className="w-full max-w-xs rounded-3xl p-6 shadow-2xl" style={{ background: colors.surface }} onClick={e => e.stopPropagation()}>
                        <div className="text-center">
                            <h3 className="text-lg font-black mb-2" style={{ color: colors.textPrimary }}>Remover funcionário</h3>
                            <p className="text-sm mb-4" style={{ color: colors.textSecondary }}>
                                Tem certeza que deseja desativar <strong>{deleteConfirmOpen.name}</strong>?
                            </p>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setDeleteConfirmOpen(null)}
                                    className="flex-1 py-2 rounded-full font-bold text-sm"
                                    style={{ background: 'transparent', border: `1px solid ${colors.border}`, color: colors.textSecondary }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleDelete}
                                    disabled={deleting}
                                    className="flex-1 py-2 rounded-full font-bold text-sm flex items-center justify-center gap-2"
                                    style={{ background: '#ef4444', color: 'white' }}
                                >
                                    {deleting ? (
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        'Remover'
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}