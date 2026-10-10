// Seção da home "Comunidades": prévia do chat da cidade da pessoa e de até outras 2 comunidades.
// A cidade vem do local salvo (perfil ou aparelho) → nome da cidade (Mapbox, guardado no aparelho pra não consultar toda visita).
// Cada cartão mostra as últimas mensagens e leva pra sala da comunidade.
'use client'

import { ReactNode, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MessageCircle, MapPin, Users, Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { useNavProgressStore } from '@/store/useNavProgressStore'
import { useUserPlace } from '@/hooks/useUserPlace'
import { getAvatarUrl } from '@/lib/avatar'
import { HomeSectionHeader, HOME_GRADIENT } from './HomeSectionKit'
import { ViewServicesButton } from './ViewServicesButton'

interface PreviewMessage { id: string; content: string; created_at: string; name: string; avatar: string | null }
interface CommunityPreview {
    scope: 'city' | 'state' | 'country'
    id: string
    slug: string
    name: string
    city: string
    members: number
    messages: PreviewMessage[]
    lastAt: number
    isMine: boolean
}

const norm = (s: string | null | undefined) =>
    (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

function timeAgo(iso: string) {
    const diff = Date.now() - new Date(iso).getTime()
    const min = Math.floor(diff / 60000)
    if (min < 1) return 'agora'
    if (min < 60) return `${min} min`
    const h = Math.floor(min / 60)
    if (h < 24) return `${h} h`
    return `${Math.floor(h / 24)} d`
}

export default function CommunitiesPreview({ origin, dragHandle }: { origin: { lat: number; lng: number } | null; dragHandle?: ReactNode }) {
    const router = useRouter()
    const { colors } = useTheme()
    const startNavProgress = useNavProgressStore((s) => s.start)
    const { place } = useUserPlace(origin)
    const city = place?.city ?? null
    const state = place?.state ?? null

    const [items, setItems] = useState<CommunityPreview[] | null>(null)

    useEffect(() => {
        let cancelled = false
        const load = async () => {
            const { data: comms } = await supabase.from('communities').select('id, slug, name, city, scope').eq('is_listed', true).eq('requires_password', false)
            if (!comms?.length) { if (!cancelled) setItems([]); return }
            const ids = comms.map((c) => c.id)
            const [{ data: members }, { data: msgs }] = await Promise.all([
                supabase.from('community_members').select('community_id').in('community_id', ids),
                supabase.from('community_messages').select('id, community_id, profile_id, content, created_at').in('community_id', ids).order('created_at', { ascending: false }).limit(60),
            ])
            const authorIds = [...new Set((msgs || []).map((m) => m.profile_id))]
            const { data: authors } = authorIds.length
                ? await supabase.from('profiles').select('id, name, profileSlug, avatar_url').in('id', authorIds)
                : { data: [] as any[] }
            const authorMap = new Map((authors || []).map((a: any) => [a.id, a]))

            const built: CommunityPreview[] = comms.map((c) => {
                const mine = (msgs || []).filter((m) => m.community_id === c.id).slice(0, 2).reverse()
                return {
                    id: c.id, slug: c.slug, name: c.name, city: c.city, scope: (c.scope || 'city') as CommunityPreview['scope'],
                    members: (members || []).filter((m) => m.community_id === c.id).length,
                    messages: mine.map((m) => {
                        const a: any = authorMap.get(m.profile_id)
                        return {
                            id: m.id, content: m.content, created_at: m.created_at,
                            name: a?.name?.split(' ')[0] || (a?.profileSlug ? `@${a.profileSlug}` : 'Alguém'),
                            avatar: getAvatarUrl(supabase, a?.avatar_url) || null,
                        }
                    }),
                    lastAt: (msgs || []).find((m) => m.community_id === c.id) ? new Date((msgs || []).find((m) => m.community_id === c.id)!.created_at).getTime() : 0,
                    isMine: false,
                }
            })
            if (!cancelled) setItems(built)
        }
        load()
        return () => { cancelled = true }
    }, [])

    if (items === null) return null

    // Cidade da pessoa, depois o estado dela e o Brasil; sobrando lugar, as mais ativas (até 3 no total)
    const same = (a: string | null, b: string) => !!a && norm(a) === norm(b)
    const mineIdx = items.findIndex((c) => c.scope === 'city' && same(city, c.city))
    const stateIdx = items.findIndex((c) => c.scope === 'state' && same(state, c.city))
    const countryIdx = items.findIndex((c) => c.scope === 'country')
    const picked = [mineIdx, stateIdx, countryIdx].filter((i) => i >= 0)
    const rest = items
        .filter((_, i) => !picked.includes(i))
        .sort((a, b) => (b.lastAt - a.lastAt) || (b.members - a.members))
    const shown = [
        ...(mineIdx >= 0 ? [{ ...items[mineIdx], isMine: true }] : []),
        ...(stateIdx >= 0 ? [items[stateIdx]] : []),
        ...(countryIdx >= 0 ? [items[countryIdx]] : []),
        ...rest,
    ].slice(0, 3)

    const go = (path: string) => { startNavProgress(); router.push(path) }

    // Sem nenhuma comunidade e sem cidade pra sugerir: a seção nem aparece
    if (shown.length === 0 && !city) return null

    return (
        <section>
            <HomeSectionHeader
                title="Comunidades"
                subtitle={city ? `Converse com quem é de ${city}, do estado e do Brasil` : 'Salas de conversa por cidade, estado e país'}
                dragHandle={dragHandle}
                action={<ViewServicesButton label="ver comunidades" count={items.length} onClick={() => go('/comunidade')} />}
            />

            <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 items-stretch" style={{ scrollbarWidth: 'none' }}>
                {shown.map((c) => (
                    <div
                        key={c.id}
                        onClick={() => go(`/comunidade/${c.slug}`)}
                        className="flex-shrink-0 w-72 rounded-3xl overflow-hidden border cursor-pointer flex flex-col transition-all duration-300 hover:shadow-2xl hover:-translate-y-1"
                        style={{ background: colors.surface, borderColor: c.isMine ? colors.accent : colors.border, boxShadow: colors.shadow }}
                    >
                        <div className="px-4 pt-4 pb-3 flex items-center gap-3" style={{ background: 'linear-gradient(135deg, #f9731618, #dc262610)' }}>
                            <span className="w-11 h-11 rounded-2xl flex items-center justify-center text-white flex-shrink-0" style={{ background: HOME_GRADIENT, boxShadow: '0 4px 12px #f9731640' }}>
                                <MessageCircle size={20} />
                            </span>
                            <div className="min-w-0 flex-1">
                                <p className="text-base font-black leading-tight truncate" style={{ color: colors.textPrimary }}>{c.name}</p>
                                <p className="flex items-center gap-1 text-[11px]" style={{ color: colors.textSecondary }}>
                                    <MapPin size={11} className="flex-shrink-0" />
                                    <span className="truncate">{c.scope === 'country' ? 'Todo o país' : c.scope === 'state' ? 'Estado' : c.city}</span>
                                    <span>·</span>
                                    <Users size={11} className="flex-shrink-0" />
                                    {c.members}
                                </p>
                            </div>
                            {c.isMine && (
                                <span className="text-[10px] font-black px-2 py-1 rounded-full text-white flex-shrink-0" style={{ background: HOME_GRADIENT }}>Sua cidade</span>
                            )}
                        </div>

                        {/* Prévia do chat */}
                        <div className="px-4 py-3 flex flex-col gap-2.5 flex-1 min-h-[120px]">
                            {c.messages.length === 0 ? (
                                <p className="text-xs my-auto text-center" style={{ color: colors.textSecondary }}>Ninguém falou ainda. Comece a conversa!</p>
                            ) : c.messages.map((m) => (
                                <div key={m.id} className="flex items-start gap-2">
                                    {m.avatar ? (
                                        <img src={m.avatar} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" loading="lazy" />
                                    ) : (
                                        <span className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-black flex-shrink-0" style={{ background: HOME_GRADIENT }}>{m.name.charAt(0).toUpperCase()}</span>
                                    )}
                                    <div className="min-w-0 rounded-2xl rounded-tl-md px-3 py-1.5" style={{ background: `${colors.border}30` }}>
                                        <p className="text-[11px] font-black" style={{ color: colors.textPrimary }}>
                                            {m.name} <span className="font-medium" style={{ color: colors.textSecondary }}>· {timeAgo(m.created_at)}</span>
                                        </p>
                                        <p className="text-xs line-clamp-2" style={{ color: colors.textPrimary }}>{m.content}</p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="px-4 pb-4">
                            <span className="w-full flex items-center justify-center gap-2 py-2.5 rounded-full font-black text-sm text-white" style={{ background: HOME_GRADIENT, boxShadow: '0 4px 12px #f9731640' }}>
                                <MessageCircle size={15} />
                                Entrar na conversa
                            </span>
                        </div>
                    </div>
                ))}

                {/* A cidade da pessoa ainda não tem comunidade: convida a criar */}
                {city && mineIdx < 0 && (
                    <div
                        onClick={() => go('/comunidade')}
                        className="flex-shrink-0 w-72 rounded-3xl border-2 border-dashed cursor-pointer flex flex-col items-center justify-center text-center gap-2 p-6 transition-all hover:-translate-y-1"
                        style={{ borderColor: colors.accent, background: colors.surface }}
                    >
                        <span className="w-12 h-12 rounded-full flex items-center justify-center text-white" style={{ background: HOME_GRADIENT }}><Plus size={22} /></span>
                        <p className="text-base font-black" style={{ color: colors.textPrimary }}>{city} ainda não tem comunidade</p>
                        <p className="text-xs" style={{ color: colors.textSecondary }}>Crie a sala de conversa da sua cidade</p>
                    </div>
                )}
            </div>
        </section>
    )
}
