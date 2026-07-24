'use client'

import { useState, useEffect, useRef, useCallback, useMemo, ReactNode } from 'react'
import { ChevronUp, ChevronDown, Store } from 'lucide-react'
import { useTheme } from '@/app/theme'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'

// ---------- Tipos ----------
interface PublicationCard {
    id: string
    imageUrl: string | null
    storeName: string
    storeSlug: string
    storeLogoUrl: string | null
}

// ---------- Props ----------
interface PublicationShowcaseProps {
    dragHandle?: ReactNode
}

// ---------- Hook de dados ----------
function usePublicationShowcase() {
    const [publications, setPublications] = useState<PublicationCard[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchPublications = async () => {
            setLoading(true)
            const { data: storesList, error: storesErr } = await supabase
                .from('stores')
                .select('id, name, storeSlug, logo_url')

            if (storesErr) {
                console.error('[PublicationShowcase] Erro ao buscar lojas:', storesErr)
                setLoading(false)
                return
            }
            const storeMap = new Map(storesList?.map(s => [s.id, s]) || [])

            const { data: publicationsList, error: pubErr } = await supabase
                .from('products')
                .select('id, image_url, store_id')
                .eq('listing_type', 'publication')
                .order('view_count', { ascending: false })

            if (pubErr) {
                console.error('[PublicationShowcase] Erro ao buscar publicações:', pubErr)
                setLoading(false)
                return
            }
            if (!publicationsList || publicationsList.length === 0) {
                setPublications([])
                setLoading(false)
                return
            }

            const cards: PublicationCard[] = publicationsList.map(pub => {
                const store = storeMap.get(pub.store_id)
                const logoUrl = store?.logo_url
                    ? supabase.storage.from('store-logos').getPublicUrl(store.logo_url).data.publicUrl
                    : null
                const imageUrl = pub.image_url
                    ? supabase.storage.from('product-images').getPublicUrl(pub.image_url).data.publicUrl
                    : null
                return {
                    id: pub.id,
                    imageUrl,
                    storeName: store?.name ?? 'Loja desconhecida',
                    storeSlug: store?.storeSlug ?? '#',
                    storeLogoUrl: logoUrl,
                }
            })

            setPublications(cards)
            setLoading(false)
        }
        fetchPublications()
    }, [])

    return { publications, loading }
}

// ---------- Hook para detectar breakpoint ----------
function useBreakpoint() {
    const [itemsPerPage, setItemsPerPage] = useState(6)

    useEffect(() => {
        const update = () => {
            const width = window.innerWidth
            if (width >= 1120) {
                setItemsPerPage(30) // 6 colunas x 5 linhas (aumentado para 30)
            } else if (width >= 800) {
                setItemsPerPage(8) // 4 colunas x 2 linhas
            } else if (width >= 500) {
                setItemsPerPage(4) // 2 colunas x 2 linhas
            } else {
                setItemsPerPage(2) // 2 colunas x 1 linha
            }
        }

        update()
        window.addEventListener('resize', update)
        return () => window.removeEventListener('resize', update)
    }, [])

    return itemsPerPage
}

