// src/components/v3/StoreHeaderV3.tsx
//
// Cabeçalho da página pública de uma LOJA na interface 3.0: logo, nome, status, atalhos em cápsulas e uma linha de ações (sem capa: a navbar da v3 já é a faixa laranja).
// Só apresentação: todos os dados e ações vêm de `Store.tsx` (mesmas regras da v2). Fica em `components/v3` (neutro) e é usado
// quando a tela está dentro da casca da 3.0 (`useInsideShell`).
'use client'

import { useState, type ReactNode } from 'react'
import LinkLinesV3, { type LinkLine } from './LinkLinesV3'
import type { SocialLink } from '@/lib/socialLinks'
import {
    ShoppingBag, Calendar, Clock, Eye, MapPin, MessageCircle, Star, UserCheck, UserPlus, Users,
} from 'lucide-react'

const ORANGE = '#f97316'

export interface StoreHeaderV3Props {
    colors: any
    name: string
    imageUrl: string | null
    description?: string | null
    isOpen: boolean
    statusText: string
    nextOpen?: { day: string; open: string } | null
    hasHours: boolean
    onOpenHours: () => void
    address?: string | null
    onOpenMaps: () => void
    rating: number
    ratingsCount: number
    visitors: number
    followers: number
    onOpenFollowers: () => void
    canFollow: boolean
    isFollowing: boolean
    onFollowToggle: () => void
    onOpenCatalog: () => void
    whatsappLink?: string | null
    /** redes sociais com link (Instagram, YouTube, X, GitHub): só aparece botão de quem tiver */
    socialLinks: SocialLink[]
    allowScheduling: boolean
    onOpenSchedule: () => void
    isOwner: boolean
    chatEnabled: boolean
    chatSaving: boolean
    onToggleChat: () => void
    onOpenAgendaDialog: () => void
    /** botão "Conversar" (quando o chat da loja está ativo e quem vê não é o dono) */
    contactSlot?: ReactNode
    /** Clube VIP e demais blocos que já existiam no cabeçalho da v2 */
    extraSlot?: ReactNode
    /** só o dono: ajustar dias e horários */
    ownerToolsSlot?: ReactNode
}

