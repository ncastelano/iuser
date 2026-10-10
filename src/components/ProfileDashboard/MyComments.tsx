// src/components/ProfileDashboard/MyComments.tsx
//
// "Meus comentários": os comentários que a pessoa fez nas páginas de publicação, com a opção de apagar cada um.
// Só mexe nos dela (o banco só deixa apagar o próprio comentário).
'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Trash2, MessageSquare } from 'lucide-react'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { Spinner } from '@/components/Spinner'
import DashboardSection from './DashboardSection'

interface MyComment {
    id: string
    content: string
    created_at: string
    publication_id: string
    isReply: boolean
    pubName: string
    href: string | null
}

const LIMIT = 100

export default function MyComments({ userId }: { userId: string }) {
    const { colors } = useTheme()
    const [items, setItems] = useState<MyComment[] | null>(null)
    const [confirmId, setConfirmId] = useState<string | null>(null)
    const [busyId, setBusyId] = useState<string | null>(null)

    const load = useCallback(async () => {
        const { data: rows } = await supabase
            .from('comments')
            .select('id, content, created_at, publication_id, parent_comment_id')
            .eq('profile_id', userId)
            .not('publication_id', 'is', null)
            .order('created_at', { ascending: false })
            .limit(LIMIT)
        const list = (rows || []) as { id: string; content: string; created_at: string; publication_id: string; parent_comment_id: string | null }[]
        if (list.length === 0) { setItems([]); return }

        const pubIds = Array.from(new Set(list.map((r) => r.publication_id)))
        const { data: pubs } = await supabase.from('products').select('id, name, slug, store_id, owner_id').in('id', pubIds)
        const pubList = (pubs || []) as { id: string; name: string | null; slug: string | null; store_id: string | null; owner_id: string | null }[]
        const storeIds = Array.from(new Set(pubList.map((p) => p.store_id).filter(Boolean))) as string[]
        const ownerIds = Array.from(new Set(pubList.filter((p) => !p.store_id).map((p) => p.owner_id).filter(Boolean))) as string[]
        const [storesRes, profilesRes] = await Promise.all([
            storeIds.length ? supabase.from('stores').select('id, storeSlug').in('id', storeIds) : Promise.resolve({ data: [] as any[] }),
            ownerIds.length ? supabase.from('profiles').select('id, profileSlug').in('id', ownerIds) : Promise.resolve({ data: [] as any[] }),
        ])
        const storeSlug = new Map<string, string>(((storesRes.data as any[]) || []).map((s) => [s.id, s.storeSlug]))
        const profSlug = new Map<string, string>(((profilesRes.data as any[]) || []).map((p) => [p.id, p.profileSlug]))
        const pubById = new Map(pubList.map((p) => [p.id, p]))

        setItems(list.map((r) => {
            const pub = pubById.get(r.publication_id)
            const owner = pub ? (pub.store_id ? storeSlug.get(pub.store_id) : pub.owner_id ? profSlug.get(pub.owner_id) : null) : null
            return {
                id: r.id,
                content: r.content,
                created_at: r.created_at,
                publication_id: r.publication_id,
                isReply: !!r.parent_comment_id,
                pubName: pub?.name || 'Publicação',
                href: owner && pub?.slug ? `/${owner}/${pub.slug}` : null,
            }
        }))
    }, [userId])

    useEffect(() => { load() }, [load])

    const remove = async (id: string) => {
        setBusyId(id)
        const { error } = await supabase.from('comments').delete().eq('id', id)
        setBusyId(null)
        setConfirmId(null)
        if (error) { toast.error('Não foi possível excluir: ' + error.message); return }
        setItems((prev) => (prev || []).filter((c) => c.id !== id))
        toast.success('Comentário excluído')
    }

    const count = items?.length ?? 0

    return (
        <DashboardSection
            storageKey="meus-comentarios"
            title="Meus comentários"
            subtitle="Os comentários que você fez nas publicações — apague quando quiser"
            collapsedSummary={items !== null ? <span><b style={{ color: colors.textPrimary }}>{count}</b> {count === 1 ? 'comentário' : 'comentários'} em publicações</span> : undefined}
        >
            {items === null ? (
                <div className="flex justify-center py-6"><Spinner size={22} color={colors.accent} /></div>
            ) : items.length === 0 ? (
                <div className="py-6 flex flex-col items-center gap-2 text-center">
                    <MessageSquare size={26} style={{ color: colors.textSecondary }} />
                    <p className="text-sm font-black" style={{ color: colors.textPrimary }}>Você ainda não comentou em publicações</p>
                </div>
            ) : (
                <ul className="flex flex-col gap-2">
                    {items.map((c) => (
                        <li key={c.id} className="rounded-xl p-3 flex items-start gap-3" style={{ border: `1px solid ${colors.border}` }}>
                            <div className="min-w-0 flex-1">
                                <p className="text-[11px] font-bold truncate" style={{ color: colors.textSecondary }}>
                                    {c.isReply ? 'Resposta em ' : 'Em '}
                                    {c.href ? <Link href={c.href} className="underline" style={{ color: colors.accent }}>{c.pubName}</Link> : c.pubName}
                                    {' · '}{formatDistanceToNow(new Date(c.created_at), { addSuffix: true, locale: ptBR })}
                                </p>
                                <p className="text-sm mt-1 break-words" style={{ color: colors.textPrimary }}>{c.content}</p>
                            </div>
                            {confirmId === c.id ? (
                                <div className="flex flex-col gap-1.5 flex-shrink-0">
                                    <button
                                        onClick={() => remove(c.id)}
                                        disabled={busyId === c.id}
                                        className="px-3 py-1.5 rounded-full text-xs font-black text-white disabled:opacity-60"
                                        style={{ background: '#ef4444' }}
                                    >
                                        {busyId === c.id ? '...' : 'Excluir'}
                                    </button>
                                    <button onClick={() => setConfirmId(null)} className="px-3 py-1 rounded-full text-xs font-bold" style={{ color: colors.textSecondary, border: `1px solid ${colors.border}` }}>
                                        Cancelar
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={() => setConfirmId(c.id)}
                                    aria-label="Excluir comentário"
                                    title="Excluir comentário"
                                    className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition hover:scale-105"
                                    style={{ color: '#ef4444', background: '#ef444414' }}
                                >
                                    <Trash2 size={16} />
                                </button>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </DashboardSection>
    )
}
