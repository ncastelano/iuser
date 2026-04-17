'use client'

import React, { useEffect, useState, useRef, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useCartStore } from '@/store/useCartStore'
import {
    Users,
    DollarSign,
    Network,
    ShoppingBag,
    Plus,
    Star,
    User as UserIcon,
    Settings,
    Camera,
    X,
    Loader2,
    ShoppingCart,
    ArrowRight,
    Eye,
    Clock,
    CheckCircle2,
    Download,
    Calendar,
    Pencil,
    ChevronDown,
    ChevronUp,
    ArrowLeft
} from 'lucide-react'
import { CopyLinkButton } from './CopyLinkButton'

interface StoreStats {
    ratings_count: number
    ratings_avg: number
}

interface Store {
    id: string
    name: string
    storeSlug: string
    logo_url: string | null
    is_open: boolean
    store_stats: StoreStats
}

interface UserProfile {
    avatar_url: string | null
    name: string | null
    id?: string
    profileSlug?: string
}

export default function DashboardPage() {
    const supabase = createClient()
    const router = useRouter()

    const [stores, setStores] = useState<Store[]>([])
    const [profile, setProfile] = useState<UserProfile | null>(null)
    const [loading, setLoading] = useState(true)
    const [uploading, setUploading] = useState(false)
    const [showUploadModal, setShowUploadModal] = useState(false)
    const [selectedFile, setSelectedFile] = useState<File | null>(null)
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [mounted, setMounted] = useState(false)

    // Affiliate stats
    const [totalCommissions, setTotalCommissions] = useState(0)
    const [networkCount, setNetworkCount] = useState(0)
    const [recentViews, setRecentViews] = useState<any[]>([])
    const [receivedAppointments, setReceivedAppointments] = useState<any[]>([])
    const [myAppointments, setMyAppointments] = useState<any[]>([])
    const [storeSales, setStoreSales] = useState<any[]>([])
    const [activeFinancialTab, setActiveFinancialTab] = useState<'pending' | 'paid'>('pending')
    const [selectedCheckoutDetail, setSelectedCheckoutDetail] = useState<string | null>(null)

    const { itemsByStore, storeDetails } = useCartStore()

    useEffect(() => {
        setMounted(true)
        const fetchMyDashboard = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
                router.push('/login')
                return
            }

            // Load profile
            const { data: profileData } = await supabase
                .from('profiles')
                .select('avatar_url, name, id, profileSlug')
                .eq('id', user.id)
                .single()
            setProfile(profileData)

            // Load stores
            const { data: storesData } = await supabase
                .from('stores')
                .select(`*`)
                .eq('owner_id', user.id)

            const mappedStores = (storesData || []).map(store => ({
                ...store,
                store_stats: {
                    ratings_count: store.ratings_count || 0,
                    ratings_avg: store.ratings_avg || 0
                }
            }))
            setStores(mappedStores)

            // Fetch recent store views
            if (mappedStores.length > 0) {
                const { data: viewsData } = await supabase
                    .from('store_views')
                    .select('created_at, store_id, profiles!inner(name), stores!inner(name)')
                    .in('store_id', mappedStores.map(s => s.id))
                    .order('created_at', { ascending: false })
                    .limit(5)
                if (viewsData) setRecentViews(viewsData)
            }

            // Fetch affiliate commissions
            const { data: commTotal, error: commError } = await supabase.rpc('get_total_commissions', { user_id: user.id })
            if (!commError && commTotal !== null) {
                setTotalCommissions(commTotal)
            }

            // Fetch network counts
            const { data: netCounts, error: netError } = await supabase.rpc('get_network_counts', { p_user_id: user.id })
            if (!netError && netCounts) {
                const total = netCounts.reduce((acc: number, item: any) => acc + parseInt(item.count), 0)
                setNetworkCount(total)
            }

            // Fetch received appointments (as store owner)
            if (mappedStores.length > 0) {
                const { data: receivedData } = await supabase
                    .from('appointments')
                    .select('*, profiles:client_id(name, "profileSlug", avatar_url), stores:store_id(name, storeSlug)')
                    .in('store_id', mappedStores.map(s => s.id))
                    .gte('start_time', new Date().toISOString())
                    .order('start_time', { ascending: true })
                if (receivedData) setReceivedAppointments(receivedData)
            }

            // Fetch my appointments (async client)
            const { data: myData } = await supabase
                .from('appointments')
                .select('*, stores:store_id(name, storeSlug, owner_id, profiles:owner_id("profileSlug"))')
                .eq('client_id', user.id)
                .gte('start_time', new Date().toISOString())
                .order('start_time', { ascending: true })
            if (myData) setMyAppointments(myData)

            // Fetch store sales (as store owner)
            if (mappedStores.length > 0) {
                const { data: salesData } = await supabase
                    .from('store_sales')
                    .select('*, profiles:buyer_id(avatar_url, name, "profileSlug")')
                    .in('store_id', mappedStores.map(s => s.id))
                    .order('created_at', { ascending: false })
                if (salesData) setStoreSales(salesData)
            }

            setLoading(false)
        }

        fetchMyDashboard()

        // Realtime subscription for sales
        const salesChannel = supabase
            .channel('dashboard_sales')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'store_sales'
            }, async (payload) => {
                // If the new sale belongs to one of the user's stores, refresh the list
                // We could just add the single sale, but re-fetching ensures we have all associations
                const { data: { user } } = await supabase.auth.getUser()
                if (!user) return

                const { data: userStores } = await supabase.from('stores').select('id').eq('owner_id', user.id)
                const storeIds = userStores?.map(s => s.id) || []

                if (storeIds.includes(payload.new.store_id)) {
                    const { data: salesData } = await supabase
                        .from('store_sales')
                        .select('*, profiles:buyer_id(avatar_url, name, "profileSlug")')
                        .in('store_id', storeIds)
                        .order('created_at', { ascending: false })
                    if (salesData) setStoreSales(salesData)
                }
            })
            .subscribe()

        return () => {
            supabase.removeChannel(salesChannel)
        }
    }, [])

    const getLogoUrl = (logoPath: string | null) =>
        logoPath ? supabase.storage.from('store-logos').getPublicUrl(logoPath).data.publicUrl : ''

    const getAvatarUrl = (avatarPath: string | null) => {
        if (!avatarPath) return undefined
        if (avatarPath.startsWith('http')) return avatarPath
        return supabase.storage.from('avatars').getPublicUrl(avatarPath).data.publicUrl
    }

    const toggleStoreStatus = async (storeId: string, currentStatus: boolean, storeName: string) => {
        const newStatus = !currentStatus
        if (!confirm(`Deseja definir a loja "${storeName}" como ${newStatus ? 'ABERTO' : 'FECHADO'}?`)) return

        // Optimistic update
        setStores(prev => prev.map(s => s.id === storeId ? { ...s, is_open: newStatus } : s))

        const { error } = await supabase.from('stores').update({ is_open: newStatus }).eq('id', storeId)

        if (error) {
            alert('Erro ao alterar o status da loja')
            // Revert on error
            setStores(prev => prev.map(s => s.id === storeId ? { ...s, is_open: currentStatus } : s))
        }
    }

    const handleAppointmentStatus = async (id: string, newStatus: string) => {
        const { error } = await supabase
            .from('appointments')
            .update({ status: newStatus })
            .eq('id', id)

        if (!error) {
            setReceivedAppointments(prev => prev.map(a => a.id === id ? { ...a, status: newStatus } : a))
        }
    }

    const updateSaleStatus = async (saleId: string, newStatus: string) => {
        const sale = storeSales.find(s => s.id === saleId)
        if (!sale) return

        const checkoutId = sale.checkout_id

        let query = supabase.from('store_sales').update({ status: newStatus })

        if (checkoutId) {
            query = query.eq('checkout_id', checkoutId)
        } else {
            query = query.eq('id', saleId)
        }

        const { error } = await query

        if (!error) {
            setStoreSales(prev => prev.map(s => {
                if (checkoutId && s.checkout_id === checkoutId) return { ...s, status: newStatus }
                if (!checkoutId && s.id === saleId) return { ...s, status: newStatus }
                return s
            }))
            // Success feedback could be added here
        } else {
            console.error('[Dashboard] Erro ao atualizar status da venda:', error)
        }
    }

    const totalPaidSales = useMemo(() => {
        return storeSales
            .filter(s => s.status === 'paid')
            .reduce((acc, curr) => acc + (curr.price || 0), 0)
    }, [storeSales])

    const totalPendingSales = useMemo(() => {
        return storeSales
            .filter(s => s.status === 'pending')
            .reduce((acc, curr) => acc + (curr.price || 0), 0)
    }, [storeSales])

    const getCheckoutItems = (checkoutId: string) => {
        return storeSales.filter(s => s.checkout_id === checkoutId || s.id === checkoutId)
    }

    // Avatar handlers
    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        if (!file.type.startsWith('image/')) {
            alert('Por favor, selecione uma imagem válida')
            return
        }

        if (file.size > 5 * 1024 * 1024) {
            alert('A imagem deve ter no máximo 5MB')
            return
        }

        setSelectedFile(file)
        const preview = URL.createObjectURL(file)
        setPreviewUrl(preview)
    }

    const uploadAvatar = async () => {
        if (!selectedFile || !profile?.id) return

        setUploading(true)
        try {
            const fileExt = selectedFile.name.split('.').pop()
            const filePath = `${profile.id}-${Date.now()}.${fileExt}`

            const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, selectedFile, { cacheControl: '3600', upsert: true })

            if (uploadError) {
                alert('Erro ao fazer upload da imagem')
                return
            }

            const { error: updateError } = await supabase.from('profiles').update({ avatar_url: filePath }).eq('id', profile.id)

            if (updateError) {
                alert('Erro ao atualizar foto do perfil')
                return
            }

            setProfile({ ...profile, avatar_url: filePath })
            setShowUploadModal(false)
            setSelectedFile(null)
            setPreviewUrl(null)
            alert('Foto de perfil atualizada com sucesso!')
        } catch (error) {
            alert('Ocorreu um erro ao fazer upload')
        } finally {
            setUploading(false)
        }
    }

    const removeAvatar = async () => {
        if (!profile?.id) return
        if (!confirm('Tem certeza que deseja remover sua foto de perfil?')) return

        setUploading(true)
        try {
            if (profile.avatar_url) await supabase.storage.from('avatars').remove([profile.avatar_url])
            const { error } = await supabase.from('profiles').update({ avatar_url: null }).eq('id', profile.id)
            if (error) {
                alert('Erro ao remover foto do perfil')
                return
            }
            setProfile({ ...profile, avatar_url: null })
            alert('Foto de perfil removida com sucesso!')
        } catch (error) {
            alert('Ocorreu um erro ao remover a foto')
        } finally {
            setUploading(false)
        }
    }

    if (loading) return <div className="min-h-screen flex items-center justify-center bg-background text-foreground font-sans">Carregando painel...</div>

    const referralLink = `${typeof window !== 'undefined' ? window.location.origin : ''}/${profile?.profileSlug}/convite`
    return (
        <div className="relative min-h-screen pb-24 overflow-hidden bg-background text-foreground font-sans selection:bg-primary selection:text-primary-foreground">
            {/* Background Glows */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
                <div className="absolute top-[-5%] right-[-5%] w-[40%] h-[40%] bg-primary/10 blur-[120px] rounded-full animate-pulse" />
                <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] bg-secondary/10 blur-[130px] rounded-full" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[radial-gradient(circle_at_center,hsla(var(--foreground)/0.012)_1px,transparent_1px)] bg-[size:40px_40px]" />
            </div>

            {/* Modal de Upload */}
            {showUploadModal && (
                <div className="fixed inset-0 bg-background/80 backdrop-blur-xl flex items-center justify-center z-[100] p-4">
                    <div className="bg-card/60 backdrop-blur-2xl rounded-[40px] border border-border max-w-md w-full p-8 shadow-2xl animate-in fade-in zoom-in duration-300">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-2xl font-black italic uppercase tracking-tighter">Avatar Config</h3>
                            <button onClick={() => { setShowUploadModal(false); setSelectedFile(null); setPreviewUrl(null) }} className="w-10 h-10 flex items-center justify-center bg-secondary/50 hover:bg-foreground hover:text-background rounded-2xl transition-all">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="space-y-6">
                            <div className="w-40 h-40 mx-auto rounded-[32px] overflow-hidden bg-background p-1 border border-border shadow-2xl cursor-pointer group relative" onClick={() => fileInputRef.current?.click()}>
                                {previewUrl ? <img src={previewUrl} alt="Preview" className="w-full h-full object-cover rounded-[28px]" /> : profile?.avatar_url ? <img src={getAvatarUrl(profile.avatar_url)!} alt="Current avatar" className="w-full h-full object-cover rounded-[28px]" /> : <div className="w-full h-full flex items-center justify-center text-muted-foreground/30 text-6xl font-black italic">!</div>}
                                <div className="absolute inset-0 bg-background/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                                    <Camera className="w-10 h-10 text-foreground" />
                                </div>
                            </div>
                            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />

                            <div className="flex flex-col gap-3 pt-4">
                                <button onClick={() => fileInputRef.current?.click()} className="w-full py-4 rounded-2xl bg-foreground text-background font-black uppercase text-[10px] tracking-widest hover:opacity-90 transition-all flex items-center justify-center gap-2">
                                    <Camera className="w-4 h-4" /> Selecionar Nova Foto
                                </button>
                                <div className="flex gap-3">
                                    {profile?.avatar_url && (
                                        <button onClick={removeAvatar} disabled={uploading} className="flex-1 py-4 rounded-2xl bg-destructive/10 text-destructive border border-destructive/20 font-black uppercase text-[10px] tracking-widest hover:bg-destructive/20 transition-all">
                                            Remover
                                        </button>
                                    )}
                                    <button onClick={uploadAvatar} disabled={!selectedFile || uploading} className="flex-1 py-4 rounded-2xl bg-primary text-primary-foreground font-black uppercase text-[10px] tracking-widest hover:opacity-90 transition-all disabled:opacity-30">
                                        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirmar'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="relative z-10 max-w-7xl mx-auto px-4 md:px-8 py-10">
                {/* User Profile Header */}
                <div className="flex flex-col md:flex-row items-center md:items-end justify-between gap-8 mb-16 pb-12 border-b border-border">
                    <div className="flex flex-col md:flex-row items-center gap-8">
                        <div className="relative group cursor-pointer" onClick={() => setShowUploadModal(true)}>
                            <div className="w-24 h-24 md:w-32 md:h-32 rounded-[32px] overflow-hidden bg-background p-1 border border-border shadow-2xl relative">
                                {profile?.avatar_url ? (
                                    <img src={getAvatarUrl(profile.avatar_url)!} className="w-full h-full object-cover rounded-[28px]" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-muted-foreground/20 text-5xl font-black italic">{profile?.name?.charAt(0) || 'U'}</div>
                                )}
                                <div className="absolute inset-0 bg-background/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                                    <Camera className="w-8 h-8 text-foreground" />
                                </div>
                            </div>
                            <div className="absolute -bottom-2 -right-2 w-10 h-10 bg-foreground text-background rounded-2xl flex items-center justify-center shadow-2xl border-4 border-background">
                                <Settings className="w-5 h-5" />
                            </div>
                        </div>
                        <div className="text-center md:text-left space-y-2">
                            <h1 className="text-4xl md:text-6xl font-black italic uppercase tracking-tighter leading-none">{profile?.name || 'Dashboard'}</h1>
                            <div className="flex items-center justify-center md:justify-start gap-3">
                                <span className="px-3 py-1 bg-primary/10 border border-primary/20 rounded-full text-[10px] font-black uppercase tracking-widest text-primary">Verificado iUser</span>
                                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">/{profile?.profileSlug || 'user'}</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button className="px-6 py-4 bg-primary text-primary-foreground rounded-2xl font-black uppercase text-[10px] tracking-widest hover:opacity-90 transition-all flex items-center gap-2 shadow-[0_10px_30px_rgba(var(--primary),0.3)]">
                            Baixar iUser <Download className="w-4 h-4" />
                        </button>
                        <button onClick={() => router.push('/configuracoes')} className="px-6 py-4 bg-secondary/50 border border-border rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-secondary transition-all flex items-center gap-2">
                            Configurações <Settings className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Affiliate Stats Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-20">
                    <div className="lg:col-span-2 space-y-4">
                        <h2 className="text-xs font-black uppercase tracking-[0.4em] text-muted-foreground mb-6 flex items-center gap-4">
                            Sua Rede <div className="h-px flex-1 bg-border" />
                        </h2>
                        <div className="relative group p-8 rounded-[40px] border border-border bg-card/10 backdrop-blur-md shadow-2xl flex flex-col md:flex-row items-center justify-between gap-8 overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 blur-3xl rounded-full" />
                            <div className="space-y-2 relative z-10 w-full md:w-auto text-center md:text-left">
                                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Link de Convite Ativo</p>
                                <p className="text-xl font-bold truncate text-foreground max-w-md">{referralLink}</p>
                            </div>
                            <div className="relative z-10 shadow-2xl">
                                <CopyLinkButton link={referralLink} />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                            <div className="p-8 rounded-[40px] border border-border bg-gradient-to-br from-primary/10 to-transparent backdrop-blur-md shadow-xl flex flex-col gap-6 group hover:translate-y-[-4px] transition-all duration-500">
                                <div className="w-12 h-12 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center shadow-lg transform group-hover:rotate-12 transition-transform">
                                    <Network className="w-6 h-6" />
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground">Pessoas Conectadas</p>
                                    <p className="text-4xl font-black italic tracking-tighter text-foreground">{networkCount}</p>
                                </div>
                                <div className="flex flex-col gap-2">
                                    <button onClick={() => router.push('/dashboard/rede')} className="text-[10px] font-black uppercase tracking-widest text-primary hover:text-foreground transition-colors flex items-center gap-1">Visualizar Rede &rarr;</button>
                                    <div className="h-px w-full bg-border my-2" />
                                    <div className="flex items-center justify-between">
                                        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Ganhos em Comissões:</span>
                                        <span className="text-sm font-black text-primary italic">R$ {totalCommissions.toFixed(2).replace('.', ',')}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="p-8 rounded-[40px] border border-border bg-gradient-to-br from-secondary/50 to-transparent backdrop-blur-md shadow-xl flex flex-col gap-4 group">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="w-12 h-12 rounded-2xl bg-foreground text-background flex items-center justify-center shadow-lg">
                                        <ShoppingBag className="w-6 h-6" />
                                    </div>
                                    <div className="flex bg-secondary/50 p-1.5 rounded-xl border border-border">
                                        <button
                                            onClick={() => setActiveFinancialTab('pending')}
                                            className={`px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all ${activeFinancialTab === 'pending' ? 'bg-foreground text-background shadow-lg' : 'text-muted-foreground hover:text-foreground'}`}
                                        >
                                            Falta Pagar
                                        </button>
                                        <button
                                            onClick={() => setActiveFinancialTab('paid')}
                                            className={`px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all ${activeFinancialTab === 'paid' ? 'bg-foreground text-background shadow-lg' : 'text-muted-foreground hover:text-foreground'}`}
                                        >
                                            Recebidos
                                        </button>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between mb-1">
                                    <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground">Financeiro / Extrato</h3>
                                    <div className="text-right">
                                        <p className="text-[8px] font-black uppercase tracking-widest text-muted-foreground/40">Total {activeFinancialTab === 'pending' ? 'Pendente' : 'Recebido'}</p>
                                        <p className={`text-sm font-black italic ${activeFinancialTab === 'pending' ? 'text-primary' : 'text-primary'}`}>
                                            R$ {(activeFinancialTab === 'pending' ? totalPendingSales : totalPaidSales).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </p>
                                    </div>
                                </div>

                                <div className="space-y-3 max-h-[220px] overflow-y-auto pr-2 custom-scrollbar">
                                    {storeSales.filter(s => s.status === activeFinancialTab).length === 0 ? (
                                        <div className="py-10 text-center space-y-2">
                                            <p className="text-[9px] font-black uppercase tracking-widest text-neutral-600 italic">Sem movimentações em {activeFinancialTab === 'pending' ? 'Pendente' : 'Recebidos'}</p>
                                        </div>
                                    ) : (
                                        Array.from(new Set(storeSales.filter(s => s.status === activeFinancialTab).map(s => s.checkout_id || s.id))).map(checkoutId => {
                                            const items = storeSales.filter(s => (s.checkout_id === checkoutId || s.id === checkoutId))
                                            const firstItem = items[0]
                                            const totalPrice = items.reduce((acc, curr) => acc + (curr.price || 0), 0)
                                            const itemNames = items.slice(0, 2).map(i => i.product_name).join(', ') + (items.length > 2 ? ` e mais ${items.length - 2}` : '')

                                            return (
                                                <div
                                                    key={checkoutId}
                                                    className={`p-4 rounded-[24px] bg-white/[0.02] border border-white/5 hover:border-white/10 transition-all space-y-3 cursor-pointer group/sale ${selectedCheckoutDetail === checkoutId ? 'bg-white/[0.05] border-white/20' : ''}`}
                                                    onClick={() => setSelectedCheckoutDetail(selectedCheckoutDetail === checkoutId ? null : checkoutId)}
                                                >
                                                    <div className="flex flex-col gap-1 min-w-0">
                                                        <div className="flex items-start justify-between">
                                                            <p className="text-[9px] font-black text-white uppercase italic leading-tight">
                                                                /{firstItem.buyer_profile_slug || 'anonimo'} <span className="text-neutral-500 font-normal">comprou na</span> /{firstItem.store_slug || 'loja'}
                                                            </p>
                                                            {selectedCheckoutDetail !== checkoutId ? (
                                                                <ChevronDown className="w-3 h-3 text-neutral-600 group-hover/sale:text-white transition-colors" />
                                                            ) : (
                                                                <ChevronUp className="w-3 h-3 text-white" />
                                                            )}
                                                        </div>

                                                        <p className="text-[8px] font-bold text-neutral-500 uppercase tracking-tight">
                                                            {items.length} {items.length === 1 ? 'item' : 'itens'} {selectedCheckoutDetail !== checkoutId && <>: <span className="text-white/60">{itemNames}</span></>}
                                                        </p>

                                                        {selectedCheckoutDetail === checkoutId && (
                                                            <div className="py-2 space-y-1.5 border-t border-white/5 mt-2 animate-in fade-in slide-in-from-top-2 duration-300">
                                                                {items.map((it, idx) => (
                                                                    <div key={idx} className="flex justify-between items-center text-[8px] font-bold uppercase tracking-tight">
                                                                        <span className="text-neutral-400">{it.quantity}x {it.product_name}</span>
                                                                        <span className="text-white italic">R$ {it.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}

                                                        <div className="flex items-center justify-between mt-1">
                                                            <div>
                                                                {activeFinancialTab === 'pending' && <p className="text-[8px] font-black text-yellow-500 uppercase tracking-widest italic">Pendente: R$ {totalPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>}
                                                                {activeFinancialTab === 'paid' && <p className="text-[8px] font-black text-green-500 uppercase tracking-widest italic">Recebido: R$ {totalPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>}
                                                            </div>
                                                            {activeFinancialTab === 'pending' && (
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation()
                                                                        updateSaleStatus(firstItem.id, 'paid')
                                                                    }}
                                                                    className="px-6 py-1.5 rounded-full bg-green-500 text-black text-[9px] font-black uppercase tracking-widest hover:bg-green-400 transition-all shadow-[0_4px_12px_rgba(34,197,94,0.3)] active:scale-95"
                                                                >
                                                                    Sim
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            )
                                        })
                                    )}
                                </div>
                                <button onClick={() => router.push('/dashboard/financeiro')} className="mt-auto pt-2 text-[8px] font-black uppercase tracking-widest text-purple-400 hover:text-white transition-colors flex items-center justify-center gap-1 border-t border-white/5">
                                    Histórico Financeiro Completo &rarr;
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <h2 className="text-xs font-black uppercase tracking-[0.4em] text-muted-foreground mb-6 flex items-center gap-4">
                            Visitantes das lojas <div className="h-px flex-1 bg-border" />
                        </h2>
                        <div className="p-6 rounded-[40px] border border-border bg-card/60 backdrop-blur-md shadow-2xl space-y-4">
                            {recentViews.length === 0 ? (
                                <p className="text-muted-foreground text-[10px] uppercase font-bold text-center py-10 tracking-widest">Aguardando visitantes...</p>
                            ) : recentViews.map((view, i) => (
                                <div key={i} className="flex items-center gap-4 p-4 rounded-3xl bg-secondary/30 border border-border hover:border-primary/20 transition-all group">
                                    <div className="w-10 h-10 bg-background rounded-2xl flex items-center justify-center border border-border group-hover:bg-primary/10 transition-colors">
                                        <Eye className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                                    </div>
                                    <div className="space-y-0.5">
                                        <p className="text-xs font-bold text-foreground tracking-tight">{view.profiles?.name || 'Cliente'}</p>
                                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Acessou {view.stores?.name}</p>
                                    </div>
                                    <div className="ml-auto text-[9px] font-black text-muted-foreground/30">{new Date(view.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Scheduling Sections */}
                {(receivedAppointments.filter(a => a.status === 'pending').length > 0 || myAppointments.length > 0) && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 mb-20">
                        {receivedAppointments.filter(a => a.status === 'pending').length > 0 && (
                            <div className="space-y-6">
                                <h2 className="text-xs font-black uppercase tracking-[0.4em] text-muted-foreground flex items-center gap-4">
                                    Novos Pedidos <div className="h-px flex-1 bg-border" />
                                </h2>
                                <div className="space-y-4">
                                    {receivedAppointments.filter(a => a.status === 'pending').map((appt) => (
                                        <div key={appt.id} className="group relative p-6 rounded-[40px] border border-primary/10 bg-primary/[0.02] flex items-center justify-between gap-6 overflow-hidden">
                                            <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 blur-3xl rounded-full" />
                                            <div className="flex items-center gap-6 relative z-10">
                                                <div className="w-16 h-16 bg-background rounded-3xl flex flex-col items-center justify-center border border-border shadow-2xl">
                                                    <span className="text-[10px] font-black text-muted-foreground uppercase tracking-tighter">{new Date(appt.start_time).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>
                                                    <span className="text-lg font-black italic text-foreground leading-none">{new Date(appt.start_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                                                </div>
                                                <div className="space-y-1">
                                                    <h4 className="text-lg font-black uppercase italic tracking-tighter text-foreground">{appt.service_name}</h4>
                                                    <p className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">Solicitado por <span className="text-primary">/{appt.profiles.profileSlug}</span></p>
                                                </div>
                                            </div>
                                            <div className="flex gap-2 relative z-10 shrink-0">
                                                <button onClick={() => handleAppointmentStatus(appt.id, 'accepted')} className="w-12 h-12 bg-foreground text-background rounded-2xl flex items-center justify-center shadow-lg hover:scale-110 active:scale-95 transition-all">
                                                    <CheckCircle2 size={24} />
                                                </button>
                                                <button onClick={() => handleAppointmentStatus(appt.id, 'declined')} className="w-12 h-12 bg-secondary/50 border border-border text-destructive rounded-2xl flex items-center justify-center shadow-lg hover:border-destructive transition-all">
                                                    <X size={24} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {myAppointments.length > 0 && (
                            <div className="space-y-6">
                                <h2 className="text-xs font-black uppercase tracking-[0.4em] text-muted-foreground flex items-center gap-4">
                                    Minha Agenda <div className="h-px flex-1 bg-border" />
                                </h2>
                                <div className="space-y-4">
                                    {myAppointments.map((appt) => (
                                        <div key={appt.id} className="flex items-center justify-between p-6 rounded-[40px] border border-border bg-card/40 backdrop-blur-md group hover:border-primary/20 transition-all">
                                            <div className="flex items-center gap-6">
                                                <div className="w-12 h-12 bg-background rounded-2xl flex items-center justify-center border border-border group-hover:bg-foreground text-muted-foreground group-hover:text-background transition-all">
                                                    <Clock className="w-6 h-6" />
                                                </div>
                                                <div className="space-y-1">
                                                    <h4 className="text-base font-black uppercase tracking-tight text-foreground">{appt.service_name}</h4>
                                                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                                                        {new Date(appt.start_time).toLocaleDateString('pt-BR')} &bull; {new Date(appt.start_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest ${appt.status === 'pending' ? 'bg-primary/10 text-primary border border-primary/20' :
                                                appt.status === 'accepted' ? 'bg-primary/10 text-primary border border-primary/20' :
                                                    'bg-destructive/10 text-destructive border border-destructive/20'
                                                }`}>
                                                {appt.status === 'pending' ? 'Pendente' : appt.status === 'accepted' ? 'Confirmado' : 'Recusado'}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
                {/* My Stores Grid */}
                <section className="mb-24">
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-6 mb-12">
                        <div className="space-y-1">
                            <h2 className="text-4xl md:text-5xl font-black italic uppercase tracking-tighter text-foreground">Minhas Lojas</h2>
                            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground">{stores.length} Unidades Gerenciadas</p>
                        </div>
                        <button onClick={() => router.push('/criar-loja')} className="group px-8 py-5 bg-foreground text-background font-black uppercase text-[11px] tracking-widest rounded-3xl hover:opacity-90 shadow-2xl transition-all active:scale-95 flex items-center gap-3">
                            Criar loja <Plus className="w-5 h-5 shadow-2xl" />
                        </button>
                    </div>

                    {stores.length === 0 ? (
                        <div className="py-24 text-center rounded-[40px] border border-dashed border-border bg-card/10">
                            <ShoppingBag className="w-16 h-16 text-muted-foreground/20 mx-auto mb-6" />
                            <p className="text-muted-foreground text-xl font-bold uppercase italic tracking-wider">Inicie sua jornada global criando sua primeira loja</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                            {stores.map(store => (
                                <div key={store.id} onClick={() => router.push(`/${profile?.profileSlug || 'store'}/${store.storeSlug}`)} className="group relative flex flex-col bg-card/40 border border-border rounded-[40px] overflow-hidden transition-all duration-500 hover:border-primary/30 hover:-translate-y-2 cursor-pointer shadow-xl">
                                    <div className="relative h-44 bg-background overflow-hidden border-b border-border">
                                        {store.logo_url ? <img src={getLogoUrl(store.logo_url)} className="w-full h-full object-cover grayscale-[0.5] group-hover:grayscale-0 transition-all duration-700 group-hover:scale-110" /> : <div className="w-full h-full flex items-center justify-center text-muted-foreground/20 text-4xl font-black italic">!</div>}

                                        <div className="absolute top-6 left-6 flex items-center gap-2 px-4 py-2 bg-background/80 backdrop-blur-xl border border-border rounded-2xl z-20">
                                            <div className={`w-2 h-2 rounded-full ${store.is_open ? 'bg-primary' : 'bg-destructive'}`} />
                                            <span className="text-[10px] font-black uppercase tracking-widest text-foreground">{store.is_open ? 'Aberta' : 'Fechada'}</span>
                                        </div>
                                    </div>

                                    <div className="p-8 space-y-6">
                                        <div className="space-y-1">
                                            <h3 className="text-2xl font-black italic uppercase tracking-tighter text-foreground truncate">{store.name}</h3>
                                            <div className="flex items-center gap-2">
                                                <Star className="w-3.5 h-3.5 text-primary fill-primary" />
                                                <span className="text-sm font-black text-foreground italic">{store.store_stats.ratings_avg.toFixed(1)}</span>
                                            </div>
                                        </div>

                                        <div className="flex flex-col gap-2 pt-6 border-t border-border">
                                            <div className="flex gap-2">
                                                <button onClick={(e) => { e.stopPropagation(); toggleStoreStatus(store.id, store.is_open, store.name); }} className="flex-1 py-4 px-4 bg-secondary text-foreground rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-foreground hover:text-background transition-all">abrir ou fechar</button>
                                                <button onClick={(e) => { e.stopPropagation(); router.push(`/${profile?.profileSlug}/${store.storeSlug}/editar-loja`); }} className="p-4 bg-background border border-border text-foreground rounded-2xl hover:bg-foreground hover:text-background shadow-xl transition-all">
                                                    <Pencil className="w-5 h-5" />
                                                </button>
                                                <button onClick={(e) => { e.stopPropagation(); router.push(`/${profile?.profileSlug}/${store.storeSlug}/agenda`); }} className="p-4 bg-foreground text-background rounded-2xl hover:opacity-90 shadow-xl transition-all">
                                                    <Calendar className="w-5 h-5" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                {/* Cart Section Redesign */}
                {mounted && Object.keys(itemsByStore).length > 0 && (
                    <section className="pb-20">
                        <h2 className="text-xs font-black uppercase tracking-[0.4em] text-muted-foreground mb-8 flex items-center gap-4">
                            Carrinhos Pendentes <div className="h-px flex-1 bg-border" />
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                            {Object.entries(itemsByStore).map(([slug, items]) => {
                                const storeInfo = storeDetails[slug]
                                const totalItems = items.reduce((acc, item) => acc + item.quantity, 0)
                                const totalPrice = items.reduce((acc, item) => acc + (item.product.price * item.quantity), 0)
                                return (
                                    <div key={slug} onClick={() => router.push(`/${profile?.profileSlug || 'store'}/${slug}/carrinho`)} className="group relative p-8 rounded-[40px] border border-border bg-card/40 backdrop-blur-md hover:border-primary/20 transition-all cursor-pointer overflow-hidden">
                                        <div className="absolute inset-0 bg-gradient-to-br from-foreground/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                        <div className="flex items-center gap-6 relative z-10">
                                            <div className="w-16 h-16 rounded-[24px] overflow-hidden bg-background p-1 border border-border shadow-2xl flex-shrink-0">
                                                {storeInfo?.logo_url ? <img src={storeInfo.logo_url} className="w-full h-full object-cover rounded-[20px]" /> : <div className="w-full h-full flex items-center justify-center text-muted-foreground/20 text-2xl font-black italic">{storeInfo?.name?.charAt(0) || slug.charAt(0)}</div>}
                                            </div>
                                            <div className="space-y-0.5 min-w-0">
                                                <h3 className="text-xl font-black italic uppercase tracking-tighter text-foreground truncate">{storeInfo?.name || slug}</h3>
                                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">{totalItems} Itens Reservados</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between mt-8 pt-6 border-t border-border relative z-10">
                                            <span className="text-2xl font-black italic tracking-tighter text-foreground">R$ {totalPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                            <div className="w-12 h-12 rounded-2xl bg-foreground text-background flex items-center justify-center transform group-hover:translate-x-2 transition-all shadow-2xl">
                                                <ArrowRight className="w-6 h-6" />
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </section>
                )}
            </div>
        </div>
    )
}