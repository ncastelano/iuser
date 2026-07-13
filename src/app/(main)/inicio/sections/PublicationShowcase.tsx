'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { ChevronUp, ChevronDown, FileText, Store } from 'lucide-react'
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

// ---------- Componente ----------
export default function PublicationShowcase() {
    const router = useRouter()
    const { colors } = useTheme()
    const autoPlayRef = useRef<NodeJS.Timeout | null>(null)

    const { publications, loading } = usePublicationShowcase()
    const total = publications.length

    const ITEMS_PER_PAGE = 4
    // totalPages só é usado para navegação, mas se total < 4 ainda teremos 1 página
    const totalPages = Math.max(1, Math.ceil(total / ITEMS_PER_PAGE))

    const [currentPage, setCurrentPage] = useState(0)
    const [isHovered, setIsHovered] = useState(false)

    // Funções de navegação (circular)
    const goToNext = useCallback(() => {
        setCurrentPage(prev => (prev + 1) % totalPages)
    }, [totalPages])

    const goToPrev = useCallback(() => {
        setCurrentPage(prev => (prev - 1 + totalPages) % totalPages)
    }, [totalPages])

    // Autoplay
    useEffect(() => {
        if (isHovered || totalPages <= 1) return
        autoPlayRef.current = setInterval(goToNext, 4000)
        return () => {
            if (autoPlayRef.current) clearInterval(autoPlayRef.current)
        }
    }, [isHovered, goToNext, totalPages])

    // -- Lógica de loop infinito: sempre 4 cards por página --
    const currentItems = useMemo(() => {
        if (total === 0) return []

        // Se total >= 4, pegamos o slice normal, mas se sobrar menos de 4 na última,
        // complementamos com os primeiros itens da lista.
        const start = currentPage * ITEMS_PER_PAGE
        const end = start + ITEMS_PER_PAGE

        // Se o total é menor que ITEMS_PER_PAGE, simplesmente exibe todos (1 página)
        if (total <= ITEMS_PER_PAGE) {
            return publications.slice(0, total)
        }

        // Pega os itens do índice start até start+4, dando a volta se necessário
        const items: PublicationCard[] = []
        for (let i = start; i < end; i++) {
            const index = i % total
            items.push(publications[index])
        }
        return items
    }, [publications, currentPage, total])

    if (loading) {
        return (
            <div className="animate-pulse space-y-4">
                <div className="h-6 w-40 bg-gray-200 rounded mb-4" />
                <div className="grid grid-cols-2 gap-3">
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="h-48 sm:h-64 bg-gray-200 rounded-2xl" />
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
            <div className="flex items-center gap-2 mb-4 px-1">
                <FileText size={18} style={{ color: colors.accent }} />
                <h2 className="text-sm font-black uppercase tracking-wider" style={{ color: colors.textPrimary }}>
                    Publicações em destaque
                </h2>
            </div>

            {/* Grid 2x2 com loop infinito (sempre 4 cards) */}
            <div className="grid grid-cols-2 gap-3">
                {currentItems.map((pub, idx) => (
                    <div
                        key={`${pub.id}-${idx}`} // idx evita conflitos se o mesmo pub aparecer repetido
                        onClick={() => router.push(`/${pub.storeSlug}?produto=${pub.id}`)}
                        className="group relative aspect-[3/4] rounded-2xl overflow-hidden border shadow-md transition-all duration-300 hover:shadow-xl hover:-translate-y-1 cursor-pointer"
                        style={{ borderColor: colors.border, background: colors.background }}
                    >
                        {pub.imageUrl ? (
                            <img
                                src={pub.imageUrl}
                                alt={pub.storeName}
                                className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                            />
                        ) : (
                            <div className="absolute inset-0 bg-gradient-to-br from-accent/40 to-background" />
                        )}
                        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />
                        <div className="absolute bottom-0 left-0 right-0 p-3 z-10 flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full border-2 border-white/40 overflow-hidden bg-black/50 flex-shrink-0">
                                {pub.storeLogoUrl ? (
                                    <img src={pub.storeLogoUrl} alt="" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-white/80">
                                        <Store size={16} />
                                    </div>
                                )}
                            </div>
                            <h3 className="text-white font-bold text-xs sm:text-sm leading-tight truncate">
                                {pub.storeName}
                            </h3>
                        </div>
                    </div>
                ))}
            </div>

            {/* Controles de navegação (apenas se > 1 página) */}
            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-3 mt-4">
                    <button
                        onClick={goToPrev}
                        className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95"
                        style={{ background: colors.accent, color: colors.accentText }}
                        aria-label="Anterior"
                    >
                        <ChevronUp size={16} />
                    </button>
                    <div className="flex gap-2">
                        {Array.from({ length: totalPages }).map((_, idx) => (
                            <button
                                key={idx}
                                onClick={() => setCurrentPage(idx)}
                                className="h-2 rounded-full transition-all duration-300"
                                style={{
                                    width: idx === currentPage ? '1.5rem' : '0.5rem',
                                    background: idx === currentPage ? colors.accent : colors.border,
                                }}
                            />
                        ))}
                    </div>
                    <button
                        onClick={goToNext}
                        className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95"
                        style={{ background: colors.accent, color: colors.accentText }}
                        aria-label="Próximo"
                    >
                        <ChevronDown size={16} />
                    </button>
                </div>
            )}
        </div>
    )
}