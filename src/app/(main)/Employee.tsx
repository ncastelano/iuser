// components/Employee.tsx - Versão corrigida

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
    ChevronDown,
    ChevronUp,
} from 'lucide-react'

// ===== GRADIENTE FIXO LARANJA-VERMELHO =====
const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

// ===== STYLE PARA BOTÕES PILL =====
const pillButtonStyle = {
    padding: '0.5rem 1rem',
    borderRadius: '9999px',
    fontWeight: 700,
    fontSize: '0.75rem',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
    border: 'none',
    textDecoration: 'none',
}

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

function hexToRgb(hex: string) {
    const clean = hex.replace('#', '')
    const bigint = parseInt(clean, 16)
    return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 }
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
    const surfaceRgb = hexToRgb(colors.surface)

    const [dialogOpen, setDialogOpen] = useState(false)
    const [editingEmployee, setEditingEmployee] = useState<EmployeeType | null>(null)
    const [formName, setFormName] = useState('')
    const [formPhone, setFormPhone] = useState('')
    const [saving, setSaving] = useState(false)

    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState<EmployeeType | null>(null)
    const [deleting, setDeleting] = useState(false)

    const [isExpanded, setIsExpanded] = useState(true)

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

    const accentColor = colors.accent
    const textPrimary = colors.textPrimary
    const textSecondary = colors.textSecondary
    const borderColor = colors.border

    return (
        <>
            <div
                className="mb-6 rounded-2xl p-6 pt-7 flex flex-col gap-5 relative"
                style={{
                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    border: `1px solid ${borderColor}`,
                    boxShadow: colors.shadow,
                }}
            >
                {/* Cabeçalho com toggle */}
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="w-full flex items-center justify-between text-left"
                    style={{
                        padding: '0.5rem 0.75rem',
                        borderRadius: '9999px',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                    }}
                >
                    <div className="flex items-center gap-3">
                        <div
                            className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{
                                background: GRADIENT,
                                color: '#ffffff',
                            }}
                        >
                            <Truck size={24} />
                        </div>
                        <div>
                            <h3 className="text-lg font-black" style={{ color: textPrimary }}>
                                Funcionários
                            </h3>
                            <p className="text-xs mt-0.5" style={{ color: textSecondary }}>
                                {employees.length} funcionário{employees.length !== 1 ? 's' : ''} cadastrado{employees.length !== 1 ? 's' : ''}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {employees.length > 0 && (
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: '#f9731620', color: '#f97316' }}>
                                {employees.length}
                            </span>
                        )}
                        {isExpanded ? (
                            <ChevronUp size={22} style={{ color: textSecondary }} />
                        ) : (
                            <ChevronDown size={22} style={{ color: textSecondary }} />
                        )}
                    </div>
                </button>

                {isExpanded && (
                    <>
                        <div className="flex justify-between items-center">
                            <button
                                onClick={handleAdd}
                                style={{
                                    ...pillButtonStyle,
                                    background: GRADIENT,
                                    color: '#ffffff',
                                    boxShadow: `0 4px 12px #f9731640`,
                                }}
                                className="hover:scale-105 transition-transform"
                            >
                                <Plus size={14} />
                                Adicionar
                            </button>
                        </div>

                        {employees.length === 0 ? (
                            <div
                                className="rounded-2xl p-6 text-center"
                                style={{
                                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                    border: `1px dashed ${borderColor}`,
                                }}
                            >
                                <p className="text-sm" style={{ color: textSecondary }}>
                                    Nenhum funcionário cadastrado.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                                {employees.map(emp => {
                                    const route = employeeRoutes.find(r => r.employeeId === emp.id)
                                    const isExpandedEmp = expandedEmployee === emp.id

                                    return (
                                        <div
                                            key={emp.id}
                                            className="rounded-2xl border"
                                            style={{ background: 'transparent', borderColor: borderColor }}
                                        >
                                            <div
                                                onClick={() => onToggleExpand(isExpandedEmp ? null : emp.id)}
                                                className="flex items-center justify-between p-3 cursor-pointer hover:bg-white/5 transition-colors"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div
                                                        className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white"
                                                        style={{ background: route?.color || '#f97316' }}
                                                    >
                                                        {emp.name.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-bold" style={{ color: textPrimary }}>{emp.name}</p>
                                                        <p className="text-xs" style={{ color: textSecondary }}>
                                                            {route ? `${route.stops.length} parada${route.stops.length !== 1 ? 's' : ''}` : 'Sem entregas'}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            handleEdit(emp)
                                                        }}
                                                        className="p-1.5 rounded-full hover:bg-white/10 transition-colors"
                                                        title="Editar funcionário"
                                                    >
                                                        <Pencil size={14} style={{ color: textSecondary }} />
                                                    </button>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            setDeleteConfirmOpen(emp)
                                                        }}
                                                        className="p-1.5 rounded-full hover:bg-red-50 transition-colors"
                                                        title="Remover funcionário"
                                                    >
                                                        <Trash2 size={14} style={{ color: '#ef4444' }} />
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
                                                        className={`transition-transform ${isExpandedEmp ? 'rotate-90' : ''}`}
                                                        style={{ color: textSecondary }}
                                                    />
                                                </div>
                                            </div>

                                            {isExpandedEmp && route && (
                                                <div className="px-3 pb-3 pt-0">
                                                    <div className="space-y-2 mt-2">
                                                        <p className="text-xs font-bold" style={{ color: textSecondary }}>
                                                            Entregas atribuídas:
                                                        </p>
                                                        {route.stops.map((stop: RouteStop, idx: number) => (
                                                            <div
                                                                key={idx}
                                                                className="p-3 rounded-2xl text-xs"
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
                                                                        <span className="font-medium" style={{ color: textPrimary }}>
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
                                                                            <p className="text-[10px] font-bold mb-1" style={{ color: textSecondary }}>
                                                                                Produtos:
                                                                            </p>
                                                                            <ul className="list-disc list-inside text-[10px]" style={{ color: textPrimary }}>
                                                                                {stop.items.map((item, i) => (
                                                                                    <li key={i}>
                                                                                        {item.product_name} x{item.quantity}
                                                                                    </li>
                                                                                ))}
                                                                            </ul>
                                                                        </div>
                                                                    )}

                                                                    <div className="flex flex-col gap-1 text-[10px]" style={{ color: textSecondary }}>
                                                                        <div className="flex items-center gap-1">
                                                                            <span className="font-bold">Pagamento:</span>
                                                                            <span className="capitalize" style={{ color: textPrimary }}>
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
                                                                            <span style={{ color: textPrimary }}>
                                                                                R$ {Number(stop.total_amount || 0).toFixed(2)}
                                                                            </span>
                                                                            {stop.delivery_fee > 0 && (
                                                                                <span style={{ color: textSecondary }}>
                                                                                    (frete R$ {Number(stop.delivery_fee).toFixed(2)})
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))}

                                                        {route.stops.length === 0 && (
                                                            <p className="text-xs text-center py-2" style={{ color: textSecondary }}>
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
                    </>
                )}
            </div>

            {/* Diálogo de Adicionar / Editar - PILL */}
            {dialogOpen && (
                <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setDialogOpen(false)}>
                    <div className="w-full max-w-xs rounded-3xl p-6 shadow-2xl" style={{ background: colors.surface }} onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between mb-4">
                            <h3 className="text-lg font-black" style={{ color: textPrimary }}>
                                {editingEmployee ? 'Editar funcionário' : 'Novo funcionário'}
                            </h3>
                            <button onClick={() => setDialogOpen(false)}><X size={20} /></button>
                        </div>
                        <div className="space-y-3">
                            <input
                                type="text"
                                placeholder="Nome"
                                className="w-full border rounded-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                                style={{
                                    background: colors.surface,
                                    borderColor: borderColor,
                                    color: textPrimary,
                                }}
                                value={formName}
                                onChange={e => setFormName(e.target.value)}
                            />
                            <input
                                type="text"
                                placeholder="Telefone (opcional)"
                                className="w-full border rounded-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                                style={{
                                    background: colors.surface,
                                    borderColor: borderColor,
                                    color: textPrimary,
                                }}
                                value={formPhone}
                                onChange={e => setFormPhone(e.target.value)}
                            />
                            <button
                                onClick={handleSave}
                                disabled={saving || !formName.trim()}
                                style={{
                                    ...pillButtonStyle,
                                    width: '100%',
                                    background: GRADIENT,
                                    color: '#ffffff',
                                    opacity: saving || !formName.trim() ? 0.5 : 1,
                                }}
                                className="hover:opacity-80 transition-opacity"
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

            {/* Diálogo de confirmação de exclusão - PILL */}
            {deleteConfirmOpen && (
                <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setDeleteConfirmOpen(null)}>
                    <div className="w-full max-w-xs rounded-3xl p-6 shadow-2xl" style={{ background: colors.surface }} onClick={e => e.stopPropagation()}>
                        <div className="text-center">
                            <h3 className="text-lg font-black mb-2" style={{ color: textPrimary }}>Remover funcionário</h3>
                            <p className="text-sm mb-4" style={{ color: textSecondary }}>
                                Tem certeza que deseja desativar <strong style={{ color: textPrimary }}>{deleteConfirmOpen.name}</strong>?
                            </p>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setDeleteConfirmOpen(null)}
                                    style={{
                                        ...pillButtonStyle,
                                        flex: 1,
                                        background: 'transparent',
                                        border: `1px solid ${borderColor}`,
                                        color: textSecondary,
                                    }}
                                    className="hover:opacity-70 transition-opacity"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleDelete}
                                    disabled={deleting}
                                    style={{
                                        ...pillButtonStyle,
                                        flex: 1,
                                        background: '#ef4444',
                                        color: 'white',
                                        opacity: deleting ? 0.5 : 1,
                                    }}
                                    className="hover:opacity-80 transition-opacity"
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