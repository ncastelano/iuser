// app/(main)/[profileSlug]/[storeSlug]/entregadores/page.tsx
'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/theme'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { toast } from 'sonner'
import {
    ArrowLeft,
    UserPlus,
    Pencil,
    Trash2,
    Phone,
    MapPin,
    CheckCircle2,
    Clock,
    Truck,
    X,
    Check,
    Map as MapIcon,
    Navigation
} from 'lucide-react'
import dynamic from 'next/dynamic'
import { DeliveryMapProps } from './components/DeliveryMap'

// Importação dinâmica do mapa para evitar SSR
const DeliveryMap = dynamic<DeliveryMapProps>(
    () => import('./components/DeliveryMap'),
    { ssr: false }
)
interface Employee {
    id: string
    store_id: string
    name: string
    phone: string | null
    avatar_url: string | null
    is_active: boolean
    created_at: string
}

interface DeliveryStop {
    checkout_id: string
    sequence_order: number
    status: string
    delivery_address: string | null
    delivery_lat: number | null
    delivery_lng: number | null
    buyer_name: string | null
    buyer_profile_slug: string | null
}

export default function EntregadoresPage() {
    const params = useParams()
    const profileSlug = params.profileSlug as string
    const storeSlug = params.storeSlug as string
    const router = useRouter()
    const { colors } = useTheme()

    const [storeId, setStoreId] = useState<string | null>(null)
    const [employees, setEmployees] = useState<Employee[]>([])
    const [loading, setLoading] = useState(true)
    const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null)
    const [deliveryStops, setDeliveryStops] = useState<DeliveryStop[]>([])
    const [loadingStops, setLoadingStops] = useState(false)

    // Modal de adicionar/editar
    const [showForm, setShowForm] = useState(false)
    const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null)
    const [formName, setFormName] = useState('')
    const [formPhone, setFormPhone] = useState('')
    const [saving, setSaving] = useState(false)

    // Buscar store id
    const fetchStoreId = useCallback(async () => {
        const { data: store } = await supabase
            .from('stores')
            .select('id')
            .ilike('storeSlug', storeSlug)
            .maybeSingle()
        if (store) {
            setStoreId(store.id)
        } else {
            toast.error('Loja não encontrada')
            router.back()
        }
    }, [storeSlug, router])

    // Carregar entregadores
    const loadEmployees = useCallback(async () => {
        if (!storeId) return
        const { data, error } = await supabase
            .from('employees')
            .select('*')
            .eq('store_id', storeId)
            .order('name')
        if (error) {
            toast.error('Erro ao carregar entregadores')
            return
        }
        setEmployees(data || [])
    }, [storeId])

    // Carregar paradas do entregador selecionado
    const loadDeliveryStops = useCallback(async (employeeId: string) => {
        setLoadingStops(true)
        const { data, error } = await supabase
            .from('delivery_assignments')
            .select(`
                checkout_id,
                sequence_order,
                status,
                store_sales!inner(
                    delivery_address,
                    delivery_lat,
                    delivery_lng,
                    buyer_name,
                    buyer_profile_slug
                )
            `)
            .eq('employee_id', employeeId)
            .order('sequence_order', { ascending: true })

        if (error) {
            toast.error('Erro ao carregar entregas')
            setLoadingStops(false)
            return
        }

        const stops: DeliveryStop[] = (data || []).map((item: any) => ({
            checkout_id: item.checkout_id,
            sequence_order: item.sequence_order,
            status: item.status,
            delivery_address: item.store_sales?.delivery_address,
            delivery_lat: item.store_sales?.delivery_lat,
            delivery_lng: item.store_sales?.delivery_lng,
            buyer_name: item.store_sales?.buyer_name,
            buyer_profile_slug: item.store_sales?.buyer_profile_slug,
        }))
        setDeliveryStops(stops)
        setLoadingStops(false)
    }, [])

    useEffect(() => {
        fetchStoreId()
    }, [fetchStoreId])

    useEffect(() => {
        if (storeId) {
            setLoading(true)
            Promise.all([loadEmployees()]).finally(() => setLoading(false))
        }
    }, [storeId, loadEmployees])

    // Carregar paradas quando um entregador é selecionado
    useEffect(() => {
        if (selectedEmployee) {
            loadDeliveryStops(selectedEmployee.id)
        } else {
            setDeliveryStops([])
        }
    }, [selectedEmployee, loadDeliveryStops])

    // Handlers CRUD
    const openAddModal = () => {
        setEditingEmployee(null)
        setFormName('')
        setFormPhone('')
        setShowForm(true)
    }

    const openEditModal = (emp: Employee) => {
        setEditingEmployee(emp)
        setFormName(emp.name)
        setFormPhone(emp.phone || '')
        setShowForm(true)
    }

    const handleSaveEmployee = async () => {
        if (!formName.trim()) {
            toast.error('Nome é obrigatório')
            return
        }
        setSaving(true)
        if (editingEmployee) {
            const { error } = await supabase
                .from('employees')
                .update({ name: formName.trim(), phone: formPhone.trim() || null })
                .eq('id', editingEmployee.id)
            if (error) {
                toast.error('Erro ao atualizar')
            } else {
                toast.success('Entregador atualizado')
                setShowForm(false)
                loadEmployees()
            }
        } else {
            const { error } = await supabase
                .from('employees')
                .insert({
                    store_id: storeId,
                    name: formName.trim(),
                    phone: formPhone.trim() || null,
                    is_active: true
                })
            if (error) {
                toast.error('Erro ao adicionar')
            } else {
                toast.success('Entregador adicionado')
                setShowForm(false)
                loadEmployees()
            }
        }
        setSaving(false)
    }

    const handleDeactivate = async (emp: Employee) => {
        const confirmed = confirm(`Tem certeza que deseja desativar ${emp.name}?`)
        if (!confirmed) return
        const { error } = await supabase
            .from('employees')
            .update({ is_active: false })
            .eq('id', emp.id)
        if (error) {
            toast.error('Erro ao desativar')
        } else {
            toast.success('Entregador desativado')
            if (selectedEmployee?.id === emp.id) setSelectedEmployee(null)
            loadEmployees()
        }
    }

    // Filtra apenas ativos para a lista principal
    const activeEmployees = employees.filter(e => e.is_active)

    // Prepara dados para o mapa
    const mapStops = deliveryStops
        .filter(stop => stop.delivery_lat && stop.delivery_lng)
        .map(stop => ({
            lat: stop.delivery_lat!,
            lng: stop.delivery_lng!,
            label: stop.sequence_order.toString(),
            address: stop.delivery_address || '',
            status: stop.status,
        }))

    if (loading) {
        return <LoadingSpinner message="Carregando entregadores..." />
    }

    return (
        <div className="px-4 pb-28 max-w-2xl mx-auto w-full">
            {/* Cabeçalho */}
            <div className="flex items-center gap-3 mb-6">
                <button
                    onClick={() => router.back()}
                    className="p-2 rounded-full"
                    style={{ background: 'transparent', color: colors.textSecondary, border: `1px solid ${colors.border}` }}
                >
                    <ArrowLeft size={18} />
                </button>
                <h1 className="text-2xl font-black" style={{ color: colors.textPrimary }}>
                    Entregadores
                </h1>
            </div>

            {/* Botão Adicionar */}
            <button
                onClick={openAddModal}
                className="w-full py-3 rounded-xl font-black text-sm flex items-center justify-center gap-2 mb-6 transition-transform hover:scale-[1.02]"
                style={{
                    background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentLight})`,
                    color: colors.accentText,
                }}
            >
                <UserPlus size={18} />
                Adicionar Entregador
            </button>

            {/* Lista de entregadores */}
            {activeEmployees.length === 0 ? (
                <div className="text-center py-12" style={{ color: colors.textSecondary }}>
                    <Truck size={40} className="mx-auto mb-3 opacity-50" />
                    <p className="font-bold">Nenhum entregador cadastrado</p>
                    <p className="text-xs mt-1">Clique no botão acima para adicionar</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {activeEmployees.map(emp => (
                        <div key={emp.id}>
                            <div
                                onClick={() => setSelectedEmployee(selectedEmployee?.id === emp.id ? null : emp)}
                                className="rounded-2xl p-4 border cursor-pointer transition-all hover:shadow-md"
                                style={{
                                    background: 'transparent',
                                    borderColor: selectedEmployee?.id === emp.id ? colors.accent : colors.border,
                                    backdropFilter: 'blur(8px)',
                                    WebkitBackdropFilter: 'blur(8px)',
                                }}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-black"
                                            style={{ background: `${colors.accent}22`, color: colors.accent }}>
                                            {emp.name.charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-sm" style={{ color: colors.textPrimary }}>
                                                {emp.name}
                                            </h3>
                                            {emp.phone && (
                                                <p className="text-xs flex items-center gap-1" style={{ color: colors.textSecondary }}>
                                                    <Phone size={10} /> {emp.phone}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); openEditModal(emp) }}
                                            className="p-2 rounded-full transition-colors"
                                            style={{ background: 'transparent', color: colors.textSecondary }}
                                        >
                                            <Pencil size={16} />
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDeactivate(emp) }}
                                            className="p-2 rounded-full transition-colors hover:text-red-400"
                                            style={{ background: 'transparent', color: colors.textSecondary }}
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Expansão: entregas do entregador */}
                            {selectedEmployee?.id === emp.id && (
                                <div className="mt-2 rounded-2xl p-4 border"
                                    style={{
                                        background: 'transparent',
                                        borderColor: colors.border,
                                        backdropFilter: 'blur(8px)',
                                        WebkitBackdropFilter: 'blur(8px)',
                                    }}
                                >
                                    <h4 className="text-sm font-bold mb-3 flex items-center gap-2" style={{ color: colors.textPrimary }}>
                                        <MapIcon size={14} /> Entregas de hoje
                                    </h4>

                                    {loadingStops ? (
                                        <div className="text-center py-4">
                                            <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin mx-auto" style={{ borderColor: colors.accent, borderTopColor: 'transparent' }} />
                                        </div>
                                    ) : deliveryStops.length === 0 ? (
                                        <p className="text-xs" style={{ color: colors.textSecondary }}>
                                            Nenhuma entrega atribuída.
                                        </p>
                                    ) : (
                                        <>
                                            {/* Mapa */}
                                            <div className="h-48 rounded-xl overflow-hidden mb-3">
                                                <DeliveryMap stops={mapStops} />
                                            </div>

                                            {/* Lista ordenada */}
                                            <div className="space-y-2">
                                                {deliveryStops.map(stop => (
                                                    <div key={stop.checkout_id}
                                                        className="flex items-center gap-3 p-2 rounded-xl"
                                                        style={{ background: 'transparent', borderBottom: `1px solid ${colors.border}30` }}
                                                    >
                                                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black"
                                                            style={{
                                                                background: stop.status === 'delivered' ? '#22c55e30' : colors.accent + '30',
                                                                color: stop.status === 'delivered' ? '#22c55e' : colors.accent,
                                                            }}
                                                        >
                                                            {stop.sequence_order}
                                                        </div>
                                                        <div className="flex-1">
                                                            <p className="text-xs font-bold" style={{ color: colors.textPrimary }}>
                                                                {stop.buyer_name || `@${stop.buyer_profile_slug}`}
                                                            </p>
                                                            <p className="text-[10px] flex items-center gap-1" style={{ color: colors.textSecondary }}>
                                                                <MapPin size={10} /> {stop.delivery_address || 'Endereço não informado'}
                                                            </p>
                                                        </div>
                                                        <div>
                                                            {stop.status === 'delivered' ? (
                                                                <CheckCircle2 size={16} style={{ color: '#22c55e' }} />
                                                            ) : stop.status === 'in_transit' ? (
                                                                <Truck size={16} style={{ color: colors.accent }} />
                                                            ) : (
                                                                <Clock size={16} style={{ color: colors.textSecondary }} />
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Modal de adicionar/editar */}
            {showForm && (
                <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
                    onClick={() => setShowForm(false)}
                >
                    <div className="w-full max-w-sm rounded-3xl p-6 shadow-2xl"
                        style={{ background: colors.surface }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-black" style={{ color: colors.textPrimary }}>
                                {editingEmployee ? 'Editar Entregador' : 'Novo Entregador'}
                            </h2>
                            <button onClick={() => setShowForm(false)}>
                                <X size={20} style={{ color: colors.textSecondary }} />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="text-[10px] font-black uppercase mb-1 block" style={{ color: colors.textSecondary }}>
                                    Nome *
                                </label>
                                <input
                                    type="text"
                                    value={formName}
                                    onChange={e => setFormName(e.target.value)}
                                    className="w-full px-3 py-2 rounded-xl text-sm font-bold focus:outline-none"
                                    style={{
                                        background: 'transparent',
                                        border: `1px solid ${colors.border}`,
                                        color: colors.textPrimary,
                                    }}
                                    placeholder="Nome do entregador"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black uppercase mb-1 block" style={{ color: colors.textSecondary }}>
                                    Telefone
                                </label>
                                <input
                                    type="text"
                                    value={formPhone}
                                    onChange={e => setFormPhone(e.target.value)}
                                    className="w-full px-3 py-2 rounded-xl text-sm font-bold focus:outline-none"
                                    style={{
                                        background: 'transparent',
                                        border: `1px solid ${colors.border}`,
                                        color: colors.textPrimary,
                                    }}
                                    placeholder="(11) 99999-9999"
                                />
                            </div>
                        </div>

                        <button
                            onClick={handleSaveEmployee}
                            disabled={saving || !formName.trim()}
                            className="w-full mt-6 py-2 rounded-full font-black text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                            style={{
                                background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentLight})`,
                                color: colors.accentText,
                            }}
                        >
                            {saving ? (
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <><Check size={16} /> {editingEmployee ? 'Salvar Alterações' : 'Criar Entregador'}</>
                            )}
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
} 