export default function StoreHeaderV3(p: StoreHeaderV3Props) {
    const { colors } = p
    const [expanded, setExpanded] = useState(false)
    const soft = `${colors.border}40`
    const statusColor = p.isOpen ? '#16a34a' : '#ef4444'
    const DESC_LIMIT = 110
    const desc = p.description || ''
    const initial = (p.name || '?').charAt(0).toUpperCase()

    const capsule = 'inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[11px] font-bold transition active:scale-95 max-w-full'
    
    return (
        <section>
            <div className="px-1 pt-1 pb-2">
                {/* logo + nome + status */}
                <div className="flex items-center gap-3">
                    <div className="flex-shrink-0 w-[62px] h-[62px] rounded-2xl overflow-hidden flex items-center justify-center" style={{ background: colors.surface, border: `3px solid ${colors.surface}`, outline: `2px solid ${statusColor}` }}>
                        {p.imageUrl ? <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" /> : <span className="text-2xl font-black" style={{ color: ORANGE }}>{initial}</span>}
                    </div>
                    <div className="min-w-0 pb-0.5">
                        <h2 className="text-[17px] font-black leading-tight truncate" style={{ color: colors.textPrimary }}>{p.name}</h2>
                        <button
                            onClick={() => { if (p.hasHours) p.onOpenHours() }}
                            className="flex items-center gap-1 text-[11px] font-bold mt-0.5 max-w-full"
                            style={{ color: statusColor }}
                        >
                            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: statusColor }} />
                            <span className="truncate">{p.statusText}</span>
                        </button>
                    </div>
                </div>

                {desc && (
                    <p className="mt-3 text-[13px] leading-relaxed" style={{ color: colors.textSecondary }}>
                        {expanded || desc.length <= DESC_LIMIT ? desc : `${desc.slice(0, DESC_LIMIT)}…`}
                        {desc.length > DESC_LIMIT && (
                            <button onClick={() => setExpanded((v) => !v)} className="ml-1 font-black text-[11px]" style={{ color: ORANGE }}>{expanded ? 'ver menos' : 'ver mais'}</button>
                        )}
                    </p>
                )}

                {/* links em texto (WhatsApp e redes sociais que tiverem link), um por linha */}
                <LinkLinesV3
                    lines={[
                        ...(p.whatsappLink ? [{ kind: 'whatsapp', label: 'WhatsApp', url: p.whatsappLink } as LinkLine] : []),
                        ...p.socialLinks,
                    ]}
                    colors={colors}
                />

                {/* atalhos em cápsulas */}
                <div className="mt-3 flex flex-wrap gap-1.5">
                    {p.address && (
                        <button onClick={p.onOpenMaps} className={capsule} style={{ background: soft, color: colors.textPrimary }}>
                            <MapPin size={13} className="flex-shrink-0" style={{ color: ORANGE }} />
                            <span className="truncate max-w-[210px]">{p.address}</span>
                        </button>
                    )}
                    {!p.isOpen && p.nextOpen && (
                        <button onClick={() => p.hasHours && p.onOpenHours()} className={capsule} style={{ background: `${ORANGE}1a`, color: ORANGE }}>
                            <Clock size={13} className="flex-shrink-0" />
                            Abre {p.nextOpen.day} às {p.nextOpen.open}
                        </button>
                    )}
                    {p.ratingsCount > 0 && (
                        <span className={capsule} style={{ background: soft, color: colors.textPrimary }}>
                            <Star size={13} className="flex-shrink-0" style={{ color: ORANGE, fill: ORANGE }} />
                            {p.rating.toFixed(1).replace('.', ',')} ({p.ratingsCount})
                        </span>
                    )}
                    <span className={capsule} style={{ background: soft, color: colors.textSecondary }}>
                        <Eye size={13} className="flex-shrink-0" />
                        <b style={{ color: colors.textPrimary }}>{p.visitors}</b>
                    </span>
                    <button onClick={p.onOpenFollowers} className={capsule} style={{ background: soft, color: colors.textSecondary }}>
                        <Users size={13} className="flex-shrink-0" />
                        <b style={{ color: colors.textPrimary }}>{p.followers}</b> seguidores
                    </button>
                </div>

                {/* ação principal: Comprar (único botão laranja sólido); Seguir é secundário */}
                <div className="mt-3 flex items-center gap-2">
                    <button onClick={p.onOpenCatalog} className="flex-[1.4] h-11 rounded-full text-[13px] font-black flex items-center justify-center gap-1.5 transition active:scale-95" style={{ background: ORANGE, color: '#fff' }}>
                        <ShoppingBag size={16} />
                        Comprar
                    </button>
                    {p.canFollow && (
                        <button
                            onClick={p.onFollowToggle}
                            className="flex-1 h-11 rounded-full text-[13px] font-black flex items-center justify-center gap-1.5 transition active:scale-95"
                            style={p.isFollowing ? { background: soft, color: colors.textPrimary } : { background: 'transparent', color: ORANGE, border: `2px solid ${ORANGE}` }}
                        >
                            {p.isFollowing ? <UserCheck size={16} /> : <UserPlus size={16} />}
                            {p.isFollowing ? 'Seguindo' : 'Seguir'}
                        </button>
                    )}
                </div>

                {/* conversa pelo iUser */}
                {p.contactSlot && <div className="mt-2 flex">{p.contactSlot}</div>}

                {p.allowScheduling && (
                    <button onClick={p.onOpenSchedule} className="mt-2 w-full h-11 rounded-2xl px-3 flex items-center gap-2.5 text-left transition active:scale-[0.99]" style={{ background: soft }}>
                        <Calendar size={17} style={{ color: ORANGE }} className="flex-shrink-0" />
                        <span className="text-[13px] font-black flex-1" style={{ color: colors.textPrimary }}>Agendar atendimento</span>
                        {p.nextOpen && <span className="text-[10px] font-bold" style={{ color: colors.textSecondary }}>{p.nextOpen.day} {p.nextOpen.open}</span>}
                    </button>
                )}

                {/* só o dono: chat e agenda */}
                {p.isOwner && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                        <button onClick={p.onToggleChat} disabled={p.chatSaving} className={`${capsule} disabled:opacity-60`} style={p.chatEnabled ? { background: soft, color: colors.textPrimary } : { background: `${ORANGE}1a`, color: ORANGE, border: `1px dashed ${ORANGE}` }}>
                            <MessageCircle size={13} />
                            {p.chatEnabled ? 'Chat ativo' : 'Ativar chat'}
                        </button>
                        <button onClick={p.onOpenAgendaDialog} className={capsule} style={p.allowScheduling ? { background: soft, color: colors.textPrimary } : { background: `${ORANGE}1a`, color: ORANGE, border: `1px dashed ${ORANGE}` }}>
                            <Calendar size={13} />
                            {p.allowScheduling ? 'Agenda ativa' : 'Ativar agenda'}
                        </button>
                    </div>
                )}

                {p.extraSlot && <div className="mt-2">{p.extraSlot}</div>}

                {p.ownerToolsSlot && <div className="mt-2">{p.ownerToolsSlot}</div>}
            </div>
        </section>
    )
}
