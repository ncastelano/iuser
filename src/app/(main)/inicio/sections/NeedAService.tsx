// src/app/(main)/inicio/sections/NeedAService.tsx
//
// Seção da home "Quem procura serviço" (sem card em volta, tudo flutuante): os pedidos de serviço abertos de TODO mundo (inclusive
// os da própria pessoa), pra qualquer um ver que tem gente precisando e poder
// pedir o seu também. Inscrever-se continua em /procurar-servico (exige plano
// Prestador); aqui é só a vitrine.
'use client'

import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { MapPin, Plus, Check, MoreHorizontal, Pencil, Trash2, X } from 'lucide-react'
import { toast } from '@/lib/toast'
import { supabase } from '@/lib/supabase/client'
import ServiceRequestDetailsDialog from '@/components/ServiceRequestDetailsDialog'
import ServiceRequestViewDialog from '@/components/ServiceRequestViewDialog'
import { Spinner } from '@/components/Spinner'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { useNavProgressStore } from '@/store/useNavProgressStore'
import { BoardItem, fetchOpenBoardItems, getItemIcon, getItemLabel, askedAgo, notifyServiceRequestsChanged, SERVICE_REQUESTS_CHANGED } from '@/lib/serviceBoard'
import { HOME_GRADIENT, HomeSectionHeader } from './HomeSectionKit'
import { ViewServicesButton } from './ViewServicesButton'
import FitText from '@/components/FitText'
import { haversineKm } from '@/lib/mapboxRoute'
import { formatDistance } from '@/lib/radarNearest'
import { useMyServiceApplications } from '@/hooks/useMyServiceApplications'
import SeenBox from '@/components/SeenBox'
import { trackServiceRequestView } from '@/lib/trackServiceRequestView'
import { getRequestTitle } from '@/lib/serviceTypes'
import { usePagedRotation } from '@/hooks/usePagedRotation'
import { useResponsivePageSize } from '@/hooks/useResponsivePageSize'
import { PageDots, PAGE_SLIDE_CSS } from '@/components/PageDots'

