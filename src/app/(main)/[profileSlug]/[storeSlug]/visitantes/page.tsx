// src/app/(app)/[profileSlug]/[storeSlug]/visitantes/page.tsx
'use client'

import { useState, useEffect, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { ArrowLeft, Search, User, Clock, ChevronRight, Eye, CalendarDays, Users } from 'lucide-react'
import Link from 'next/link'
import AnimatedBackground from '@/components/AnimatedBackground'
import { LoadingSpinner } from '@/components/LoadingSpinner'

interface VisitorData {
    id: string
    viewer_id: string
    created_at: string
    profiles: {
        avatar_url: string | null
        name: string | null
        profileSlug: string | null
    } | null
}

type FilterType = 'today' | 'month' | 'total'

export default function StoreVisitorsPage() {
    const params = useParams()
    const router = useRouter()

    const rawStoreSlug = params.storeSlug
    const rawProfileSlug = params.profileSlug

    const storeSlug = Array.isArray(rawStoreSlug) ? rawStoreSlug[0] : rawStoreSlug
    const profileSlug = Array.isArray(rawProfileSlug) ? rawProfileSlug[0] : rawProfileSlug

    const [store, setStore] = useState<any>(null)
    const [visitors, setVisitors] = useState<VisitorData[]>([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState('')
    const [page, setPage] = useState(0)
    const [activeFilter, setActiveFilter] = useState<FilterType>('total')
    const PAGE_SIZE = 20

    useEffect(() => {
        if (!storeSlug) {
            router.push(`/${profileSlug}`)
            return
        }

        const loadData = async () => {
            // Buscar loja
            const { data: storeData } = await supabase
                .from('stores')
                .select('id, name, storeSlug')
                .ilike('storeSlug', storeSlug)
                .single()

            if (!storeData) {
                router.push(`/${profileSlug}`)
                return
            }
            setStore(storeData)

            // Buscar todos os visitantes (com join nos perfis)
            const { data: viewsData } = await supabase
                .from('store_views')
                .select('id, viewer_id, created_at, profiles(id, avatar_url, name, profileSlug)')
                .eq('store_id', storeData.id)
                .order('created_at', { ascending: false })

            if (viewsData) {
                const uniqueMap = new Map<string, VisitorData>()
                viewsData.forEach((item: any) => {
                    if (item.viewer_id && !uniqueMap.has(item.viewer_id)) {
                        uniqueMap.set(item.viewer_id, {
                            ...item,
                            profiles: Array.isArray(item.profiles) ? item.profiles[0] : item.profiles
                        })
                    }
                })
                const uniqueVisitors = Array.from(uniqueMap.values())
                setVisitors(uniqueVisitors)
            }
            setLoading(false)
        }
        loadData()
    }, [storeSlug, profileSlug, supabase, router])

    // Estatísticas
    const now = useMemo(() => new Date(), [])
    const todayStart = useMemo(() => new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(), [now])
    const monthStart = useMemo(() => new Date(now.getFullYear(), now.getMonth(), 1).getTime(), [now])

    const totalVisitors = visitors.length

    const todayVisitors = useMemo(() => {
        return visitors.filter(v => new Date(v.created_at).getTime() >= todayStart).length
    }, [visitors, todayStart])

    const monthVisitors = useMemo(() => {
        return visitors.filter(v => new Date(v.created_at).getTime() >= monthStart).length
    }, [visitors, monthStart])

    // Filtros combinados: primeiro aplica o filtro de período, depois busca textual
    const filteredVisitors = useMemo(() => {
        let filtered = visitors

        // Aplicar filtro de período
        if (activeFilter === 'today') {
            filtered = filtered.filter(v => new Date(v.created_at).getTime() >= todayStart)
        } else if (activeFilter === 'month') {
            filtered = filtered.filter(v => new Date(v.created_at).getTime() >= monthStart)
        }
        // 'total' não filtra

        // Aplicar busca textual
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase()
            filtered = filtered.filter(v => {
                if (!v.profiles) return false
                const nameMatch = v.profiles.name?.toLowerCase().includes(query) || false
                const slugMatch = v.profiles.profileSlug?.toLowerCase().includes(query) || false
                return nameMatch || slugMatch
            })
        }

        return filtered
    }, [visitors, activeFilter, searchQuery, todayStart, monthStart])

    // Resetar página quando o filtro ou busca mudar
    useEffect(() => {
        setPage(0)
    }, [activeFilter, searchQuery])

    const paginatedVisitors = filteredVisitors.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
    const totalPages = Math.ceil(filteredVisitors.length / PAGE_SIZE)

    if (loading) return <LoadingSpinner />

    if (!store) return null

    return (
        <div className="relative min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-yellow-50 pb-32">
            <AnimatedBackground />

            <header className="sticky top-0 z-50 px-3 py-2.5 border-b border-orange-200/30 bg-white/70 backdrop-blur-xl">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => router.back()}
                        className="w-9 h-9 flex items-center justify-center bg-white/80 border border-orange-200 rounded-xl hover:bg-orange-500 hover:text-white transition-all shadow-sm"
                    >
                        <ArrowLeft className="w-4 h-4" />
                    </button>
                    <div>
                        <h1 className="text-sm font-black text-gray-800">
                            Visitantes de {store.name}
                        </h1>
                        <p className="text-[8px] font-black uppercase text-gray-400">
                            {totalVisitors} visitante{totalVisitors !== 1 ? 's' : ''} únicos
                        </p>
                    </div>
                </div>
            </header>

            <main className="relative z-10 px-3 py-4 max-w-2xl mx-auto space-y-4">
                {/* Cards de estatísticas (clicáveis para filtrar) */}
                <div className="grid grid-cols-3 gap-2">
                    {/* Hoje */}
                    <button
                        onClick={() => setActiveFilter('today')}
                        className={`bg-white/70 backdrop-blur-sm rounded-xl p-3 border text-center transition-all ${activeFilter === 'today'
                            ? 'border-orange-500 bg-orange-50 shadow-md'
                            : 'border-orange-100 hover:border-orange-300'
                            }`}
                    >
                        <Eye size={16} className="text-orange-500 mx-auto mb-1" />
                        <p className="text-xl font-black text-gray-900">{todayVisitors}</p>
                        <p className="text-[8px] font-black uppercase text-gray-500">Hoje</p>
                    </button>
                    {/* Mês */}
                    <button
                        onClick={() => setActiveFilter('month')}
                        className={`bg-white/70 backdrop-blur-sm rounded-xl p-3 border text-center transition-all ${activeFilter === 'month'
                            ? 'border-orange-500 bg-orange-50 shadow-md'
                            : 'border-orange-100 hover:border-orange-300'
                            }`}
                    >
                        <CalendarDays size={16} className="text-orange-500 mx-auto mb-1" />
                        <p className="text-xl font-black text-gray-900">{monthVisitors}</p>
                        <p className="text-[8px] font-black uppercase text-gray-500">Mês</p>
                    </button>
                    {/* Total */}
                    <button
                        onClick={() => setActiveFilter('total')}
                        className={`bg-white/70 backdrop-blur-sm rounded-xl p-3 border text-center transition-all ${activeFilter === 'total'
                            ? 'border-orange-500 bg-orange-50 shadow-md'
                            : 'border-orange-100 hover:border-orange-300'
                            }`}
                    >
                        <Users size={16} className="text-orange-500 mx-auto mb-1" />
                        <p className="text-xl font-black text-gray-900">{totalVisitors}</p>
                        <p className="text-[8px] font-black uppercase text-gray-500">Total</p>
                    </button>
                </div>

                {/* Busca */}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-orange-400" />
                    <input
                        type="text"
                        placeholder="Buscar por nome ou perfil..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full bg-white border border-orange-200 rounded-xl py-2 pl-8 pr-3 text-xs text-gray-800 placeholder:text-orange-300 focus:outline-none focus:border-orange-500 transition-all"
                    />
                </div>

                {/* Lista de visitantes */}
                {paginatedVisitors.length === 0 ? (
                    <div className="py-12 text-center bg-white/50 rounded-2xl border border-dashed border-orange-200">
                        <User size={32} className="mx-auto text-orange-300 mb-2" />
                        <p className="text-gray-400 font-bold text-sm">Nenhum visitante encontrado</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {paginatedVisitors.map(visitor => (
                            <div
                                key={visitor.id}
                                className="flex items-center gap-3 bg-white/70 backdrop-blur-sm border border-orange-100 rounded-xl p-3 hover:border-orange-300 transition-all"
                            >
                                <div className="w-10 h-10 rounded-full overflow-hidden bg-gradient-to-br from-orange-100 to-red-100 border border-orange-200 flex-shrink-0">
                                    {visitor.profiles?.avatar_url ? (
                                        <img
                                            src={
                                                visitor.profiles.avatar_url.startsWith('http')
                                                    ? visitor.profiles.avatar_url
                                                    : supabase.storage
                                                        .from('avatars')
                                                        .getPublicUrl(visitor.profiles.avatar_url).data.publicUrl
                                            }
                                            className="w-full h-full object-cover"
                                            alt=""
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-xs font-black text-gray-500">
                                            {visitor.profiles?.name?.charAt(0) || '?'}
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold text-gray-800 truncate">
                                        {visitor.profiles?.name || 'Visitante anônimo'}
                                    </p>
                                    {visitor.profiles?.profileSlug && (
                                        <Link
                                            href={`/${visitor.profiles.profileSlug}`}
                                            className="text-[10px] font-medium text-orange-500 hover:text-orange-600 truncate block"
                                        >
                                            @{visitor.profiles.profileSlug}
                                        </Link>
                                    )}
                                    <p className="text-[10px] text-gray-400 flex items-center gap-1 mt-0.5">
                                        <Clock size={10} />
                                        {new Date(visitor.created_at).toLocaleString('pt-BR', {
                                            day: '2-digit',
                                            month: '2-digit',
                                            hour: '2-digit',
                                            minute: '2-digit'
                                        })}
                                    </p>
                                </div>
                                {visitor.profiles?.profileSlug && (
                                    <Link
                                        href={`/${visitor.profiles.profileSlug}`}
                                        className="w-8 h-8 bg-white border border-orange-200 rounded-full flex items-center justify-center hover:bg-orange-500 hover:text-white transition-all"
                                    >
                                        <ChevronRight size={16} />
                                    </Link>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* Paginação */}
                {totalPages > 1 && (
                    <div className="flex justify-center gap-2 pt-4">
                        {Array.from({ length: totalPages }).map((_, i) => (
                            <button
                                key={i}
                                onClick={() => setPage(i)}
                                className={`w-8 h-8 rounded-full text-xs font-black transition-all ${i === page
                                    ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-md'
                                    : 'bg-white border border-orange-200 text-gray-600 hover:bg-orange-50'
                                    }`}
                            >
                                {i + 1}
                            </button>
                        ))}
                    </div>
                )}
            </main>
        </div>
    )
}