'use client'

// src/components/digital/StoreDigitalShelves.tsx — a aba de conteúdos digitais da página da loja: PRATELEIRAS por tipo (cursos e aulas,
// músicas e álbuns, audiolivros e podcasts, filmes e vídeos, e-books e arquivos, programas), cada uma uma fileira de capas. O tipo é o que o
// lojista escolheu ao criar o produto. Cada modelo de loja de criador começa pelas prateleiras dele (`order`). Dá para experimentar sem sair
// da página: música, audiolivro e podcast têm "Ouvir prévia" (até 30 s); curso e filme usam a prévia em vídeo do cartão.
// A DONA (Studio/Conteúdo) vê "Destacar no topo" nos itens que podem ser o destaque.
import { useState } from 'react'
import { Headphones, Pause, Star } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { toast } from '@/lib/toast'
import { groupIntoShelves, isAudioKind, setStoreFeatured, type ShowcaseItem } from '@/modules/digital'
import DigitalCards from './DigitalCards'
import { useAudioPreview } from './useAudioPreview'

export default function StoreDigitalShelves({ items, order, titles, owner }: {
    items: ShowcaseItem[]
    order?: string[]
    titles?: Record<string, string>
    /** só a dona: pode escolher o destaque do topo entre estes tipos */
    owner?: { storeId: string; heroKinds: string[]; onChanged: () => void }
}) {
    const { colors } = useTheme()
    const { playing, loading, toggle } = useAudioPreview()
    const [saving, setSaving] = useState<string | null>(null)
    const shelves = groupIntoShelves(items, order, titles)

    const feature = async (p: ShowcaseItem) => {
        if (!owner) return
        setSaving(p.id)
        try { await setStoreFeatured(owner.storeId, p.isFeatured ? null : p.id); toast.success(p.isFeatured ? 'Destaque retirado' : 'Agora é o destaque do topo'); owner.onChanged() }
        catch (e) { toast.error(e instanceof Error ? e.message : 'Não foi possível salvar o destaque.') } finally { setSaving(null) }
    }

    if (shelves.length === 0) return null
    return (
        <div className="space-y-6">
            {shelves.map((sh) => (
                <section key={sh.id}>
                    <p className="text-[13px] font-black mb-1 flex items-baseline gap-2" style={{ color: colors.textPrimary }}>{sh.title}<span className="text-[11px] font-bold" style={{ color: colors.textSecondary }}>{sh.items.length}</span></p>
                    <DigitalCards items={sh.items} layout="strip" extra={(p) => {
                        const listen = isAudioKind(p.kind) && p.videos === 0     // playlist de vídeos usa a prévia em vídeo do cartão, não áudio
                        const canFeature = !!owner && owner.heroKinds.includes(p.kind)
                        if (!listen && !canFeature) return null
                        return (
                            <div className="mt-2 flex gap-1.5">
                                {listen && (
                                    <button type="button" onClick={() => toggle(p.id)} disabled={loading === p.id}
                                        className="flex-1 h-9 rounded-full text-[12px] font-black flex items-center justify-center gap-1.5 active:scale-95 transition disabled:opacity-60"
                                        style={playing === p.id ? { background: '#8b5cf6', color: '#fff' } : { border: `1px solid ${colors.border}`, color: colors.textPrimary }}>
                                        {playing === p.id ? <><Pause size={14} />Pausar</> : <><Headphones size={14} />{loading === p.id ? 'Carregando…' : 'Ouvir prévia'}</>}
                                    </button>
                                )}
                                {canFeature && (
                                    <button type="button" onClick={() => feature(p)} disabled={saving === p.id}
                                        className="flex-1 h-9 rounded-full text-[12px] font-black flex items-center justify-center gap-1.5 active:scale-95 transition disabled:opacity-60"
                                        style={p.isFeatured ? { background: '#fbbf2433', color: '#92400e' } : { border: `1px dashed ${colors.border}`, color: colors.textSecondary }}>
                                        <Star size={13} fill={p.isFeatured ? '#f59e0b' : 'none'} style={{ color: '#f59e0b' }} />{p.isFeatured ? 'No topo' : 'Destacar no topo'}
                                    </button>
                                )}
                            </div>
                        )
                    }} />
                </section>
            ))}
        </div>
    )
}
