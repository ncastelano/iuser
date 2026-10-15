// src/modules/chat/ui/GroupInfoSheet.tsx
//
// Dados do grupo: nome (o admin renomeia), quem está/foi convidado, convidar mais gente, remover, silenciar e sair.
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { BellOff, Bell, LogOut, Pencil, UserMinus, UserPlus, X, Check } from 'lucide-react'
import { toast } from 'sonner'
import { useTheme } from '@/app/contexts/theme'
import { getAvatarUrl } from '@/lib/avatar'
import { supabase } from '@/lib/supabase/client'
import { Spinner } from '@/components/Spinner'
import PeoplePicker, { PersonAvatar } from './PeoplePicker'
import {
    getGroupMembers, inviteToGroup, leaveGroup, removeGroupMember, renameGroup, setGroupMuted,
    GROUP_MAX_MEMBERS, type GroupMember, type PersonHit,
} from '../api'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

export default function GroupInfoSheet({ conversationId, title, me, onClose, onChanged, onLeft }: {
    conversationId: string
    title: string
    me: string
    onClose: () => void
    /** Algo mudou (nome, membros): quem abriu recarrega */
    onChanged: () => void
    onLeft: () => void
}) {
    const { colors } = useTheme()
    const [members, setMembers] = useState<GroupMember[] | null>(null)
    const [name, setName] = useState(title)
    const [editing, setEditing] = useState(false)
    const [adding, setAdding] = useState(false)
    const [picked, setPicked] = useState<PersonHit[]>([])
    const [busy, setBusy] = useState(false)

    const load = useCallback(async () => { setMembers(await getGroupMembers(conversationId)) }, [conversationId])
    useEffect(() => { load() }, [load])

    const mine = members?.find((m) => m.profile_id === me)
    const isAdmin = mine?.role === 'admin'
    const memberIds = useMemo(() => new Set((members || []).map((m) => m.profile_id)), [members])
    const active = (members || []).filter((m) => m.status === 'active')
    const invited = (members || []).filter((m) => m.status === 'invited')

    const run = async (fn: () => Promise<unknown>, okMsg?: string) => {
        setBusy(true)
        try {
            await fn()
            if (okMsg) toast.success(okMsg)
            await load()
            onChanged()
        } catch (err: any) {
            toast.error(err.message || 'Não foi possível concluir')
        } finally {
            setBusy(false)
        }
    }

    const personOf = (m: GroupMember) => ({ avatar: getAvatarUrl(supabase, m.avatar_url) || null, slug: m.profile_slug, name: m.name })

    const memberRow = (m: GroupMember) => (
        <div key={m.profile_id} className="flex items-center gap-3 px-2 py-1.5">
            <PersonAvatar p={personOf(m)} size={40} />
            <span className="min-w-0 flex-1">
                <span className="block text-sm font-black truncate" style={{ color: colors.textPrimary }}>
                    {m.name || (m.profile_slug ? `@${m.profile_slug}` : 'Perfil')}{m.profile_id === me ? ' (você)' : ''}
                </span>
                <span className="block text-xs truncate" style={{ color: colors.textSecondary }}>
                    {m.role === 'admin' ? 'Administrador' : m.status === 'invited' ? 'Convite enviado' : m.profile_slug ? `@${m.profile_slug}` : 'Membro'}
                </span>
            </span>
            {isAdmin && m.profile_id !== me && (
                <button
                    disabled={busy}
                    onClick={() => run(() => removeGroupMember(conversationId, m.profile_id), m.status === 'invited' ? 'Convite cancelado' : 'Pessoa removida')}
                    aria-label="Remover do grupo"
                    className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: `${colors.border}40`, color: colors.textSecondary }}
                >
                    <UserMinus size={16} />
                </button>
            )}
        </div>
    )

    return (
        <div className="fixed inset-0 z-[90] flex items-end md:items-center justify-center" role="dialog" aria-modal="true" aria-label="Dados do grupo">
            <button aria-label="Fechar" onClick={onClose} className="absolute inset-0 bg-black/45" />
            <div
                className="relative w-full md:max-w-md flex flex-col rounded-t-[28px] md:rounded-[28px] px-4 pt-4 pb-5"
                style={{ background: colors.background, height: 'min(84dvh, 680px)', boxShadow: '0 -12px 40px rgba(0,0,0,0.25)' }}
            >
                <div className="flex items-center gap-2 flex-shrink-0">
                    {editing ? (
                        <>
                            <input
                                autoFocus
                                value={name}
                                maxLength={60}
                                onChange={(e) => setName(e.target.value)}
                                className="flex-1 min-w-0 px-4 py-2 rounded-2xl text-base font-black focus:outline-none"
                                style={{ background: `${colors.border}40`, color: colors.textPrimary }}
                            />
                            <button
                                disabled={!name.trim() || busy}
                                onClick={async () => { await run(() => renameGroup(conversationId, name.trim()), 'Nome atualizado'); setEditing(false) }}
                                aria-label="Salvar nome"
                                className="w-9 h-9 rounded-full flex items-center justify-center text-white disabled:opacity-40"
                                style={{ background: GRADIENT }}
                            >
                                <Check size={18} />
                            </button>
                        </>
                    ) : (
                        <>
                            <h2 className="flex-1 min-w-0 text-lg font-black truncate" style={{ color: colors.textPrimary }}>{name}</h2>
                            {isAdmin && (
                                <button onClick={() => setEditing(true)} aria-label="Renomear grupo" className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: `${colors.border}40`, color: colors.textPrimary }}>
                                    <Pencil size={16} />
                                </button>
                            )}
                        </>
                    )}
                    <button onClick={onClose} aria-label="Fechar" className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: `${colors.border}40`, color: colors.textPrimary }}>
                        <X size={18} />
                    </button>
                </div>

                {adding ? (
                    <div className="flex-1 min-h-0 flex flex-col mt-3">
                        <p className="text-sm font-black mb-2" style={{ color: colors.textPrimary }}>Convidar para o grupo</p>
                        <PeoplePicker
                            me={me}
                            selected={picked}
                            excludeIds={memberIds}
                            onToggle={(p) => setPicked((cur) => (cur.some((c) => c.id === p.id) ? cur.filter((c) => c.id !== p.id) : [...cur, p]))}
                        />
                        <div className="flex gap-2 pt-3">
                            <button onClick={() => { setAdding(false); setPicked([]) }} className="h-12 px-5 rounded-full text-sm font-black" style={{ background: `${colors.border}40`, color: colors.textPrimary }}>Cancelar</button>
                            <button
                                disabled={picked.length === 0 || busy}
                                onClick={async () => {
                                    await run(() => inviteToGroup(conversationId, picked.map((p) => p.id)), 'Convites enviados')
                                    setAdding(false); setPicked([])
                                }}
                                className="flex-1 h-12 rounded-full text-sm font-black text-white disabled:opacity-40"
                                style={{ background: GRADIENT }}
                            >
                                {busy ? <Spinner size={18} color="#fff" /> : `Convidar ${picked.length || ''}`.trim()}
                            </button>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="flex-1 min-h-0 overflow-y-auto mt-3">
                            {members === null ? (
                                <div className="flex justify-center py-10"><Spinner size={22} color={colors.accent} /></div>
                            ) : (
                                <>
                                    <p className="px-2 pb-1 text-[11px] font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                                        {active.length} {active.length === 1 ? 'pessoa' : 'pessoas'} no grupo
                                    </p>
                                    {active.map(memberRow)}
                                    {invited.length > 0 && (
                                        <>
                                            <p className="px-2 pt-4 pb-1 text-[11px] font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                                                Convidados ({invited.length})
                                            </p>
                                            {invited.map(memberRow)}
                                        </>
                                    )}
                                </>
                            )}
                        </div>

                        <div className="flex-shrink-0 pt-3 flex flex-col gap-2">
                            {isAdmin && (
                                <button
                                    disabled={active.length + invited.length >= GROUP_MAX_MEMBERS}
                                    onClick={() => setAdding(true)}
                                    className="h-12 rounded-full text-sm font-black text-white flex items-center justify-center gap-2 disabled:opacity-40"
                                    style={{ background: GRADIENT }}
                                >
                                    <UserPlus size={17} /> Convidar pessoas
                                </button>
                            )}
                            <div className="flex gap-2">
                                <button
                                    disabled={busy}
                                    onClick={() => run(() => setGroupMuted(conversationId, !mine?.muted), mine?.muted ? 'Avisos ligados' : 'Avisos silenciados')}
                                    className="flex-1 h-11 rounded-full text-sm font-bold flex items-center justify-center gap-2"
                                    style={{ background: `${colors.border}40`, color: colors.textPrimary }}
                                >
                                    {mine?.muted ? <Bell size={16} /> : <BellOff size={16} />} {mine?.muted ? 'Ligar avisos' : 'Silenciar'}
                                </button>
                                <button
                                    disabled={busy}
                                    onClick={async () => {
                                        if (!window.confirm('Sair deste grupo?')) return
                                        setBusy(true)
                                        try { await leaveGroup(conversationId); onLeft() } catch (err: any) { toast.error(err.message || 'Não foi possível sair') } finally { setBusy(false) }
                                    }}
                                    className="flex-1 h-11 rounded-full text-sm font-bold flex items-center justify-center gap-2"
                                    style={{ background: '#ef444418', color: '#dc2626' }}
                                >
                                    <LogOut size={16} /> Sair do grupo
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}
