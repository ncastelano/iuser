'use client'

import React, { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CopyLinkButton } from './CopyLinkButton'
import { Users, DollarSign, Network, ShoppingBag, Plus, Star, User as UserIcon, Settings, Camera, X, Loader2, ShoppingCart, ArrowRight, Eye, Clock } from 'lucide-react'
import { useCartStore } from '@/store/useCartStore'

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

            setLoading(false)
        }

        fetchMyDashboard()
    }, [])

    const getLogoUrl = (logoPath: string | null) =>
        logoPath ? supabase.storage.from('store-logos').getPublicUrl(logoPath).data.publicUrl : ''

    const getAvatarUrl = (avatarPath: string | null) => {
        if (!avatarPath) return null
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

    if (loading) return <div className="min-h-screen flex items-center justify-center bg-black text-white">Carregando painel...</div>

    const referralLink = `${typeof window !== 'undefined' ? window.location.origin : ''}/${profile?.profileSlug}/convite`

    return (
        <div className="p-4 md:p-8 bg-black text-white min-h-screen pb-24">

            {/* Modal de Upload */}
            {showUploadModal && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-neutral-900 rounded-2xl border border-neutral-700 max-w-md w-full p-6">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xl font-bold">Atualizar Foto de Perfil</h3>
                            <button onClick={() => { setShowUploadModal(false); setSelectedFile(null); setPreviewUrl(null) }} className="p-1 hover:bg-neutral-800 rounded-full transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="space-y-4">
                            <div className="w-32 h-32 mx-auto rounded-full overflow-hidden bg-neutral-800 border-2 border-neutral-600 cursor-pointer hover:border-white transition-colors" onClick={() => fileInputRef.current?.click()}>
                                {previewUrl ? <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" /> : profile?.avatar_url ? <img src={getAvatarUrl(profile.avatar_url)!} alt="Current avatar" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><UserIcon className="w-12 h-12 text-neutral-500" /></div>}
                            </div>
                            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />
                            <button onClick={() => fileInputRef.current?.click()} className="w-full py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 transition flex items-center justify-center gap-2"><Camera className="w-4 h-4" />Selecionar Imagem</button>
                            {selectedFile && <p className="text-xs text-neutral-400 text-center">Arquivo: {selectedFile.name}</p>}
                            <div className="flex gap-3 pt-4">
                                {profile?.avatar_url && <button onClick={removeAvatar} disabled={uploading} className="flex-1 py-2 rounded-lg bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition disabled:opacity-50">Remover</button>}
                                <button onClick={uploadAvatar} disabled={!selectedFile || uploading} className="flex-1 py-2 rounded-lg bg-white text-black font-semibold hover:bg-neutral-200 transition disabled:opacity-50 flex items-center justify-center gap-2">{uploading ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</> : 'Salvar'}</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Header com Avatar e Botão Settings */}
            <div className="flex items-center justify-between gap-4 mb-8 pb-6 border-b border-white/10">
                <div className="flex items-center gap-4">
                    <div className="relative group">
                        <div className="w-16 h-16 rounded-full overflow-hidden bg-neutral-900 border border-white/20 flex items-center justify-center flex-shrink-0">
                            {profile?.avatar_url ? <img src={getAvatarUrl(profile.avatar_url)!} className="w-full h-full object-cover" /> : <UserIcon className="w-8 h-8 text-neutral-500" />}
                        </div>
                        <button onClick={() => setShowUploadModal(true)} className="absolute inset-0 bg-black/60 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"><Camera className="w-6 h-6 text-white" /></button>
                    </div>
                    <div>
                        <h1 className="text-3xl font-extrabold tracking-tight">{profile?.name ?? 'Dashboard'}</h1>
                        {profile?.name && <p className="text-neutral-400 text-sm">Bem-vindo ao seu painel!</p>}
                    </div>
                </div>
                <button onClick={() => router.push('/configuracoes')} className="p-3 rounded-full bg-neutral-900/80 hover:bg-neutral-800 border border-neutral-700 hover:border-white/30 transition-all duration-300 group" aria-label="Configurações">
                    <Settings className="w-5 h-5 text-neutral-400 group-hover:text-white transition-colors" />
                </button>
            </div>

            {/* SEÇÃO AFILIADOS / PAINEL */}
            <div className="mb-12">
                <h2 className="text-xl font-bold flex items-center gap-3 mb-6">
                    <span className="w-2 h-6 bg-green-500 rounded-full shadow-[0_0_10px_rgba(34,197,94,0.5)]"></span>
                    Painel de Afiliado
                </h2>
                <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-2xl mb-6 shadow-xl w-full flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                    <div className="min-w-0 flex-1">
                        <p className="text-sm text-neutral-400 mb-1 font-semibold uppercase tracking-widest">Seu Link de Convite</p>
                        <p className="font-bold text-white truncate w-full">{referralLink}</p>
                    </div>
                    <div className="shrink-0 w-full sm:w-auto">
                        <CopyLinkButton link={referralLink} />
                    </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                    <div className="bg-neutral-900/50 border border-neutral-800 p-6 rounded-2xl shadow-xl flex flex-col">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center text-green-400"><DollarSign className="w-5 h-5" /></div>
                            <h3 className="font-bold text-lg text-neutral-300">Ganhos Totais</h3>
                        </div>
                        <p className="text-4xl font-extrabold text-white mt-4 flex-1">R$ {totalCommissions.toFixed(2).replace('.', ',')}</p>
                        <Link href="/dashboard/comissoes" className="text-sm text-green-400 hover:text-green-300 mt-4 inline-block font-semibold">Ver Extrato &rarr;</Link>
                    </div>
                    <div className="bg-neutral-900/50 border border-neutral-800 p-6 rounded-2xl shadow-xl flex flex-col">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-400"><Users className="w-5 h-5" /></div>
                            <h3 className="font-bold text-lg text-neutral-300">Sua Rede</h3>
                        </div>
                        <p className="text-4xl font-extrabold text-white mt-4 flex-1">{networkCount} <span className="text-xl text-neutral-500 font-medium tracking-normal">pessoas</span></p>
                        <Link href="/dashboard/rede" className="text-sm text-blue-400 hover:text-blue-300 mt-4 inline-block font-semibold">Ver Downlines &rarr;</Link>
                    </div>
                </div>
            </div>

            {/* SEÇÃO VISITAS RECENTES */}
            {recentViews.length > 0 && (
                <div className="mb-12">
                    <h2 className="text-xl font-bold flex items-center gap-3 mb-6">
                        <span className="w-2 h-6 bg-blue-500 rounded-full shadow-[0_0_10px_rgba(59,130,246,0.5)]"></span>
                        Últimas Visitas
                    </h2>
                    <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-xl">
                        {recentViews.map((view, idx) => (
                            <div key={idx} className="flex items-center justify-between p-4 border-b border-neutral-800/50 last:border-0 hover:bg-neutral-800/50 transition">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-400">
                                        <Eye className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <p className="font-bold text-white text-sm">
                                            {view.profiles?.name || 'Alguém'} <span className="text-neutral-400 font-normal">viu a loja</span> {view.stores?.name}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1.5 text-neutral-500 text-xs font-semibold">
                                    <Clock className="w-3.5 h-3.5" />
                                    {new Date(view.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* SEÇÃO MINHAS LOJAS */}
            <div className="mb-12">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                    <h2 className="text-xl font-bold flex items-center gap-3">
                        <span className="w-2 h-6 bg-white rounded-full shadow-[0_0_10px_rgba(255,255,255,0.5)]"></span>
                        Minhas Lojas
                    </h2>
                    <button onClick={() => router.push('/criar-loja')} className="px-5 py-2.5 bg-white hover:bg-neutral-200 hover:shadow-[0_0_15px_rgba(255,255,255,0.3)] text-black rounded-full font-bold transition-all text-sm whitespace-nowrap flex items-center gap-2">
                        <Plus className="w-4 h-4" /> Criar Loja
                    </button>
                </div>

                {stores.length === 0 ? (
                    <div className="bg-neutral-900/50 border border-neutral-800 border-dashed rounded-2xl p-8 text-center text-neutral-400 font-medium">Você ainda não criou nenhuma loja.</div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                        {stores.map(store => (
                            <div key={store.id} onClick={() => {
                                if (!profile?.profileSlug) {
                                    alert('Você precisa configurar o seu link de perfil antes de acessar as lojas!')
                                    router.push('/configuracoes')
                                } else {
                                    router.push(`/${profile.profileSlug}/${store.storeSlug}`)
                                }
                            }} className="glass-glow-card relative cursor-pointer hover:scale-[1.02] hover:shadow-[0_10px_30px_rgba(255,255,255,0.1)] hover:border-white/50 transition-all duration-300 group flex flex-col">
                                {store.logo_url ? <img src={getLogoUrl(store.logo_url)} className="w-full h-44 object-cover border-b border-neutral-800 group-hover:opacity-90 transition-opacity" /> : <div className="w-full h-44 bg-neutral-950 border-b border-neutral-800 flex items-center justify-center"><span className="text-neutral-600 font-medium text-sm">Sem Logo</span></div>}

                                <div className="p-5 flex flex-col gap-3 relative flex-1">
                                    <div className="absolute -top-5 right-4 flex items-center gap-2 backdrop-blur-md bg-black/80 pr-1 rounded-xl shadow-lg border border-neutral-800 group-hover:border-neutral-600 transition">
                                        <span className={`px-3 py-1.5 rounded-l-xl text-xs font-bold text-white ${store.is_open ? 'bg-green-600' : 'bg-red-600'}`}>
                                            {store.is_open ? 'Aberto' : 'Fechado'}
                                        </span>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); toggleStoreStatus(store.id, store.is_open, store.name); }}
                                            className="px-3 py-1.5 text-xs font-bold bg-neutral-800 rounded-r-xl rounded-l-md hover:bg-neutral-700 hover:text-white text-neutral-300 transition-colors"
                                        >
                                            Trocar
                                        </button>
                                    </div>

                                    <h3 className="font-bold text-lg text-white pt-2">{store.name}</h3>

                                    <div className="flex items-center text-white text-sm gap-1">
                                        <Star className="w-3 h-3 fill-white" />
                                        <span>{store.store_stats.ratings_avg.toFixed(1)}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* SEÇÃO CARRINHO */}
            <div className="mb-6 mt-12">
                <h2 className="text-xl font-bold flex items-center gap-3 mb-6">
                    <span className="w-2 h-6 bg-white rounded-full shadow-[0_0_10px_rgba(255,255,255,0.5)]"></span>
                    Carrinho <ShoppingCart className="w-5 h-5 text-neutral-400" />
                </h2>
                {!mounted ? (
                    <div className="text-neutral-500">Carregando carrinhos...</div>
                ) : Object.keys(itemsByStore).length === 0 ? (
                    <div className="bg-neutral-900/50 border border-neutral-800 border-dashed rounded-2xl p-8 text-center flex flex-col items-center gap-4">
                        <ShoppingBag className="w-12 h-12 text-neutral-600" />
                        <p className="text-neutral-400 font-medium text-lg">Você não tem nada no carrinho, vamos ver algum produto para comprar?</p>
                        <button onClick={() => router.push('/')} className="px-6 py-3 bg-white text-black font-bold rounded-full hover:bg-neutral-200 transition shadow-md">Página Principal</button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                        {Object.entries(itemsByStore).map(([slug, items]) => {
                            const storeInfo = storeDetails[slug]
                            const totalItems = items.reduce((acc, item) => acc + item.quantity, 0)
                            const totalPrice = items.reduce((acc, item) => acc + (item.product.price * item.quantity), 0)
                            return (
                                <div key={slug} onClick={() => router.push(`/${profile?.profileSlug || 'store'}/${slug}/carrinho`)} className="bg-neutral-900/60 p-5 rounded-2xl border border-neutral-800 hover:border-white/50 hover:shadow-[0_10px_30px_rgba(255,255,255,0.1)] transition-all cursor-pointer group flex flex-col gap-4">
                                    <div className="flex items-center gap-4">
                                        <div className="w-14 h-14 rounded-xl overflow-hidden bg-neutral-950 flex-shrink-0 border border-neutral-800">
                                            {storeInfo?.logo_url ? <img src={storeInfo.logo_url} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-neutral-500 font-bold text-lg">{storeInfo?.name?.charAt(0) || slug.charAt(0)}</div>}
                                        </div>
                                        <div className="flex flex-col">
                                            <h3 className="font-bold text-lg text-white group-hover:text-white transition-colors">{storeInfo?.name || slug}</h3>
                                            <p className="text-neutral-400 text-sm">{totalItems} {totalItems === 1 ? 'item' : 'itens'}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between mt-2 pt-4 border-t border-neutral-800">
                                        <span className="font-extrabold text-white">R$ {totalPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                        <div className="text-neutral-400 group-hover:text-white group-hover:translate-x-1 transition-all"><ArrowRight className="w-5 h-5" /></div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>

        </div>
    )
}
