// src/components/v3/ProfileHeaderV3.tsx
//
// Cabeçalho da página pública de um PERFIL na interface 3.0: capa, foto redonda, nome, atalhos em cápsulas e linha de ações.
// Só apresentação (como StoreHeaderV3): dados e ações vêm de `Profile.tsx`; blocos complexos (avatar com moldura/zoom/upload, janelas
// da agenda, mapa ao vivo, botão de conversar) chegam prontos por slots, então a regra é a mesma da v2.
'use client'

import { useState, type ReactNode } from 'react'
import { ArrowLeft, Calendar, Camera, Eye, MapPin, MessageCircle, Pencil, Share2, UserCheck, UserPlus, Users } from 'lucide-react'

const ORANGE = '#f97316'

export interface ProfileHeaderV3Store { id: string; name: string; slug: string; logoUrl: string | null }

export interface ProfileHeaderV3Props {
    colors: any
    name: string
    avatarSlot: ReactNode
    levelSlot?: ReactNode
    seen?: { online: boolean; text: string } | null
    description?: string | null
    address?: string | null
    onOpenMaps: () => void
    visits: number
    followers: number
    following: number
    onOpenFollowers: () => void
    onOpenFollowing: () => void
    shareCount: number
    onShare: () => void
    onBack: () => void
    canFollow: boolean
    isFollowing: boolean
    onFollowToggle: () => void
    whatsappLink?: string | null
    instagramLink?: string | null
    contactSlot?: ReactNode
    liveLocSlot?: ReactNode
    dialogsSlot?: ReactNode
    isOwner: boolean
    onEdit: () => void
    chatEnabled: boolean
    chatSaving: boolean
    onToggleChat: () => void
    allowScheduling: boolean
    onOpenAgendaDialog: () => void
    onOpenOwnerAgenda: () => void
    onOpenSchedule: () => void
    ownerFirstName: string
    stores: ProfileHeaderV3Store[]
    onOpenStore: (slug: string) => void
}

