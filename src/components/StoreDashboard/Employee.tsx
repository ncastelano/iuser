// components/Employee.tsx - Versão corrigida

'use client'

import React, { useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { toast } from 'sonner'
import { hexToRgb } from '@/lib/color'
import { formatBrazilianPhone, cleanPhoneNumber } from '@/lib/phone'
import { ensureEmployeeAccessToken, buildCourierRouteMessage } from '@/lib/courierLink'
import { getWhatsAppLink } from '@/lib/whatsapp'
import { handleShareLink } from '@/lib/share'
import { paymentMethodLabel } from '@/lib/payment'
import {
    Truck,
    ChevronRight,
    X,
    Plus,
    Pencil,
    Trash2,
    Save,
    Send,
    RefreshCw,
    ChevronDown,
    ChevronUp,
    Clock,
    Bike,
    CheckCircle2,
    MapPin,
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
    access_token?: string | null
}

interface RouteStop {
    lat: number | null
    lng: number | null
    label: string
    address: string
    status: string
    pickedUpAt?: string | null
    deliveredAt?: string | null
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

// Quadro do funcionário: o que ele vai fazer, o que está fazendo agora, e o
// que já entregou - sempre nessa ordem, pra loja ver o andamento num relance.
const BOARD_BUCKETS = [
    { status: 'pending', title: 'A fazer', icon: Clock, color: '#94a3b8' },
    { status: 'in_transit', title: 'Fazendo agora', icon: Bike, color: '#f59e0b' },
    { status: 'delivered', title: 'Concluídas hoje', icon: CheckCircle2, color: '#22c55e' },
] as const

function bucketStops(stops: RouteStop[]) {
    return BOARD_BUCKETS.map((bucket) => ({
        ...bucket,
        stops: stops.filter((s) => s.status === bucket.status),
    }))
}

interface EmployeeProps {
    employees: EmployeeType[]
    employeeRoutes: RouteData[]
    assignmentMap: Map<string, { employeeName: string; status: string }>
    expandedEmployee: string | null
    onToggleExpand: (id: string | null) => void
    storeId: string
    storeName: string
    onRefresh: () => void
}

export default function Employee({
    employees,
    employeeRoutes,
    expandedEmployee,
    onToggleExpand,
    storeId,
    storeName,
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

    // Guarda os tokens já gerados/lidos nesta sessão - onRefresh() do
    // dashboard não recarrega a lista de funcionários, então sem isso cada
    // clique em "Enviar rota" geraria um token novo antes do refresh chegar.
    const [resolvedTokens, setResolvedTokens] = useState<Record<string, string>>({})
    const [regenerating, setRegenerating] = useState(false)

    const handleAdd = () => {
        setEditingEmployee(null)
        setFormName('')
        setFormPhone('')
        setDialogOpen(true)
    }

    const handleEdit = (emp: EmployeeType) => {
        setEditingEmployee(emp)
        setFormName(emp.name)
        setFormPhone(cleanPhoneNumber(emp.phone || ''))
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
                    .update({ name: formName.trim(), phone: formPhone })
                    .eq('id', editingEmployee.id)
                if (error) throw error
                toast.success('Funcionário atualizado!')
            } else {
                const { error } = await supabase.from('employees').insert({
                    store_id: storeId,
                    name: formName.trim(),
                    phone: formPhone,
                    is_active: true,
                    // Já nasce com link pra ver as entregas - sem passo extra.
                    access_token: crypto.randomUUID(),
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

    // Manda o link de "minhas entregas" pro WhatsApp do entregador (mensagem
    // já pronta, a pessoa só aperta enviar) - funciona pra quem tem conta no
    // iUser e pra quem não tem, é sempre o mesmo link.
    const handleSendRoute = async (emp: EmployeeType) => {
        try {
            const token = await ensureEmployeeAccessToken(supabase, emp.id, resolvedTokens[emp.id] || emp.access_token)
            setResolvedTokens((prev) => ({ ...prev, [emp.id]: token }))
            const url = `${window.location.origin}/entregador/${token}`
            const message = buildCourierRouteMessage(emp.name, storeName, url)

            if (emp.phone) {
                window.open(getWhatsAppLink(emp.phone, encodeURIComponent(message)), '_blank')
            } else {
                await handleShareLink({ title: 'Rota de entregas', text: message, url })
            }
        } catch (err: any) {
            toast.error(err.message || 'Erro ao gerar o link')
        }
    }

    // Invalida o link anterior (quem tiver o link antigo deixa de conseguir
    // ver as entregas) - útil se o link vazou ou trocou de entregador.
    const handleRegenerateLink = async (emp: EmployeeType) => {
        setRegenerating(true)
        try {
            const token = crypto.randomUUID()
            const { error } = await supabase.from('employees').update({ access_token: token }).eq('id', emp.id)
            if (error) throw error
            setResolvedTokens((prev) => ({ ...prev, [emp.id]: token }))
            toast.success('Link renovado! O link antigo parou de funcionar.')
        } catch (err: any) {
            toast.error(err.message || 'Erro ao gerar novo link')
        } finally {
            setRegenerating(false)
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
                                                        {route && route.stops.length > 0 ? (
                                                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                                                {bucketStops(route.stops).map((bucket) => bucket.stops.length > 0 && (
                                                                    <span
                                                                        key={bucket.status}
                                                                        className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                                                                        style={{ background: `${bucket.color}20`, color: bucket.color }}
                                                                    >
                                                                        <bucket.icon size={10} />
                                                                        {bucket.stops.length}
                                                                    </span>
                                                                ))}
                                                                <span className="text-[10px]" style={{ color: textSecondary }}>
                                                                    R$ {route.stops.reduce((sum, s) => sum + Number(s.total_amount || 0), 0).toFixed(2)}
                                                                </span>
                                                            </div>
                                                        ) : (
                                                            <p className="text-xs" style={{ color: textSecondary }}>Sem entregas</p>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            handleSendRoute(emp)
                                                        }}
                                                        className="p-1.5 rounded-full hover:bg-white/10 transition-colors"
                                                        title="Enviar rota pro WhatsApp"
                                                    >
                                                        <Send size={14} style={{ color: '#22c55e' }} />
                                                    </button>
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
                                                    <ChevronRight
                                                        size={16}
                                                        className={`transition-transform ${isExpandedEmp ? 'rotate-90' : ''}`}
                                                        style={{ color: textSecondary }}
                                                    />
                                                </div>
                                            </div>

                                            {isExpandedEmp && (
                                                <div className="px-3 pb-3 pt-0 space-y-4">
                                                    {!route || route.stops.length === 0 ? (
                                                        <p className="text-xs text-center py-2" style={{ color: textSecondary }}>
                                                            Nenhuma entrega atribuída no momento.
                                                        </p>
                                                    ) : (
                                                        bucketStops(route.stops).map((bucket) => bucket.stops.length > 0 && (
                                                            <div key={bucket.status} className="space-y-2">
                                                                <div className="flex items-center gap-1.5">
                                                                    <bucket.icon size={13} style={{ color: bucket.color }} />
                                                                    <p className="text-xs font-black uppercase tracking-wide" style={{ color: bucket.color }}>
                                                                        {bucket.title}
                                                                    </p>
                                                                    <span
                                                                        className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                                                                        style={{ background: `${bucket.color}20`, color: bucket.color }}
                                                                    >
                                                                        {bucket.stops.length}
                                                                    </span>
                                                                </div>

                                                                {bucket.stops.map((stop: RouteStop, idx: number) => {
                                                                    const payment = paymentMethodLabel(stop.payment_method)
                                                                    return (
                                                                        <div
                                                                            key={idx}
                                                                            className="p-3 rounded-2xl text-xs"
                                                                            style={{ background: `${bucket.color}10`, border: `1px solid ${bucket.color}30` }}
                                                                        >
                                                                            <div className="flex items-center gap-2 mb-2">
                                                                                <span
                                                                                    className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] text-white font-bold flex-shrink-0"
                                                                                    style={{ background: bucket.color }}
                                                                                >
                                                                                    {stop.label}
                                                                                </span>
                                                                                <div className="flex items-center gap-1 min-w-0">
                                                                                    <MapPin size={11} className="flex-shrink-0" style={{ color: textSecondary }} />
                                                                                    <span className="font-medium truncate" style={{ color: textPrimary }}>
                                                                                        {stop.address || 'Sem endereço'}
                                                                                    </span>
                                                                                </div>
                                                                            </div>

                                                                            <div className="ml-7 space-y-2">
                                                                                {stop.items && stop.items.length > 0 && (
                                                                                    <ul className="list-disc list-inside text-[10px]" style={{ color: textPrimary }}>
                                                                                        {stop.items.map((item, i) => (
                                                                                            <li key={i}>{item.product_name} x{item.quantity}</li>
                                                                                        ))}
                                                                                    </ul>
                                                                                )}

                                                                                <div className="flex items-center gap-1.5 flex-wrap text-[10px]" style={{ color: textSecondary }}>
                                                                                    <span style={{ color: textPrimary }}>{payment.text}</span>
                                                                                    {payment.warning ? (
                                                                                        <span className="font-bold px-1.5 py-0.5 rounded-full" style={{ background: '#ef444420', color: '#ef4444' }}>
                                                                                            ⚠️ {payment.warning}
                                                                                        </span>
                                                                                    ) : (
                                                                                        <span className="font-bold px-1.5 py-0.5 rounded-full" style={{ background: '#22c55e20', color: '#22c55e' }}>
                                                                                            Já pago
                                                                                        </span>
                                                                                    )}
                                                                                    <span className="font-bold" style={{ color: textPrimary }}>
                                                                                        R$ {Number(stop.total_amount || 0).toFixed(2)}
                                                                                    </span>
                                                                                    {stop.delivery_fee > 0 && (
                                                                                        <span>(frete R$ {Number(stop.delivery_fee).toFixed(2)})</span>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    )
                                                                })}
                                                            </div>
                                                        ))
                                                    )}
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
                                type="tel"
                                placeholder="Telefone (opcional)"
                                className="w-full border rounded-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                                style={{
                                    background: colors.surface,
                                    borderColor: borderColor,
                                    color: textPrimary,
                                }}
                                value={formatBrazilianPhone(formPhone)}
                                onChange={e => setFormPhone(cleanPhoneNumber(e.target.value))}
                            />
                            {editingEmployee && (
                                <button
                                    onClick={() => handleRegenerateLink(editingEmployee)}
                                    disabled={regenerating}
                                    style={{
                                        ...pillButtonStyle,
                                        width: '100%',
                                        background: 'transparent',
                                        border: `1px solid ${borderColor}`,
                                        color: textSecondary,
                                        opacity: regenerating ? 0.5 : 1,
                                    }}
                                    className="hover:opacity-80 transition-opacity"
                                >
                                    <RefreshCw size={14} />
                                    Gerar novo link de entregas
                                </button>
                            )}
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