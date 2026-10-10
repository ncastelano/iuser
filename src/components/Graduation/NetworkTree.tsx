// src/components/Graduation/NetworkTree.tsx
//
// Árvore da rede: UM nível por vez, carregado ao abrir cada pessoa e paginado ("Carregar mais") — nunca a rede
// inteira de uma vez. Cada pessoa mostra nome, graduação (selo + moldura do avatar) e a comissão efetiva.
// O "loader" decide de onde vêm os dados: a própria rede do usuário (RPC get_network_children, que só deixa abrir
// a própria rede) ou, no painel do admin, a rede de qualquer pessoa (rota /api/admin/graduation).
'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { Spinner } from '@/components/Spinner'
import { useTheme } from '@/app/contexts/theme'
import { formatPercent, type NetworkChild } from '@/lib/graduation'
import LevelBadge, { LevelAvatarFrame } from './LevelBadge'

export type TreeLoader = (parentId: string | null, offset: number) => Promise<{ children: NetworkChild[]; total: number }>

const PAGE = 20

function TreeLevel({ parentId, loader, depth }: { parentId: string | null; loader: TreeLoader; depth: number }) {
    const { colors } = useTheme()
    const [items, setItems] = useState<NetworkChild[]>([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [open, setOpen] = useState<Set<string>>(new Set())

    const load = useCallback(async (offset: number) => {
        setLoading(true)
        try {
            const res = await loader(parentId, offset)
            setItems((prev) => (offset === 0 ? res.children : [...prev, ...res.children]))
            setTotal(res.total)
            setError(null)
        } catch (e: any) {
            setError(e?.message || 'Erro ao carregar a rede')
        } finally {
            setLoading(false)
        }
    }, [loader, parentId])

    useEffect(() => { load(0) }, [load])

    if (error) return <p className="text-xs py-2" style={{ color: '#ef4444' }}>{error}</p>
    if (!loading && items.length === 0) {
        return <p className="text-xs py-2" style={{ color: colors.textSecondary }}>{depth === 0 ? 'Ninguém na rede ainda.' : 'Sem indicados.'}</p>
    }

    return (
        <div className={depth > 0 ? 'ml-3 pl-3 border-l' : ''} style={{ borderColor: colors.border }}>
            {items.map((c) => {
                const isOpen = open.has(c.id)
                const canOpen = c.direct_count > 0
                return (
                    <div key={c.id} className="py-1.5">
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                disabled={!canOpen}
                                onClick={() => setOpen((prev) => { const n = new Set(prev); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n })}
                                aria-label={isOpen ? 'Recolher' : 'Ver indicados'}
                                className="w-6 h-6 flex items-center justify-center flex-shrink-0 rounded-full"
                                style={{ color: canOpen ? colors.textPrimary : 'transparent', cursor: canOpen ? 'pointer' : 'default' }}
                            >
                                {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            </button>

                            <LevelAvatarFrame level={{ ...c, name: c.level_name }}>
                                {c.avatar_url
                                    ? <img src={c.avatar_url} alt="" className="w-9 h-9 object-cover" />
                                    : <span className="w-9 h-9 flex items-center justify-center text-xs font-black text-white" style={{ background: 'linear-gradient(135deg,#f97316,#dc2626)' }}>{(c.name || '?').charAt(0).toUpperCase()}</span>}
                            </LevelAvatarFrame>

                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                    {c.profile_slug
                                        ? <Link href={`/${c.profile_slug}`} className="text-sm font-black truncate hover:underline" style={{ color: colors.textPrimary }}>{c.profile_slug ? `@${c.profile_slug}` : c.name}</Link>
                                        : <span className="text-sm font-black truncate" style={{ color: colors.textPrimary }}>{c.name || 'Usuário'}</span>}
                                    <LevelBadge level={{ ...c, name: c.level_name }} size="sm" />
                                    {!c.is_valid && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: '#ef444420', color: '#ef4444' }}>Inativo</span>}
                                </div>
                                <p className="text-[11px]" style={{ color: colors.textSecondary }}>
                                    Pré {formatPercent(c.rate_prepaid_bp)} · Pós {formatPercent(c.rate_postpaid_bp)}
                                    {c.is_custom ? ' · personalizada' : ''}
                                    {c.direct_count > 0 ? ` · ${c.direct_count} ${c.direct_count === 1 ? 'indicado' : 'indicados'}` : ''}
                                </p>
                            </div>
                        </div>
                        {isOpen && canOpen && <TreeLevel parentId={c.id} loader={loader} depth={depth + 1} />}
                    </div>
                )
            })}

            {loading && <div className="py-2 flex justify-center"><Spinner size={18} color={colors.accent} /></div>}
            {!loading && items.length < total && (
                <button
                    type="button"
                    onClick={() => load(items.length)}
                    className="w-full mt-1 py-2 rounded-xl text-xs font-bold"
                    style={{ border: `1px dashed ${colors.border}`, color: colors.accent }}
                >
                    Carregar mais ({total - items.length})
                </button>
            )}
        </div>
    )
}

export default function NetworkTree({ rootId, loader, rootLabel }: { rootId: string | null; loader: TreeLoader; rootLabel?: string }) {
    const { colors } = useTheme()
    return (
        <div>
            {rootLabel && <p className="text-xs font-black uppercase tracking-wider mb-1" style={{ color: colors.textSecondary }}>{rootLabel}</p>}
            <TreeLevel parentId={rootId} loader={loader} depth={0} />
        </div>
    )
}

export { PAGE as TREE_PAGE_SIZE }
