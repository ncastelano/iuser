// app/(main)/meus-servicos/page.tsx
//
// "Meus serviços publicados" — pra onde o botão "publicar serviço" da home
// (HireAService.tsx) leva. Junta numa página só os dois tipos de serviço
// que a pessoa pode ter: os que uma loja dela vende (products.type=
// 'service', com store_id) e os pessoais/freelance (ProfileServiceListing,
// products.listing_type='service_offer', sem loja). Antes disso não
// existia — "publicar" mandava pro perfil e só mostrava a parte pessoal.
'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { hexToRgb } from '@/lib/color'
import { Spinner } from '@/components/Spinner'
import { Wrench, Store, Plus, Pencil, Trash2, ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import EditProductDialog from '@/components/EditProductDialog'
import ProfileServiceListing from '@/components/ProfileDashboard/ProfileServiceListing'
import MyOpenServiceRequests from '@/components/MyOpenServiceRequests'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

interface StoreServiceItem {
    id: string
    name: string
    price: number
    image_url: string | null
    store_id: string
    storeName: string
}

interface MyStore {
    id: string
    name: string
    storeSlug: string
    logo_url: string | null
}

export default function MeusServicosPage() {
    const { colors } = useTheme()
    const router = useRouter()
    const { userId, profileSlug, loading: profileLoading } = useProfile()
    const surfaceRgb = hexToRgb(colors.surface)

    const [myStores, setMyStores] = useState<MyStore[]>([])
    const [storeServices, setStoreServices] = useState<StoreServiceItem[]>([])
    const [loading, setLoading] = useState(true)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
    const [deletingId, setDeletingId] = useState<string | null>(null)

    useEffect(() => {
        if (!profileLoading && !userId) router.replace('/login')
    }, [profileLoading, userId, router])

    const load = useCallback(async () => {
        if (!userId) return
        setLoading(true)
        try {
            const { data: stores } = await supabase
                .from('stores')
                .select('id, name, storeSlug, logo_url')
                .eq('owner_id', userId)
            const storesList = (stores as MyStore[]) || []
            setMyStores(storesList)

            if (storesList.length > 0) {
                const storeIds = storesList.map((s) => s.id)
                const { data: products } = await supabase
                    .from('products')
                    .select('id, name, price, image_url, store_id')
                    .in('store_id', storeIds)
                    .eq('type', 'service')
                    .eq('listing_type', 'sale')
                    .order('created_at', { ascending: false })

                const storeNameById = new Map(storesList.map((s) => [s.id, s.name]))
                setStoreServices(
                    (products || []).map((p) => ({ ...p, storeName: storeNameById.get(p.store_id) || 'Loja' }))
                )
            } else {
                setStoreServices([])
            }
        } finally {
            setLoading(false)
        }
    }, [userId])

    useEffect(() => { load() }, [load])

    const getStoreLogoUrl = (path: string | null) => {
        if (!path) return null
        if (path.startsWith('http')) return path
        return supabase.storage.from('store-logos').getPublicUrl(path).data.publicUrl
    }

    const getImageUrl = (path: string | null) => {
        if (!path) return null
        if (path.startsWith('http')) return path
        return supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl
    }

    const handleDelete = async (id: string) => {
        setDeletingId(id)
        try {
            const { error } = await supabase.from('products').delete().eq('id', id)
            if (error) throw error
            setStoreServices((prev) => prev.filter((s) => s.id !== id))
            toast.success('Serviço removido')
        } catch (err: any) {
            toast.error('Erro ao remover: ' + (err.message || 'tente novamente'))
        } finally {
            setDeletingId(null)
            setConfirmDeleteId(null)
        }
    }

    const textPrimary = colors.textPrimary
    const textSecondary = colors.textSecondary

    if (profileLoading || !userId) {
        return (
            <div className="min-h-dvh flex items-center justify-center" style={{ background: colors.background }}>
                <Spinner size={32} color={colors.accent} />
            </div>
        )
    }

    return (
        <div className="min-h-dvh px-4 py-6" style={{ background: colors.background }}>
            <div className="max-w-2xl mx-auto flex flex-col gap-5">
                <button
                    onClick={() => router.back()}
                    className="flex items-center gap-1.5 text-sm font-bold w-fit"
                    style={{ color: textSecondary }}
                >
                    <ArrowLeft size={16} /> Voltar
                </button>

                {/* ===== Pedidos de serviço que eu fiz (mesmos cards de "Seus pedidos em aberto" da home) ===== */}
                <MyOpenServiceRequests limit={30} title="Seus pedidos em aberto" />

                <div>
                    <h1 className="text-xl font-black" style={{ color: textPrimary }}>Meus serviços publicados</h1>
                    <p className="text-sm mt-1" style={{ color: textSecondary }}>
                        Os serviços de cada uma das suas lojas, e depois os seus serviços pessoais (sem loja).
                    </p>
                </div>

                {/* ===== Serviços das lojas — um card por loja ===== */}
                {loading ? (
                    <div className="flex justify-center py-6"><Spinner size={22} color={colors.accent} /></div>
                ) : myStores.length === 0 ? (
                    <div
                        className="rounded-2xl p-6 flex flex-col items-center gap-3 text-center"
                        style={{ background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`, backdropFilter: 'blur(12px)', border: `1px dashed ${colors.border}` }}
                    >
                        <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: GRADIENT, color: '#fff' }}>
                            <Store size={24} />
                        </div>
                        <div>
                            <p className="text-sm font-black" style={{ color: textPrimary }}>Publique serviços pela sua loja</p>
                            <p className="text-xs mt-1" style={{ color: textSecondary }}>Crie sua loja e anuncie os serviços que ela presta — quem procura no iUser encontra você.</p>
                        </div>
                        <button
                            onClick={() => router.push('/criar-loja')}
                            className="px-5 py-2.5 rounded-full text-xs font-black flex items-center gap-1.5"
                            style={{ background: GRADIENT, color: '#fff', boxShadow: '0 4px 12px #f9731640' }}
                        >
                            <Plus size={14} /> Criar minha loja
                        </button>
                    </div>
                ) : (
                    myStores.map((store) => {
                        const services = storeServices.filter((sv) => sv.store_id === store.id)
                        const logo = getStoreLogoUrl(store.logo_url)
                        const publish = () => router.push(`/${store.storeSlug}/criar-produto?type=service`)
                        return (
                            <div
                                key={store.id}
                                className="rounded-2xl p-5 flex flex-col gap-4"
                                style={{
                                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
                                    backdropFilter: 'blur(12px)',
                                    border: `1px solid ${colors.border}`,
                                    boxShadow: colors.shadow,
                                }}
                            >
                                <div className="flex items-center gap-3">
                                    {/* Logo + nome: levam pra página da loja */}
                                    <button
                                        onClick={() => router.push(`/${store.storeSlug}`)}
                                        className="flex items-center gap-3 min-w-0 flex-1 text-left transition hover:opacity-90"
                                        title="Ir para a página da loja"
                                    >
                                        <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center" style={{ background: GRADIENT, color: '#fff' }}>
                                            {logo ? <img src={logo} className="w-full h-full object-cover" alt="" /> : <Store size={22} />}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <h3 className="text-base font-black truncate" style={{ color: textPrimary }}>{store.name}</h3>
                                            <p className="text-xs mt-0.5" style={{ color: textSecondary }}>
                                                {services.length === 0 ? 'Nenhum serviço publicado' : `${services.length} ${services.length === 1 ? 'serviço publicado' : 'serviços publicados'}`}
                                            </p>
                                        </div>
                                    </button>
                                    {services.length > 0 && (
                                        <button
                                            onClick={publish}
                                            className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold flex-shrink-0"
                                            style={{ background: `${colors.border}30`, color: '#f97316', border: `1px dashed ${colors.border}` }}
                                        >
                                            <Plus size={14} /> Novo serviço
                                        </button>
                                    )}
                                </div>

                                {services.length === 0 ? (
                                    <div className="rounded-2xl p-5 flex flex-col items-center gap-3 text-center" style={{ background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`, border: `1px dashed ${colors.border}` }}>
                                        <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: GRADIENT, color: '#fff' }}>
                                            <Wrench size={22} />
                                        </div>
                                        <div>
                                            <p className="text-sm font-black" style={{ color: textPrimary }}>Que tal publicar o primeiro serviço da {store.name}?</p>
                                            <p className="text-xs mt-1" style={{ color: textSecondary }}>Quem está procurando um profissional vê o serviço da sua loja no iUser e pode te chamar na hora.</p>
                                        </div>
                                        <button
                                            onClick={publish}
                                            className="px-5 py-2.5 rounded-full text-xs font-black flex items-center gap-1.5 hover:scale-105 transition-transform"
                                            style={{ background: GRADIENT, color: '#fff', boxShadow: '0 4px 12px #f9731640' }}
                                        >
                                            <Plus size={14} /> Publicar serviço
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-2">
                                        {services.map((item) => {
                                            const imgUrl = getImageUrl(item.image_url)
                                            return (
                                                <div
                                                    key={item.id}
                                                    className="flex items-center gap-3 p-2.5 rounded-2xl border"
                                                    style={{ background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`, borderColor: colors.border }}
                                                >
                                                    <div className="w-12 h-12 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0 flex items-center justify-center">
                                                        {imgUrl ? <img src={imgUrl} className="w-full h-full object-cover" alt={item.name} /> : <Wrench size={18} style={{ color: textSecondary }} />}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-bold truncate" style={{ color: textPrimary }}>{item.name}</p>
                                                        <p className="text-[11px]" style={{ color: textSecondary }}>R$ {Number(item.price).toFixed(2)}</p>
                                                    </div>
                                                    <button onClick={() => setEditingId(item.id)} className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `${colors.border}30`, color: textPrimary }}>
                                                        <Pencil size={13} />
                                                    </button>
                                                    <button onClick={() => setConfirmDeleteId(item.id)} className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#ef444420', color: '#ef4444' }}>
                                                        <Trash2 size={13} />
                                                    </button>
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>
                        )
                    })
                )}

                {/* ===== Serviços pessoais (reaproveita o dashboard do perfil) ===== */}
                {profileSlug && <ProfileServiceListing profileId={userId} profileSlug={profileSlug} linkToProfile />}
            </div>

            {editingId && (
                <EditProductDialog
                    productId={editingId}
                    colors={colors}
                    onClose={() => setEditingId(null)}
                    onSaved={() => { setEditingId(null); load() }}
                    onDeleted={(id) => { setEditingId(null); setStoreServices((prev) => prev.filter((s) => s.id !== id)) }}
                />
            )}

            {confirmDeleteId && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }} onClick={() => (deletingId ? null : setConfirmDeleteId(null))}>
                    <div className="w-full max-w-sm rounded-2xl p-6 space-y-4" style={{ background: colors.background, border: `1px solid ${colors.border}`, boxShadow: colors.shadow }} onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-base font-black" style={{ color: textPrimary }}>Remover este serviço?</h3>
                        <p className="text-xs" style={{ color: textSecondary }}>Essa ação não pode ser desfeita.</p>
                        <div className="flex gap-3">
                            <button onClick={() => setConfirmDeleteId(null)} disabled={!!deletingId} className="flex-1 py-3 rounded-xl font-black uppercase text-[10px] tracking-wider disabled:opacity-50" style={{ background: `${colors.border}30`, color: textPrimary }}>
                                Cancelar
                            </button>
                            <button onClick={() => handleDelete(confirmDeleteId)} disabled={!!deletingId} className="flex-1 py-3 rounded-xl font-black uppercase text-[10px] tracking-wider flex items-center justify-center disabled:opacity-70" style={{ background: '#ef4444', color: '#fff' }}>
                                {deletingId ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Deletar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
