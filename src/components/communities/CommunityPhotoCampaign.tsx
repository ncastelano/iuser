// src/components/communities/CommunityPhotoCampaign.tsx
//
// A "campanha de foto" de uma comunidade de lugar (cidade/estado/país): mostra no lugar do cartão da sala as fotos que
// as pessoas mandaram hoje. Quem tem mais votos fica na frente, mas a contagem só aparece DEPOIS que a pessoa vota.
// À meia-noite do lugar a mais votada vira a foto da comunidade (isso é feito no banco).
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, ImagePlus, X } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { Spinner } from '@/components/Spinner'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'
const MAX_MB = 6

interface Candidate {
    id: string
    image_url: string
    is_mine: boolean
    my_vote: boolean
    proposer_slug: string | null
    votes: number | null
}

interface Campaign {
    current_image: string | null
    is_member: boolean
    has_voted: boolean
    candidates: Candidate[]
}

interface Props {
    communityId: string
    userId: string | null | undefined
    onClose: () => void
    onLoginNeeded: () => void
}

export default function CommunityPhotoCampaign({ communityId, userId, onClose, onLoginNeeded }: Props) {
    const { colors } = useTheme()
    const [data, setData] = useState<Campaign | null>(null)
    const [busy, setBusy] = useState<string | null>(null)
    const fileRef = useRef<HTMLInputElement>(null)

    const load = useCallback(async () => {
        const { data: res } = await supabase.rpc('get_photo_campaign', { p_community: communityId })
        setData(res as Campaign | null)
    }, [communityId])

    useEffect(() => { load() }, [load])

    const vote = async (candidateId: string) => {
        if (!userId) { onLoginNeeded(); return }
        setBusy(candidateId)
        const { error } = await supabase.rpc('vote_community_photo', { p_candidate: candidateId })
        setBusy(null)
        if (error) { toast.error(error.message); return }
        await load()
    }

    const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        e.target.value = ''
        if (!file) return
        if (!userId) { onLoginNeeded(); return }
        if (!file.type.startsWith('image/')) { toast.error('Escolha uma imagem'); return }
        if (file.size > MAX_MB * 1024 * 1024) { toast.error(`A imagem pode ter até ${MAX_MB} MB`); return }
        setBusy('upload')
        try {
            const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
            const path = `${userId}/${communityId}-${Date.now()}.${ext}`
            const { error: upErr } = await supabase.storage.from('community-photos').upload(path, file, { contentType: file.type, upsert: false })
            if (upErr) throw upErr
            const url = supabase.storage.from('community-photos').getPublicUrl(path).data.publicUrl
            const { error } = await supabase.rpc('propose_community_photo', { p_community: communityId, p_image_url: url })
            if (error) throw error
            toast.success('Foto enviada pra votação de hoje')
            await load()
        } catch (err: any) {
            toast.error(err.message || 'Não foi possível enviar a foto')
        } finally {
            setBusy(null)
        }
    }

    const total = (data?.candidates || []).reduce((a, c) => a + (c.votes || 0), 0)

    return (
        <div className="w-full min-w-0">
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="text-sm font-black" style={{ color: colors.textPrimary }}>
                        {data?.has_voted ? 'Resultado da votação de hoje' : 'Qual será a foto da comunidade?'}
                    </p>
                    <p className="text-[11px] mt-0.5" style={{ color: colors.textSecondary }}>
                        {data?.has_voted
                            ? 'A mais votada vira a foto à meia-noite.'
                            : 'Escolha a que você mais gosta. O resultado aparece depois do seu voto.'}
                    </p>
                </div>
                <button onClick={onClose} aria-label="Fechar" className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ color: colors.textSecondary, background: `${colors.border}40` }}>
                    <X size={16} />
                </button>
            </div>

            {data === null ? (
                <div className="flex justify-center py-6"><Spinner size={20} color={colors.accent} /></div>
            ) : (
                <>
                    {data.candidates.length > 0 ? (
                        <div className="flex gap-3 overflow-x-auto pt-3 pb-1">
                            {data.candidates.map((c) => {
                                const pct = data.has_voted && total > 0 ? Math.round(((c.votes || 0) / total) * 100) : null
                                return (
                                    <div key={c.id} className="flex-shrink-0 w-28">
                                        <button
                                            onClick={() => vote(c.id)}
                                            disabled={!!busy}
                                            aria-label="Votar nessa foto"
                                            className="relative block w-28 h-28 rounded-2xl overflow-hidden transition hover:scale-[1.03] active:scale-95 disabled:opacity-70"
                                            style={{ border: `2px solid ${c.my_vote ? '#16a34a' : 'transparent'}`, background: `${colors.border}40` }}
                                        >
                                            <img src={c.image_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                                            {c.my_vote && (
                                                <span className="absolute right-1.5 top-1.5 w-6 h-6 rounded-full flex items-center justify-center text-white" style={{ background: '#16a34a' }}>
                                                    <Check size={14} />
                                                </span>
                                            )}
                                            {busy === c.id && (
                                                <span className="absolute inset-0 flex items-center justify-center bg-black/30"><Spinner size={18} color="#fff" /></span>
                                            )}
                                        </button>
                                        <p className="text-[10px] mt-1 truncate" style={{ color: colors.textSecondary }}>
                                            {c.proposer_slug ? `@${c.proposer_slug}` : ''}
                                        </p>
                                        {data.has_voted && (
                                            <>
                                                <div className="h-1.5 rounded-full overflow-hidden mt-0.5" style={{ background: `${colors.border}60` }}>
                                                    <div className="h-full rounded-full" style={{ width: `${pct || 0}%`, background: GRADIENT }} />
                                                </div>
                                                <p className="text-[10px] font-black mt-0.5" style={{ color: colors.textPrimary }}>
                                                    {c.votes || 0} {(c.votes || 0) === 1 ? 'voto' : 'votos'}{pct != null ? ` · ${pct}%` : ''}
                                                </p>
                                            </>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    ) : (
                        <p className="text-xs py-3" style={{ color: colors.textSecondary }}>
                            Ninguém mandou foto hoje. A foto atual continua.
                        </p>
                    )}

                    {!userId ? (
                        <button onClick={onLoginNeeded} className="mt-2 text-xs font-black underline" style={{ color: colors.accent }}>Entre para votar ou enviar uma foto</button>
                    ) : !data.is_member ? (
                        <p className="mt-2 text-[11px]" style={{ color: colors.textSecondary }}>Entre na comunidade para votar ou enviar uma foto.</p>
                    ) : (
                        <>
                            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
                            <button
                                onClick={() => fileRef.current?.click()}
                                disabled={busy === 'upload'}
                                className="mt-2 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-black transition hover:scale-[1.03] disabled:opacity-60"
                                style={{ color: colors.accent, border: `1.5px solid ${colors.accent}` }}
                            >
                                {busy === 'upload' ? <Spinner size={14} color={colors.accent} /> : <ImagePlus size={14} />}
                                Enviar uma foto
                            </button>
                        </>
                    )}
                </>
            )}
        </div>
    )
}