export default function NeedAService({ dragHandle, limit = 8, origin }: { dragHandle?: ReactNode; limit?: number; origin?: { lat: number; lng: number } | null }) {
    const { colors } = useTheme()
    const router = useRouter()
    const startNavProgress = useNavProgressStore((s) => s.start)
    const { userId } = useProfile()
    const { items: myApplications } = useMyServiceApplications()
    const applied = useMemo(() => new Map(myApplications.map((a) => [a.requestId, a.status])), [myApplications])
    const [items, setItems] = useState<BoardItem[] | null>(null)
    // Distância até cada pedido, a partir do local definido pela pessoa e da posição aproximada do pedido (sem local ou sem posição: não aparece)
    const originLat = origin?.lat
    const originLng = origin?.lng
    const distances = useMemo(() => {
        const m = new Map<string, number>()
        if (originLat == null || originLng == null) return m
        for (const it of items || []) {
            if (it.approx_lat != null && it.approx_lng != null) m.set(it.id, haversineKm([originLng, originLat], [Number(it.approx_lng), Number(it.approx_lat)]))
        }
        return m
    }, [items, originLat, originLng])
    const [menuItem, setMenuItem] = useState<BoardItem | null>(null)
    const [confirmDelete, setConfirmDelete] = useState(false)
    const [deleting, setDeleting] = useState(false)
    const [detailsId, setDetailsId] = useState<string | null>(null)
    // Card tocado: abre aqui mesmo, em tamanho grande (foto inteira + detalhes), e já conta a visita
    const [viewItem, setViewItem] = useState<BoardItem | null>(null)
    const pageSize = useResponsivePageSize({ base: 2, md: 3 })
    const { page, dir, pages, goTo, handlers, visibleRange } = usePagedRotation(items?.length ?? 0, pageSize)

    const load = useCallback(() => {
        fetchOpenBoardItems(limit).then(setItems)
    }, [limit])

    useEffect(() => {
        load()
        // Editar/excluir/aceitar em "Seus pedidos em aberto" também atualiza aqui.
        window.addEventListener(SERVICE_REQUESTS_CHANGED, load)
        return () => window.removeEventListener(SERVICE_REQUESTS_CHANGED, load)
    }, [load])

    const closeMenu = () => { setMenuItem(null); setConfirmDelete(false) }

    const deleteRequest = async () => {
        if (!menuItem) return
        setDeleting(true)
        try {
            const { data, error } = await supabase.from('service_requests').delete().eq('id', menuItem.id).select('id')
            if (error) throw error
            if (!data || data.length === 0) {
                toast.error('Não foi possível excluir esse pedido.')
                return
            }
            toast.success('Pedido excluído')
            closeMenu()
            notifyServiceRequestsChanged()
        } catch (err: any) {
            toast.error('Erro ao excluir: ' + (err.message || 'tente novamente'))
        } finally {
            setDeleting(false)
        }
    }

    const go = (path: string) => { startNavProgress(); router.push(path) }
    // Guarda onde a pessoa estava na home: ao voltar, a tela desliza de volta pra esse ponto
    const goFromHome = (path: string) => {
        try {
            sessionStorage.setItem('iuser_home_scroll', String(window.scrollY))
            sessionStorage.setItem('iuser_home_anchor', 'need-a-service')
        } catch { /* sem sessionStorage, volta pro topo */ }
        go(path)
    }

    if (items === null) return null
    const visibleItems = items.slice(visibleRange[0], visibleRange[1])

    return (
        <section data-home-anchor="need-a-service">
            <HomeSectionHeader
                dragHandle={dragHandle}
                title="Quem procura serviço"
                subtitle={items.length > 0 ? 'Pessoas precisando de um profissional agora' : 'Ninguém pediu ainda — seja o primeiro'}
                action={<ViewServicesButton onClick={() => goFromHome('/procurar-servico')} />}
            />

            {/* Versão vertical do cartão em linha: 2 por vez no celular, 3 em tela maior; alterna sozinho, deslizando ou pelos pontinhos */}
            <div {...handlers}>
            <div key={page} className={`grid grid-cols-2 md:grid-cols-3 gap-3 items-stretch ${dir > 0 ? 'page-in-next' : 'page-in-prev'}`} style={{ touchAction: 'pan-y' }}>
                {visibleItems.map((item) => {
                    const Icon = getItemIcon(item)
                    const mine = item.requester_id === userId
                    const photo = item.photo_urls?.[0] || null
                    const title = getRequestTitle(item.description, item.service_type, item.custom_service)
                    return (
                        <SeenBox
                            key={item.id}
                            // Só passar por cima (ou ficar visível) já conta como visto: aparece em "Visitantes dos serviços" do pedido
                            onSeen={() => trackServiceRequestView(item.id)}
                            seenKey={`request:${item.id}`}
                            // Tocar no card abre o pedido em tamanho grande (o dono também vê assim, e edita pelo menu ⋯)
                            onClick={() => setViewItem(item)}
                            className="w-full h-full rounded-3xl overflow-hidden flex flex-col cursor-pointer"
                            style={{
                                background: colors.surface,
                                border: `1px solid ${mine ? colors.accent : colors.border}`,
                                boxShadow: colors.shadow,
                            }}
                        >
                            {/* Com foto: a foto inteira (sobre uma cópia desfocada dela) e o título embaixo. Sem foto: o cartão é o próprio texto. */}
                            {photo && (
                                <div className="relative h-36 w-full overflow-hidden flex-shrink-0" style={{ background: '#0b1220' }}>
                                    <img src={photo} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover scale-125 blur-xl opacity-60" loading="lazy" />
                                    <img src={photo} alt={title} className="relative w-full h-full object-contain" loading="lazy" />
                                    {mine && (
                                        <span className="absolute left-2.5 top-2.5 text-[9px] font-black uppercase px-2 py-1 rounded-full text-white" style={{ background: HOME_GRADIENT }}>
                                            seu pedido
                                        </span>
                                    )}
                                </div>
                            )}

                            <div className={`flex flex-col gap-2 flex-1 ${photo ? 'p-3' : 'p-3.5'}`}>
                                {/* Em cima: o tipo do serviço (esquerda) e há quanto tempo foi pedido (direita) */}
                                <div className="flex items-start justify-between gap-2">
                                    <span className="min-w-0 flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${colors.accent}18`, color: colors.accent }}>
                                        <Icon size={11} className="flex-shrink-0" />
                                        <span className="truncate">{getItemLabel(item)}</span>
                                    </span>
                                    <span className="flex-shrink-0 flex items-center gap-1 text-[10px] pt-0.5" style={{ color: colors.textSecondary }}>
                                        {mine && !photo && <span className="text-[9px] font-black uppercase px-2 py-1 rounded-full text-white" style={{ background: HOME_GRADIENT }}>seu pedido</span>}
                                        {askedAgo(item.created_at).replace('pediu ', '')}
                                        {mine && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setMenuItem(item) }}
                                                aria-label="Mais opções do seu pedido"
                                                className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 -mr-1 -my-1 transition-colors hover:bg-black/10"
                                                style={{ color: colors.textPrimary }}
                                            >
                                                <MoreHorizontal size={17} />
                                            </button>
                                        )}
                                    </span>
                                </div>

                                {/* O que a pessoa pediu é o foco: a letra cresce até preencher o espaço do cartão (mais ainda sem foto) */}
                                <div className={`flex flex-col flex-1 ${photo ? 'min-h-[44px]' : 'min-h-[130px]'}`}>
                                    <FitText text={title} title={title} min={photo ? 14 : 16} max={photo ? 22 : 34} style={{ color: colors.textPrimary }} />
                                </div>

                                {/* Embaixo, numa linha só: a distância (só quando há local e posição do pedido) e a ação */}
                                {(distances.get(item.id) != null || !mine) && (
                                    <div className="nas-row flex items-center gap-2">
                                        {distances.get(item.id) != null && (
                                            <span className="flex-shrink-0 flex items-center gap-1 text-[11px] font-bold whitespace-nowrap" style={{ color: colors.textSecondary }}>
                                                <MapPin size={11} className="flex-shrink-0" />
                                                {formatDistance(distances.get(item.id) as number)}
                                            </span>
                                        )}

                                        {!mine && applied?.has(item.id) && applied.get(item.id) !== 'rejected' && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); goFromHome(`/procurar-servico?pedido=${item.id}`) }}
                                                className="flex-1 min-w-0 flex items-center justify-center gap-1.5 h-10 rounded-full font-black text-[13px]"
                                                style={{ background: '#22c55e18', color: '#16a34a', border: '1px solid #22c55e55' }}
                                            >
                                                <Check size={15} className="flex-shrink-0" />
                                                <span className="truncate">{applied.get(item.id) === 'accepted' ? 'Você foi escolhido!' : 'Já me inscrevi'}</span>
                                            </button>
                                        )}

                                        {!mine && !(applied?.has(item.id) && applied.get(item.id) !== 'rejected') && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); goFromHome(`/procurar-servico?pedido=${item.id}`) }}
                                                className="flex-1 min-w-0 flex items-center justify-center h-10 px-2 rounded-full font-black text-[13px] whitespace-nowrap transition-all hover:scale-[1.02] active:scale-95"
                                                style={{ background: HOME_GRADIENT, color: '#fff', boxShadow: '0 4px 12px #f9731640' }}
                                            >
                                                <span className="nas-long">Quero me inscrever</span>
                                                <span className="nas-short">Me inscrever</span>
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </SeenBox>
                    )
                })}
            </div>
            </div>
            <PageDots pages={pages} page={page} onGo={goTo} label="Ver pedidos, página" />
            <style>{PAGE_SLIDE_CSS}</style>
            {/* Cartão estreito (2 por linha no celular): o botão usa o texto curto para caber ao lado da distância */}
            <style>{`
                .nas-row { container-type: inline-size; }
                .nas-short { display: none; }
                @container (max-width: 215px) { .nas-long { display: none; } .nas-short { display: inline; } }
            `}</style>

            {menuItem && createPortal(
                <div className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center sm:p-4" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={closeMenu}>
                    <div
                        className="w-full sm:max-w-xs rounded-t-3xl sm:rounded-3xl p-4 flex flex-col gap-2"
                        style={{ background: colors.surface, border: `1px solid ${colors.border}` }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-1">
                            <p className="text-sm font-black" style={{ color: colors.textPrimary }}>
                                Seu pedido de {getItemLabel(menuItem).toLowerCase()}
                            </p>
                            <button onClick={closeMenu} aria-label="Fechar" style={{ color: colors.textSecondary }}><X size={18} /></button>
                        </div>

                        {!confirmDelete ? (
                            <>
                                <button
                                    onClick={() => { setDetailsId(menuItem.id); closeMenu() }}
                                    className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-bold text-left"
                                    style={{ background: `${colors.border}30`, color: colors.textPrimary }}
                                >
                                    <Pencil size={16} style={{ color: colors.accent }} />
                                    Ver detalhes e editar
                                </button>
                                <button
                                    onClick={() => setConfirmDelete(true)}
                                    className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-bold text-left"
                                    style={{ background: '#ef444415', color: '#ef4444' }}
                                >
                                    <Trash2 size={16} />
                                    Excluir pedido
                                </button>
                            </>
                        ) : (
                            <>
                                <p className="text-sm" style={{ color: colors.textSecondary }}>
                                    Tem certeza? O pedido some pra todo mundo e não dá pra desfazer.
                                </p>
                                <div className="flex gap-2 mt-1">
                                    <button
                                        onClick={() => setConfirmDelete(false)}
                                        className="flex-1 py-2.5 rounded-xl text-xs font-black uppercase"
                                        style={{ background: `${colors.border}30`, color: colors.textPrimary, border: `1px solid ${colors.border}` }}
                                    >
                                        Voltar
                                    </button>
                                    <button
                                        onClick={deleteRequest}
                                        disabled={deleting}
                                        className="flex-1 py-2.5 rounded-xl text-xs font-black uppercase flex items-center justify-center gap-2 disabled:opacity-60"
                                        style={{ background: '#ef4444', color: '#fff' }}
                                    >
                                        {deleting && <Spinner size={14} />}
                                        Excluir
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>,
                document.body
            )}

            {detailsId && <ServiceRequestDetailsDialog requestId={detailsId} onClose={() => { setDetailsId(null); load() }} />}

            {viewItem && (
                <ServiceRequestViewDialog
                    item={viewItem}
                    isMine={viewItem.requester_id === userId}
                    applied={applied.has(viewItem.id)}
                    onApply={() => { const id = viewItem.id; setViewItem(null); goFromHome(`/procurar-servico?pedido=${id}`) }}
                    onClose={() => setViewItem(null)}
                />
            )}

            {/* Fora do carrossel de propósito: com muitos pedidos o botão ficaria
                lá no fim da rolagem e ninguém veria. */}
            <button
                onClick={() => go('/solicitar-servico')}
                className="mt-3 w-full flex items-center justify-center gap-2 py-3 rounded-full font-black text-sm transition-all hover:scale-[1.02] active:scale-95"
                style={{ background: HOME_GRADIENT, color: '#fff', boxShadow: '0 4px 12px #f9731640' }}
            >
                <Plus size={16} />
                Precisa de um serviço? Peça o seu
            </button>
        </section>
    )
}
