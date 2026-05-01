// app/financeiro/components/PainelConsumidor.tsx
'use client'

import { useState, useMemo, useRef } from 'react'
import Link from 'next/link'
import {
    TrendingUp,
    ShoppingBag,
    Calendar,
    Wallet,
    Building2,
    Star,
    Crown,
    Award,
    Package,
    History,
    LayoutDashboard,
    Camera,
    Loader2
} from 'lucide-react'
import { Sale, Profile, GroupedOrder } from '../types'
import { createClient } from '@/lib/supabase/client'

// Inicializar o cliente Supabase - sem argumentos
const supabase = createClient()

interface PainelConsumidorProps {
    purchases: Sale[]
    profile: Profile | null
    onProfileUpdate?: () => void
}

export function PainelConsumidor({ purchases, profile, onProfileUpdate }: PainelConsumidorProps) {
    const [viewMode, setViewMode] = useState<'dashboard' | 'history'>('dashboard')
    const [uploading, setUploading] = useState(false)
    const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Métricas do consumidor
    const metrics = useMemo(() => {
        const now = new Date()
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
        const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime()

        const completedPurchases = purchases.filter(p => p.status === 'paid')

        const daily = completedPurchases.filter(p => new Date(p.created_at).getTime() >= today)
        const monthly = completedPurchases.filter(p => new Date(p.created_at).getTime() >= firstDayOfMonth)

        const dailyTotal = daily.reduce((acc, p) => acc + p.price, 0)
        const monthlyTotal = monthly.reduce((acc, p) => acc + p.price, 0)
        const totalSpent = completedPurchases.reduce((acc, p) => acc + p.price, 0)

        const dailyOrders = new Set(daily.map(p => p.checkout_id)).size
        const monthlyOrders = new Set(monthly.map(p => p.checkout_id)).size
        const totalOrders = new Set(completedPurchases.map(p => p.checkout_id)).size

        return {
            daily: { spent: dailyTotal, orders: dailyOrders, avgTicket: dailyOrders > 0 ? dailyTotal / dailyOrders : 0 },
            monthly: { spent: monthlyTotal, orders: monthlyOrders, avgTicket: monthlyOrders > 0 ? monthlyTotal / monthlyOrders : 0 },
            total: { spent: totalSpent, orders: totalOrders, avgTicket: totalOrders > 0 ? totalSpent / totalOrders : 0 }
        }
    }, [purchases])

    // Top produtos comprados
    const topProducts = useMemo(() => {
        const counts: Record<string, { count: number, total: number, store_name: string }> = {}
        purchases.filter(p => p.status === 'paid').forEach(p => {
            if (!counts[p.product_name]) {
                counts[p.product_name] = { count: 0, total: 0, store_name: p.store_name || '' }
            }
            counts[p.product_name].count += p.quantity
            counts[p.product_name].total += p.price
        })
        return Object.entries(counts).sort((a, b) => b[1].count - a[1].count).slice(0, 5)
    }, [purchases])

    // Top lojas compradas
    const topStores = useMemo(() => {
        const stores: Record<string, { spent: number, orders: number, items: number }> = {}
        purchases.filter(p => p.status === 'paid').forEach(p => {
            const storeName = p.store_name || 'Loja Desconhecida'
            if (!stores[storeName]) {
                stores[storeName] = { spent: 0, orders: 0, items: 0 }
            }
            stores[storeName].spent += p.price
            stores[storeName].orders += 1
            stores[storeName].items += p.quantity
        })
        return Object.entries(stores)
            .sort((a, b) => b[1].spent - a[1].spent)
            .slice(0, 3)
            .map(([name, data]) => ({ name, ...data }))
    }, [purchases])

    // Compras agrupadas para histórico
    const groupedPurchases = useMemo(() => {
        const groups: Record<string, GroupedOrder> = {}
        purchases.forEach(p => {
            if (!groups[p.checkout_id]) {
                groups[p.checkout_id] = {
                    checkout_id: p.checkout_id,
                    buyer_name: p.buyer_name,
                    buyer_profile_slug: p.buyer_profile_slug,
                    created_at: p.created_at,
                    status: p.status,
                    items: [],
                    totalPrice: 0,
                    store_name: p.store_name
                }
            }
            groups[p.checkout_id].items.push(p)
            groups[p.checkout_id].totalPrice += p.price
        })
        return Object.values(groups).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    }, [purchases])

    // Nível do consumidor
    const customerLevel = useMemo(() => {
        const total = metrics.total.spent
        if (total >= 5000) return { name: 'DIAMOND', icon: Crown, color: 'from-blue-400 to-purple-500', bg: 'bg-gradient-to-r from-blue-50 to-purple-50' }
        if (total >= 2000) return { name: 'PLATINUM', icon: Award, color: 'from-gray-400 to-gray-500', bg: 'bg-gradient-to-r from-gray-50 to-gray-100' }
        if (total >= 500) return { name: 'GOLD', icon: Star, color: 'from-yellow-500 to-amber-500', bg: 'bg-gradient-to-r from-yellow-50 to-amber-50' }
        if (total >= 100) return { name: 'SILVER', icon: Star, color: 'from-gray-400 to-gray-500', bg: 'bg-gradient-to-r from-gray-50 to-gray-100' }
        return { name: 'BRONZE', icon: Star, color: 'from-orange-600 to-red-600', bg: 'bg-gradient-to-r from-orange-50 to-red-50' }
    }, [metrics.total.spent])

    const CustomerLevelIcon = customerLevel.icon

    // Função para fazer upload da imagem
    const handleAvatarClick = () => {
        fileInputRef.current?.click()
    }

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        if (!file || !profile) {
            alert('Selecione uma imagem válida')
            return
        }

        // Validar tipo de arquivo
        if (!file.type.startsWith('image/')) {
            alert('Por favor, selecione uma imagem válida (JPEG, PNG, GIF, etc.)')
            return
        }

        // Validar tamanho (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
            alert('A imagem deve ter no máximo 5MB')
            return
        }

        setUploading(true)

        try {
            // Gerar nome único para o arquivo
            const fileExt = file.name.split('.').pop()
            const fileName = `${profile.id}-${Date.now()}.${fileExt}`
            const filePath = `avatars/${fileName}`

            // Upload para o Supabase Storage
            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(filePath, file)

            if (uploadError) {
                console.error('Upload error:', uploadError)
                throw new Error('Erro ao fazer upload da imagem')
            }

            // Obter URL pública
            const { data: { publicUrl } } = supabase.storage
                .from('avatars')
                .getPublicUrl(filePath)

            // Atualizar perfil no banco de dados
            const { error: updateError } = await supabase
                .from('profiles')
                .update({ avatar_url: publicUrl })
                .eq('id', profile.id)

            if (updateError) {
                console.error('Update error:', updateError)
                throw new Error('Erro ao atualizar o perfil')
            }

            // Atualizar estado local
            setAvatarUrl(publicUrl)
            if (profile) {
                profile.avatar_url = publicUrl
            }

            // Notificar o componente pai
            if (onProfileUpdate) {
                onProfileUpdate()
            }

            alert('Avatar atualizado com sucesso!')
        } catch (error) {
            console.error('Error uploading avatar:', error)
            alert(error instanceof Error ? error.message : 'Erro ao fazer upload da imagem. Tente novamente.')
        } finally {
            setUploading(false)
            // Limpar o input para permitir selecionar o mesmo arquivo novamente
            if (fileInputRef.current) {
                fileInputRef.current.value = ''
            }
        }
    }

    if (purchases.length === 0) {
        return (
            <div className="text-center py-16 bg-white/50 rounded-2xl">
                <ShoppingBag size={48} className="mx-auto mb-3 text-gray-400" />
                <p className="text-gray-500 font-black text-sm">Nenhuma compra ainda</p>
                <Link href="/" className="inline-block mt-4 text-orange-600 font-black text-[10px] uppercase tracking-wider">
                    Explorar lojas →
                </Link>
            </div>
        )
    }

    return (
        <div>
            {/* Input de arquivo escondido */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileUpload}
                disabled={uploading}
            />

            {/* Seletor de visualização */}
            <div className="flex gap-2 mb-6">
                <button
                    onClick={() => setViewMode('dashboard')}
                    className={`flex-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${viewMode === 'dashboard'
                        ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-md'
                        : 'bg-white/50 text-gray-600 border border-orange-200'
                        }`}
                >
                    <LayoutDashboard size={14} />
                    Painel
                </button>
                <button
                    onClick={() => setViewMode('history')}
                    className={`flex-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${viewMode === 'history'
                        ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-md'
                        : 'bg-white/50 text-gray-600 border border-orange-200'
                        }`}
                >
                    <History size={14} />
                    Histórico
                </button>
            </div>

            {viewMode === 'dashboard' ? (
                <div className="space-y-6">
                    {/* Perfil do consumidor com avatar clicável */}
                    <div className="bg-gradient-to-r from-orange-50 to-red-50 rounded-2xl p-5 border border-orange-100">
                        <div className="flex items-center gap-4">
                            <div
                                className="relative group cursor-pointer"
                                onClick={handleAvatarClick}
                            >
                                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center shadow-lg overflow-hidden">
                                    {uploading ? (
                                        <Loader2 size={24} className="text-white animate-spin" />
                                    ) : avatarUrl ? (
                                        <img
                                            src={avatarUrl}
                                            className="w-full h-full rounded-full object-cover"
                                            alt={profile?.name || 'Avatar'}
                                        />
                                    ) : (
                                        <span className="text-2xl font-black text-white">
                                            {profile?.name?.charAt(0) || profile?.profileSlug?.charAt(0) || 'U'}
                                        </span>
                                    )}
                                </div>
                                {/* Overlay de câmera */}
                                {!uploading && (
                                    <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Camera size={20} className="text-white" />
                                    </div>
                                )}
                            </div>
                            <div className="flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <h3 className="text-xl font-black italic text-gray-900">{profile?.name || 'Consumidor'}</h3>
                                    <div className={`${customerLevel.bg} px-2 py-0.5 rounded-full flex items-center gap-1`}>
                                        <CustomerLevelIcon size={10} className="text-orange-500" />
                                        <span className="text-[8px] font-black uppercase">{customerLevel.name}</span>
                                    </div>
                                </div>
                                <p className="text-[9px] font-bold text-gray-500 mt-1">@{profile?.profileSlug || 'usuario'}</p>
                                <p className="text-[8px] text-gray-400 mt-1">
                                    🎉 {metrics.total.orders} pedidos • {metrics.total.spent > 0 ? `R$ ${metrics.total.spent.toFixed(2)} gastos` : 'nenhuma compra ainda'}
                                </p>
                            </div>
                        </div>
                        <p className="text-[8px] text-orange-500 mt-3 text-center opacity-0 group-hover:opacity-100 transition-opacity">
                            Clique no avatar para trocar a foto
                        </p>
                    </div>

                    {/* Resto do código permanece igual... */}
                    {/* Cards de gastos */}
                    <div className="grid grid-cols-3 gap-3">
                        <div className="bg-white rounded-xl p-3 border border-orange-100 text-center">
                            <Calendar size={14} className="text-orange-500 mx-auto mb-1" />
                            <p className="text-[7px] font-black uppercase text-gray-500">Hoje</p>
                            <p className="text-sm font-black italic text-gray-900">R$ {metrics.daily.spent.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                            <p className="text-[8px] font-bold text-gray-400">{metrics.daily.orders} pedidos</p>
                        </div>
                        <div className="bg-white rounded-xl p-3 border border-orange-100 text-center">
                            <Calendar size={14} className="text-orange-500 mx-auto mb-1" />
                            <p className="text-[7px] font-black uppercase text-gray-500">Este Mês</p>
                            <p className="text-sm font-black italic text-gray-900">R$ {metrics.monthly.spent.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                            <p className="text-[8px] font-bold text-gray-400">{metrics.monthly.orders} pedidos</p>
                        </div>
                        <div className="bg-white rounded-xl p-3 border border-orange-100 text-center">
                            <Wallet size={14} className="text-orange-500 mx-auto mb-1" />
                            <p className="text-[7px] font-black uppercase text-gray-500">Total</p>
                            <p className="text-sm font-black italic text-gray-900">R$ {metrics.total.spent.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                            <p className="text-[8px] font-bold text-gray-400">{metrics.total.orders} pedidos</p>
                        </div>
                    </div>

                    {/* Ticket médio */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-orange-50/50 rounded-xl p-3 border border-orange-100">
                            <p className="text-[7px] font-black uppercase text-gray-500">Ticket Médio (Mês)</p>
                            <p className="text-lg font-black italic text-orange-600">R$ {metrics.monthly.avgTicket.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                        </div>
                        <div className="bg-orange-50/50 rounded-xl p-3 border border-orange-100">
                            <p className="text-[7px] font-black uppercase text-gray-500">Ticket Médio (Geral)</p>
                            <p className="text-lg font-black italic text-orange-600">R$ {metrics.total.avgTicket.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                        </div>
                    </div>

                    {/* Top produtos */}
                    {topProducts.length > 0 && (
                        <div className="bg-white/50 rounded-xl p-4 border border-orange-100">
                            <h4 className="text-[9px] font-black uppercase tracking-wider text-orange-600 mb-3 flex items-center gap-2">
                                <TrendingUp size={12} /> O que mais comprei
                            </h4>
                            <div className="space-y-2">
                                {topProducts.map(([name, data], i) => (
                                    <div key={i} className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[8px] font-black text-gray-400 w-4">{i + 1}°</span>
                                            <div>
                                                <span className="text-[9px] font-bold text-gray-800">{name}</span>
                                                <p className="text-[7px] text-gray-400">{data.store_name}</p>
                                            </div>
                                        </div>
                                        <span className="text-[9px] font-black text-gray-900">{data.count}x</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Top lojas */}
                    {topStores.length > 0 && (
                        <div className="bg-white/50 rounded-xl p-4 border border-orange-100">
                            <h4 className="text-[9px] font-black uppercase tracking-wider text-orange-600 mb-3 flex items-center gap-2">
                                <Building2 size={12} /> Onde mais comprei
                            </h4>
                            <div className="space-y-3">
                                {topStores.map((store, i) => (
                                    <div key={i} className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[8px] font-black text-gray-400 w-4">{i + 1}°</span>
                                            <span className="text-[9px] font-bold text-gray-800">{store.name}</span>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-[9px] font-black text-orange-600">R$ {store.spent.toFixed(2)}</span>
                                            <p className="text-[6px] text-gray-400">{store.orders} pedidos</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                /* Histórico de compras */
                <div className="space-y-4">
                    {groupedPurchases.map((order) => (
                        <div key={order.checkout_id} className="bg-white rounded-xl p-4 border border-orange-100">
                            <div className="flex items-center justify-between mb-2">
                                <div>
                                    <p className="text-[8px] font-black text-gray-500 uppercase tracking-wider">
                                        {new Date(order.created_at).toLocaleDateString('pt-BR')} • {new Date(order.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                    </p>
                                    <h3 className="text-sm font-black italic text-gray-900 mt-1">{order.store_name}</h3>
                                </div>
                                <div className={`px-2 py-1 rounded-full text-[7px] font-black uppercase tracking-wider ${order.status === 'paid' ? 'bg-green-100 text-green-700' :
                                    order.status === 'preparing' ? 'bg-yellow-100 text-yellow-700' :
                                        order.status === 'ready' ? 'bg-purple-100 text-purple-700' :
                                            'bg-blue-100 text-blue-700'
                                    }`}>
                                    {order.status === 'paid' ? 'Finalizado' :
                                        order.status === 'preparing' ? 'Preparando' :
                                            order.status === 'ready' ? 'Pronto' : 'Processando'}
                                </div>
                            </div>

                            <div className="space-y-1 mb-3">
                                {order.items.slice(0, 3).map((item, idx) => (
                                    <div key={idx} className="flex justify-between text-[9px]">
                                        <span className="text-gray-600">{item.quantity}x {item.product_name}</span>
                                        <span className="font-bold text-gray-800">R$ {(item.price).toFixed(2)}</span>
                                    </div>
                                ))}
                                {order.items.length > 3 && (
                                    <p className="text-[8px] text-gray-400">+{order.items.length - 3} outros itens</p>
                                )}
                            </div>

                            <div className="flex justify-between items-center pt-2 border-t border-orange-100">
                                <span className="text-[8px] font-black uppercase text-gray-500">Total</span>
                                <span className="text-base font-black italic text-orange-600">R$ {order.totalPrice.toFixed(2)}</span>
                            </div>
                        </div>
                    ))}

                    {groupedPurchases.length === 0 && (
                        <div className="text-center py-8">
                            <Package size={32} className="mx-auto mb-2 text-gray-300" />
                            <p className="text-gray-500 font-bold text-sm">Nenhum pedido encontrado</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}