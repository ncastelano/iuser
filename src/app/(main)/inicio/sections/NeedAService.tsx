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
import { MapPin, Plus, Eye, Check, Wrench, MoreHorizontal, Pencil, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase/client'
import ServiceRequestDetailsDialog from '@/components/ServiceRequestDetailsDialog'
import { Spinner } from '@/components/Spinner'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { useNavProgressStore } from '@/store/useNavProgressStore'
import { BoardItem, fetchOpenBoardItems, fetchOpenRequestCount, getItemIcon, getItemLabel, shortAddress, askedAgo, notifyServiceRequestsChanged, SERVICE_REQUESTS_CHANGED } from '@/lib/serviceBoard'
import { HOME_GRADIENT, HomeSectionHeader } from './HomeSectionKit'
import { ViewServicesButton } from './ViewServicesButton'
import { useMyServiceApplications } from '@/hooks/useMyServiceApplications'
import PlanAvatarRing from '@/components/PlanAvatarRing'

// Em vitrine pública, só rua/bairro — o número fica pra quem for atender.
function publicPlace(address: string): string {
    return shortAddress(address).replace(/[,\s]+\d+\s*\w*$/, '')
}

export default function NeedAService({ dragHandle, limit = 8 }: { dragHandle?: ReactNode; limit?: number }) {
    const { colors } = useTheme()
    const router = useRouter()
    const startNavProgress = useNavProgressStore((s) => s.start)
    const { userId } = useProfile()
    const { items: myApplications } = useMyServiceApplications()
    const applied = useMemo(() => new Map(myApplications.map((a) => [a.requestId, a.status])), [myApplications])
    const [items, setItems] = useState<BoardItem[] | null>(null)
    const [totalCount, setTotalCount] = useState(0)
    const [menuItem, setMenuItem] = useState<BoardItem | null>(null)
    const [confirmDelete, setConfirmDelete] = useState(false)
    const [deleting, setDeleting] = useState(false)
    const [detailsId, setDetailsId] = useState<string | null>(null)

    const load = useCallback(() => {
        fetchOpenBoardItems(limit).then(setItems)
        fetchOpenRequestCount().then(setTotalCount)
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

    if (items === null) return null

    return (
        <section>
            <HomeSectionHeader
                dragHandle={dragHandle}
                title="Quem procura serviço"
                subtitle={items.length > 0 ? 'Pessoas precisando de um profissional agora' : 'Ninguém pediu ainda — seja o primeiro'}
                action={<ViewServicesButton onClick={() => go('/procurar-servico')} count={totalCount} />}
            />

            <div className="flex gap-3 overflow-x-auto pb-1">
                {items.map((item) => {
                    const Icon = getItemIcon(item)
                    const mine = item.requester_id === userId
                    const who = mine ? 'Você' : item.requester?.name?.split(' ')[0] || (item.requester?.profileSlug ? `@${item.requester.profileSlug}` : 'Alguém')
                    return (
                        <div
                            key={item.id}
                            className="flex-shrink-0 w-64 rounded-2xl p-3.5 flex flex-col gap-2"
                            style={{
                                background: colors.surface,
                                border: `1px solid ${mine ? colors.accent : colors.border}`,
                                boxShadow: colors.shadow,
                            }}
                        >
                            <div className="flex items-center gap-2">
                                <PlanAvatarRing userId={item.requester_id}>
                                    {item.requester?.avatarUrl ? (
                                        <img src={item.requester.avatarUrl} className="w-7 h-7 rounded-full object-cover flex-shrink-0" alt="" />
                                    ) : (
                                        <span className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-black" style={{ background: HOME_GRADIENT, color: '#fff' }}>
                                            {who.charAt(0).toUpperCase()}
                                        </span>
                                    )}
                                </PlanAvatarRing>
                                <div className="min-w-0 flex-1">
                                    <p className="text-xs font-bold truncate flex items-center gap-1.5" style={{ color: colors.textPrimary }}>
                                        {who}
                                        {mine && (
                                            <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ background: `${colors.accent}20`, color: colors.accent }}>
                                                seu pedido
                                            </span>
                                        )}
                                    </p>
                                    <p className="text-[10px] whitespace-nowrap" style={{ color: colors.textSecondary }}>{askedAgo(item.created_at)}</p>
                                </div>
                                <span
                                    className="flex items-center gap-1 text-[10px] flex-shrink-0"
                                    style={{ color: colors.textSecondary }}
                                    title={`${item.view_count} ${item.view_count === 1 ? 'pessoa viu' : 'pessoas viram'} este pedido`}
                                >
                                    <Eye size={11} />
                                    {item.view_count}
                                </span>
                                {mine && (
                                    <button
                                        onClick={() => setMenuItem(item)}
                                        aria-label="Mais opções do seu pedido"
                                        className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 -mr-1 transition-colors hover:bg-black/10"
                                        style={{ color: colors.textPrimary }}
                                    >
                                        <MoreHorizontal size={17} />
                                    </button>
                                )}
                            </div>

                            <div className="flex items-center gap-3">
                                {/* Foto do que está procurando; o ícone só aparece quando não tem foto */}
                                <span
                                    className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 overflow-hidden"
                                    style={{ background: item.photo_urls?.[0] ? colors.border : HOME_GRADIENT, color: '#fff' }}
                                >
                                    {item.photo_urls?.[0] ? (
                                        <img src={item.photo_urls[0]} alt="" className="w-full h-full object-cover" loading="lazy" />
                                    ) : (
                                        <Icon size={22} />
                                    )}
                                </span>
                                <div className="min-w-0">
                                    <p className="text-sm font-black truncate" style={{ color: colors.textPrimary }}>Procura {getItemLabel(item).toLowerCase()}</p>
                                    <p className="text-[11px] flex items-center gap-1 truncate" style={{ color: colors.textSecondary }}>
                                        <MapPin size={10} className="flex-shrink-0" />
                                        {publicPlace(item.location_address)}
                                    </p>
                                </div>
                            </div>

                            {item.description && (
                                <p className="text-xs line-clamp-2" style={{ color: colors.textSecondary }}>{item.description}</p>
                            )}

                            {!mine && applied?.has(item.id) && applied.get(item.id) !== 'rejected' && (
                                <button
                                    onClick={() => go(`/procurar-servico?pedido=${item.id}`)}
                                    className="mt-auto w-full flex items-center justify-center gap-2 py-3 rounded-full font-black text-sm"
                                    style={{ background: '#22c55e18', color: '#16a34a', border: '1px solid #22c55e55' }}
                                >
                                    <Check size={16} />
                                    {applied.get(item.id) === 'accepted' ? 'Você foi escolhido!' : 'Você já se inscreveu'}
                                </button>
                            )}

                            {!mine && !(applied?.has(item.id) && applied.get(item.id) !== 'rejected') && (
                                <button
                                    onClick={() => go(`/procurar-servico?pedido=${item.id}`)}
                                    className="mt-auto w-full flex items-center justify-center gap-2 py-3 rounded-full font-black text-sm transition-all hover:scale-[1.02] active:scale-95"
                                    style={{ background: HOME_GRADIENT, color: '#fff', boxShadow: '0 4px 12px #f9731640' }}
                                >
                                    <Wrench size={16} />
                                    Quero fazer esse serviço
                                </button>
                            )}
                        </div>
                    )
                })}
            </div>

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
