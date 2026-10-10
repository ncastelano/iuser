// src/lib/linkify.tsx
//
// Texto de mensagem com links clicáveis (igual ao WhatsApp). extractFirstUrl() acha o primeiro link pra montar o cartão.
import type { ReactNode } from 'react'

const URL_RE = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi

/** Tira pontuação que costuma vir grudada no fim do link ("veja https://x.com/a.") */
function trimUrl(raw: string): { url: string; trailing: string } {
    const m = /[.,;:!?)\]}]+$/.exec(raw)
    if (!m) return { url: raw, trailing: '' }
    return { url: raw.slice(0, m.index), trailing: m[0] }
}

export function toHref(url: string): string {
    return /^https?:\/\//i.test(url) ? url : `https://${url}`
}

export function extractFirstUrl(text: string): string | null {
    URL_RE.lastIndex = 0
    const m = URL_RE.exec(text || '')
    if (!m) return null
    return toHref(trimUrl(m[0]).url)
}

export function linkify(text: string, linkStyle?: React.CSSProperties): ReactNode[] {
    const out: ReactNode[] = []
    let last = 0
    let i = 0
    URL_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = URL_RE.exec(text)) !== null) {
        if (m.index > last) out.push(text.slice(last, m.index))
        const { url, trailing } = trimUrl(m[0])
        out.push(
            <a
                key={`l${i++}`}
                href={toHref(url)}
                target="_blank"
                rel="noopener noreferrer nofollow"
                onClick={(e) => e.stopPropagation()}
                className="underline break-all"
                style={linkStyle}
            >
                {url}
            </a>
        )
        if (trailing) out.push(trailing)
        last = m.index + m[0].length
    }
    if (last < text.length) out.push(text.slice(last))
    return out
}
