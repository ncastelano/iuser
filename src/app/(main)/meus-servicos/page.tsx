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
                .select('id, name, storeSlug')
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

                <div>
                    <h1 className="text-xl font-black" style={{ color: textPrimary }}>Meus serviços publicados</h1>
                    <p className="text-sm mt-1" style={{ color: textSecondary }}>
                        Tudo o que você anuncia como serviço — da(s) sua(s) loja(s) e pessoal.
                    </p>
                </div>

                {/* ===== Serviços das lojas ===== */}
                <div
                    className="rounded-2xl p-6 flex flex-col gap-4"
                    style={{
                        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
                        backdropFilter: 'blur(12px)',
                        border: `1px solid ${colors.border}`,
                        boxShadow: colors.shadow,
                    }}
                >
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: GRADIENT, color: '#ffffff' }}>
                                <Store size={22} />
                            </div>
                            <div>
                                <h3 className="text-lg font-black" style={{ color: textPrimary }}>Serviços da loja</h3>
                                <p className="text-xs mt-0.5" style={{ color: textSecondary }}>Serviços vendidos pelo catálogo da(s) sua(s) loja(s)</p>
                            </div>
                        </div>
                    </div>

                    {loading ? (
                        <div className="flex justify-center py-6"><Spinner size={22} color={colors.accent} /></div>
                    ) : myStores.length === 0 ? (
                        <p className="text-xs" style={{ color: textSecondary }}>Você ainda não tem uma loja. Crie uma pra vender serviços por lá também.</p>
                    ) : (
                        <>
                            {storeServices.length === 0 ? (
                                <p className="text-xs" style={{ color: textSecondary }}>Nenhum serviço cadastrado na sua loja ainda.</p>
                            ) : (
                                <div className="flex flex-col gap-2">
                                    {storeServices.map((item) => {
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
                                                    <p className="text-[11px]" style={{ color: textSecondary }}>{item.storeName} · R$ {Number(item.price).toFixed(2)}</p>
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

                            <div className="flex flex-wrap gap-2">
                                {myStores.map((store) => (
                                    <button
                                        key={store.id}
                                        onClick={() => router.push(`/${store.storeSlug}/criar-produto?type=service`)}
                                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold"
                                        style={{ background: `${colors.border}30`, color: '#f97316', border: `1px dashed ${colors.border}` }}
                                    >
                                        <Plus size={14} /> Novo serviço {myStores.length > 1 ? `· ${store.name}` : ''}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>

                {/* ===== Serviços pessoais (reaproveita o dashboard do perfil) ===== */}
                {profileSlug && <ProfileServiceListing profileId={userId} profileSlug={profileSlug} />}
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
