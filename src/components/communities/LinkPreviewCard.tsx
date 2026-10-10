// src/components/communities/LinkPreviewCard.tsx
//
// Cartão de link no estilo do WhatsApp: imagem, site, título e descrição. Busca os dados em /api/link-preview e guarda
// o resultado no aparelho durante a sessão. Se a página não tiver o que mostrar, o cartão simplesmente não aparece.
'use client'

import { useEffect, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'

interface Preview { url: string; title: string | null; description: string | null; image: string | null; siteName: string | null; domain: string }

const memory = new Map<string, Preview | null>()
const inflight = new Map<string, Promise<Preview | null>>()

function load(url: string): Promise<Preview | null> {
    if (memory.has(url)) return Promise.resolve(memory.get(url) || null)
    const running = inflight.get(url)
    if (running) return running
    const p = fetch(`/api/link-preview?url=${encodeURIComponent(url)}`)
        .then((r) => (r.ok ? r.json() : { preview: null }))
        .then((j) => (j.preview as Preview | null) || null)
        .catch(() => null)
        .then((v) => { memory.set(url, v); inflight.delete(url); return v })
    inflight.set(url, p)
    return p
}

export default function LinkPreviewCard({ url, compact = false }: { url: string; compact?: boolean }) {
    const { colors } = useTheme()
    const [preview, setPreview] = useState<Preview | null | undefined>(memory.has(url) ? memory.get(url) : undefined)

    useEffect(() => {
        let cancelled = false
        load(url).then((v) => { if (!cancelled) setPreview(v) })
        return () => { cancelled = true }
    }, [url])

    if (!preview) return null

    return (
        <a
            href={preview.url || url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            onClick={(e) => e.stopPropagation()}
            className="block rounded-xl overflow-hidden border text-left transition hover:opacity-90"
            style={{ background: `${colors.border}25`, borderColor: colors.border, color: colors.textPrimary }}
        >
            {preview.image && !compact && (
                <img src={preview.image} alt="" className="w-full max-h-44 object-cover" loading="lazy" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
            )}
            <div className="px-3 py-2 flex items-start gap-2.5">
                {preview.image && compact && (
                    <img src={preview.image} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" loading="lazy" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                )}
                <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold uppercase tracking-wide truncate flex items-center gap-1" style={{ color: colors.textSecondary }}>
                        <ExternalLink size={10} className="flex-shrink-0" />
                        {preview.siteName || preview.domain}
                    </p>
                    {preview.title && <p className="text-sm font-black leading-snug line-clamp-2">{preview.title}</p>}
                    {preview.description && <p className="text-xs leading-snug line-clamp-2 mt-0.5" style={{ color: colors.textSecondary }}>{preview.description}</p>}
                </div>
            </div>
        </a>
    )
}