// ---------- Componente ----------
export default function PublicationShowcase({ dragHandle }: PublicationShowcaseProps) {
    const router = useRouter()
    const { colors } = useTheme()
    const autoPlayRef = useRef<NodeJS.Timeout | null>(null)

    const { publications, loading } = usePublicationShowcase()
    const itemsPerPage = useBreakpoint()
    const total = publications.length

    const totalPages = Math.max(1, Math.ceil(total / itemsPerPage))

    const [currentPage, setCurrentPage] = useState(0)
    const [isHovered, setIsHovered] = useState(false)

    const goToNext = useCallback(() => {
        setCurrentPage(prev => (prev + 1) % totalPages)
    }, [totalPages])

    const goToPrev = useCallback(() => {
        setCurrentPage(prev => (prev - 1 + totalPages) % totalPages)
    }, [totalPages])

    useEffect(() => {
        setCurrentPage(0)
    }, [itemsPerPage])

    useEffect(() => {
        if (isHovered || totalPages <= 1) return
        autoPlayRef.current = setInterval(goToNext, 5000)
        return () => {
            if (autoPlayRef.current) clearInterval(autoPlayRef.current)
        }
    }, [isHovered, goToNext, totalPages])

    const currentItems = useMemo(() => {
        if (total === 0) return []

        if (total <= itemsPerPage) {
            return publications.slice(0, total)
        }

        const start = currentPage * itemsPerPage
        const items: PublicationCard[] = []
        for (let i = start; i < start + itemsPerPage; i++) {
            const index = i % total
            items.push(publications[index])
        }
        return items
    }, [publications, currentPage, itemsPerPage, total])

    // Define o número de colunas baseado no itemsPerPage
    const gridCols = itemsPerPage >= 30 ? 'grid-cols-6'
        : itemsPerPage >= 20 ? 'grid-cols-5'
            : itemsPerPage >= 12 ? 'grid-cols-4'
                : itemsPerPage >= 8 ? 'grid-cols-4'
                    : itemsPerPage >= 4 ? 'grid-cols-2'
                        : 'grid-cols-2'

    if (loading) {
        return (
            <div className="animate-pulse space-y-4">
                <div className="h-6 w-48 bg-gray-200 rounded mb-4" />
                <div className={`grid ${gridCols} gap-2`}>
                    {Array.from({ length: itemsPerPage }).map((_, i) => (
                        <div key={i} className="aspect-[9/10] bg-gray-200 rounded-2xl" />
                    ))}
                </div>
            </div>
        )
    }

    if (!publications.length) return null

    return (
        <div
            className="relative w-full"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* Título com dragHandle - SEM ÍCONE */}
            <div className="flex items-center gap-2 mb-3 px-1">
                {dragHandle}
                <h2 className="text-xs font-black uppercase tracking-wider" style={{ color: colors.textPrimary }}>
                    Publicações em destaque
                </h2>
            </div>

            <div className="flex gap-2">
                <div className={`flex-1 grid ${gridCols} gap-2`}>
                    {currentItems.map((pub, idx) => (
                        <div
                            key={`${pub.id}-${idx}`}
                            onClick={() => router.push(`/${pub.storeSlug}?produto=${pub.id}`)}
                            className="group relative rounded-xl overflow-hidden border shadow-sm transition-all duration-300 hover:shadow-xl hover:-translate-y-1 cursor-pointer"
                            style={{
                                borderColor: colors.border,
                                background: colors.background,
                                aspectRatio: window.innerWidth >= 1120 ? '9/10' : '9/16',
                            }}
                        >
                            {pub.imageUrl ? (
                                <>
                                    <img
                                        src={pub.imageUrl}
                                        alt={pub.storeName}
                                        className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none" />
                                </>
                            ) : (
                                <div className="absolute inset-0 bg-gradient-to-br from-accent/40 to-background" />
                            )}

                            {/* Conteúdo na parte inferior */}
                            <div className="absolute bottom-0 left-0 right-0 p-2 z-10">
                                <div className="flex items-center gap-1.5">
                                    <div className="w-5 h-5 rounded-full border-2 border-white/40 overflow-hidden bg-black/50 flex-shrink-0 shadow-lg">
                                        {pub.storeLogoUrl ? (
                                            <img src={pub.storeLogoUrl} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center">
                                                <Store size={10} className="text-white/80" />
                                            </div>
                                        )}
                                    </div>
                                    <h3 className="text-white font-bold text-[10px] leading-tight truncate drop-shadow-lg">
                                        {pub.storeName}
                                    </h3>
                                </div>
                            </div>

                            {/* Efeito de brilho no hover */}
                            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                                style={{
                                    boxShadow: `inset 0 0 40px ${colors.accent}30`,
                                    border: `2px solid ${colors.accent}40`,
                                }}
                            />
                        </div>
                    ))}
                </div>

                {/* Barra de navegação direita */}
                <div className="flex flex-col items-center justify-center gap-1 w-8 flex-shrink-0">
                    {totalPages > 1 && (
                        <>
                            <button
                                onClick={goToPrev}
                                className="w-6 h-6 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95 shadow-lg"
                                style={{
                                    background: colors.accent,
                                    color: colors.accentText,
                                }}
                                aria-label="Anterior"
                            >
                                <ChevronUp size={12} />
                            </button>

                            <div className="flex flex-col gap-1 my-1">
                                {Array.from({ length: totalPages }).map((_, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => setCurrentPage(idx)}
                                        className="rounded-full transition-all duration-300"
                                        style={{
                                            width: '0.4rem',
                                            height: idx === currentPage ? '1rem' : '0.4rem',
                                            background: idx === currentPage ? colors.accent : colors.border,
                                        }}
                                        aria-label={`Ir para página ${idx + 1}`}
                                    />
                                ))}
                            </div>

                            <span className="text-[8px] font-bold" style={{ color: colors.textSecondary }}>
                                {currentPage + 1}/{totalPages}
                            </span>

                            <button
                                onClick={goToNext}
                                className="w-6 h-6 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95 shadow-lg"
                                style={{
                                    background: colors.accent,
                                    color: colors.accentText,
                                }}
                                aria-label="Próximo"
                            >
                                <ChevronDown size={12} />
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}