// src/components/v3/LinkLinesV3.tsx
//
// Linhas de links clicáveis (WhatsApp, Instagram, YouTube, X, GitHub...) em texto simples, uma por linha, logo abaixo da descrição.
// Discretas de propósito: podem ser várias sem tirar a atenção das ações principais (Comprar / Falar com a loja).
// Só aparece linha de quem tiver link; a lista chega pronta (WhatsApp vindo da página + `buildSocialLinks`).
'use client'

import { MessageCircle } from 'lucide-react'
import { SocialIcon } from './SocialLinksV3'
import type { SocialKind } from '@/lib/socialLinks'

export interface LinkLine { kind: SocialKind | 'whatsapp'; label: string; url: string }

const ICON_COLOR: Partial<Record<LinkLine['kind'], string>> = {
    whatsapp: '#16a34a',
    instagram: '#e1306c',
    youtube: '#ff0000',
}

export default function LinkLinesV3({ lines, colors }: { lines: LinkLine[]; colors: any }) {
    if (lines.length === 0) return null
    return (
        <div className="mt-2 flex flex-col items-start gap-1">
            {lines.map((l) => (
                <a
                    key={l.kind}
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 py-0.5 text-[13px] font-bold underline-offset-2 hover:underline active:opacity-70"
                    style={{ color: colors.textPrimary }}
                >
                    <span className="flex flex-shrink-0" style={{ color: ICON_COLOR[l.kind] ?? colors.textPrimary }}>
                        {l.kind === 'whatsapp' ? <MessageCircle size={15} /> : <SocialIcon kind={l.kind} size={15} />}
                    </span>
                    {l.label}
                </a>
            ))}
        </div>
    )
}
