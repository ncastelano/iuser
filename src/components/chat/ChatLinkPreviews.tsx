// src/components/chat/ChatLinkPreviews.tsx
//
// O que aparece abaixo do texto de uma mensagem de comunidade por causa dos links: link de IMAGEM mostra a imagem; link do iUser
// mostra o cartão do item (loja, perfil, serviço, produto ou publicação). Outros links não geram nada (e nem chegam a ser enviados).
'use client'

import { useEffect, useState } from 'react'
import ShareCardView from './ShareCardView'
import { fetchRequestCard, fetchShareCards, type ShareCard } from '@/lib/shareCards'
import { isImageUrl, iuserTarget, resolveIuserLink, urlsIn } from '@/lib/chatLinks'

function IuserCard({ path, request, colors, compact }: { path: string; request: string | null; colors: any; compact: boolean }) {
    const [card, setCard] = useState<ShareCard | null>(null)
    useEffect(() => {
        let alive = true
        if (request) {   // /procurar-servico?pedido=<id>
            fetchRequestCard(request).then((c) => { if (alive) setCard(c) }, () => {})
            return () => { alive = false }
        }
        resolveIuserLink(path).then(async (r) => {
            if (!r || !alive) return
            const key = r.kind === 'store' ? { ref_store_id: r.id } : r.kind === 'profile' ? { ref_profile_id: r.id } : { ref_product_id: r.id }
            const cards = await fetchShareCards([key])
            if (alive) setCard(Object.values(cards)[0] || null)
        })
        return () => { alive = false }
    }, [path, request])
    if (!card) return null
    return (
        <div className="w-full max-w-[320px] rounded-2xl overflow-hidden pt-2" style={{ background: colors.surface, border: `1px solid ${colors.border}`, color: colors.textPrimary }}>
            <ShareCardView card={card} colors={colors} compact={compact} />
        </div>
    )
}

export default function ChatLinkPreviews({ content, colors, compact = false, max = 3 }: { content: string; colors: any; compact?: boolean; max?: number }) {
    const urls = urlsIn(content).slice(0, max)
    const [broken, setBroken] = useState<Record<string, boolean>>({})
    if (urls.length === 0) return null
    return (
        <>
            {urls.map((u) => {
                if (isImageUrl(u)) {
                    if (broken[u]) return null
                    return (
                        <a key={u} href={u} target="_blank" rel="noopener noreferrer nofollow" className="block max-w-[320px]">
                            <img src={u} alt="Imagem enviada" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken((b) => ({ ...b, [u]: true }))}
                                className={`rounded-2xl w-full object-cover ${compact ? 'max-h-40' : 'max-h-72'}`} style={{ border: `1px solid ${colors.border}` }} />
                        </a>
                    )
                }
                const t = iuserTarget(u)
                const request = t && t.path === '/procurar-servico' ? (t.search.get('ver') || t.search.get('pedido')) : null
                return t ? <IuserCard key={u} path={t.path} request={request} colors={colors} compact={compact} /> : null
            })}
        </>
    )
}