export default function ProfileHeaderV3(p: ProfileHeaderV3Props) {
    const { colors } = p
    const [expanded, setExpanded] = useState(false)
    const soft = `${colors.border}40`
    const DESC_LIMIT = 120
    const desc = p.description || ''
    const capsule = 'inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[11px] font-bold transition active:scale-95 max-w-full'
    const round = 'flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center transition active:scale-95'

    return (
        <section className="rounded-3xl overflow-hidden" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
            <div className="relative h-20" style={{ background: ORANGE }}>
                <button onClick={p.onBack} aria-label="Voltar" className="absolute top-3 left-3 w-10 h-10 rounded-full flex items-center justify-center transition active:scale-95" style={{ background: colors.surface, color: colors.textPrimary }}>
                    <ArrowLeft size={19} />
                </button>
                <button onClick={p.onShare} aria-label="Compartilhar" className="absolute top-3 right-3 w-10 h-10 rounded-full flex items-center justify-center transition active:scale-95" style={{ background: colors.surface, color: colors.textPrimary }}>
                    <Share2 size={17} />
                    {p.shareCount > 0 && (
                        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-white text-[9px] font-black flex items-center justify-center" style={{ background: '#ef4444', border: `2px solid ${colors.surface}` }}>
                            {p.shareCount}
                        </span>
                    )}
                </button>
            </div>

            <div className="px-4 pb-4">
                {/* foto redonda sobre a capa, nome centralizado */}
                <div className="relative z-10 -mt-11 flex flex-col items-center text-center">
                    {p.avatarSlot}
                    <h1 className="mt-2 text-[19px] font-black leading-tight" style={{ color: colors.textPrimary }}>{p.name}</h1>
                    {p.levelSlot && <div className="mt-1 flex justify-center">{p.levelSlot}</div>}
                    {p.seen && (
                        <p className="mt-1 flex items-center justify-center gap-1.5 text-[11px] font-bold" style={{ color: p.seen.online ? '#16a34a' : colors.textSecondary }}>
                            <span className={`w-1.5 h-1.5 rounded-full ${p.seen.online ? 'animate-pulse' : ''}`} style={{ background: p.seen.online ? '#22c55e' : colors.textSecondary, opacity: p.seen.online ? 1 : 0.5 }} />
                            {p.seen.text}
                        </p>
                    )}
                </div>

                {desc && (
                    <p className="mt-3 text-[13px] leading-relaxed text-center" style={{ color: colors.textSecondary }}>
                        {expanded || desc.length <= DESC_LIMIT ? desc : `${desc.slice(0, DESC_LIMIT)}…`}
                        {desc.length > DESC_LIMIT && (
                            <button onClick={() => setExpanded((v) => !v)} className="ml-1 font-black text-[11px]" style={{ color: ORANGE }}>{expanded ? 'ver menos' : 'ver mais'}</button>
                        )}
                    </p>
                )}

                <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                    {p.address && (
                        <button onClick={p.onOpenMaps} className={capsule} style={{ background: soft, color: colors.textPrimary }}>
                            <MapPin size={13} className="flex-shrink-0" style={{ color: ORANGE }} />
                            <span className="truncate max-w-[220px]">{p.address}</span>
                        </button>
                    )}
                    <span className={capsule} style={{ background: soft, color: colors.textSecondary }}>
                        <Eye size={13} className="flex-shrink-0" />
                        <b style={{ color: colors.textPrimary }}>{p.visits}</b>
                    </span>
                    <button onClick={p.onOpenFollowers} className={capsule} style={{ background: soft, color: colors.textSecondary }}>
                        <Users size={13} className="flex-shrink-0" />
                        <b style={{ color: colors.textPrimary }}>{p.followers}</b> seguidores
                    </button>
                    <button onClick={p.onOpenFollowing} className={capsule} style={{ background: soft, color: colors.textSecondary }}>
                        <UserCheck size={13} className="flex-shrink-0" />
                        <b style={{ color: colors.textPrimary }}>{p.following}</b> seguindo
                    </button>
                </div>

                {/* ações */}
                <div className="mt-3 flex items-center gap-2">
                    {p.canFollow && (
                        <button
                            onClick={p.onFollowToggle}
                            className="flex-1 h-11 rounded-full text-[13px] font-black flex items-center justify-center gap-1.5 transition active:scale-95"
                            style={p.isFollowing ? { background: 'transparent', color: ORANGE, border: `2px solid ${ORANGE}` } : { background: ORANGE, color: '#fff' }}
                        >
                            {p.isFollowing ? <UserCheck size={16} /> : <UserPlus size={16} />}
                            {p.isFollowing ? 'Seguindo' : 'Seguir'}
                        </button>
                    )}
                    {p.isOwner && (
                        <button onClick={p.onEdit} className="flex-1 h-11 rounded-full text-[13px] font-black flex items-center justify-center gap-1.5 transition active:scale-95" style={{ background: ORANGE, color: '#fff' }}>
                            <Pencil size={15} />
                            Editar perfil
                        </button>
                    )}
                    {p.whatsappLink && (
                        <a href={p.whatsappLink} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" className={round} style={{ background: '#25D3661f', color: '#25D366' }}>
                            <MessageCircle size={19} />
                        </a>
                    )}
                    {p.instagramLink && (
                        <a href={p.instagramLink} target="_blank" rel="noopener noreferrer" aria-label="Instagram" className={round} style={{ background: soft, color: colors.textPrimary }}>
                            <Camera size={18} />
                        </a>
                    )}
                </div>

                {p.contactSlot && <div className="mt-2">{p.contactSlot}</div>}

                {!p.isOwner && p.allowScheduling && (
                    <button onClick={p.onOpenSchedule} className="mt-2 w-full h-11 rounded-2xl px-3 flex items-center gap-2.5 text-left transition active:scale-[0.99]" style={{ background: soft }}>
                        <Calendar size={17} style={{ color: ORANGE }} className="flex-shrink-0" />
                        <span className="text-[13px] font-black flex-1 truncate" style={{ color: colors.textPrimary }}>Agendar com {p.ownerFirstName}</span>
                    </button>
                )}

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
                        {p.allowScheduling && (
                            <button onClick={p.onOpenOwnerAgenda} className={capsule} style={{ background: soft, color: colors.textPrimary }}>
                                Ver minha agenda
                            </button>
                        )}
                        {p.chatEnabled && (
                            <a href="/conversas" className={capsule} style={{ background: soft, color: colors.textPrimary }}>Ver conversas</a>
                        )}
                    </div>
                )}

                {p.liveLocSlot && <div className="mt-3">{p.liveLocSlot}</div>}

                {p.stores.length > 0 && (
                    <div className="mt-3 flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1">
                        <span className="flex-shrink-0 text-[10px] font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>Lojas</span>
                        {p.stores.map((s) => (
                            <button key={s.id} onClick={() => p.onOpenStore(s.slug)} className="flex-shrink-0 h-8 pl-1 pr-3 rounded-full flex items-center gap-1.5 text-[11px] font-black transition active:scale-95" style={{ background: soft, color: colors.textPrimary }}>
                                <span className="w-6 h-6 rounded-full overflow-hidden flex items-center justify-center" style={{ background: `${ORANGE}26` }}>
                                    {s.logoUrl ? <img src={s.logoUrl} alt={s.name} className="w-full h-full object-cover" /> : <span style={{ color: ORANGE }}>{s.name?.charAt(0).toUpperCase()}</span>}
                                </span>
                                {s.name}
                            </button>
                        ))}
                    </div>
                )}

                {p.dialogsSlot}
            </div>
        </section>
    )
}
