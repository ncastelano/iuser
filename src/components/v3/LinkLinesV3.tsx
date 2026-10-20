// src/components/v3/LinkLinesV3.tsx
//
// Linhas de links clicáveis (WhatsApp, Instagram, YouTube, X, GitHub...) em texto simples, uma por linha, logo abaixo da descrição:
// mesma fonte e cor da descrição, só sublinhadas e sem ícone. Discretas de propósito: podem ser várias sem tirar a atenção das ações.
// Só aparece linha de quem tiver link; a lista chega pronta (WhatsApp vindo da página + `buildSocialLinks`).
'use client'

import type { SocialKind } from '@/lib/socialLinks'

export interface LinkLine { kind: SocialKind | 'whatsapp'; label: string; url: string }

export default function LinkLinesV3({ lines, colors }: { lines: LinkLine[]; colors: any }) {
    if (lines.length === 0) return null
    return (
        <div className="mt-1 flex flex-col items-start">
            {lines.map((l) => (
                <a
                    key={l.kind}
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[13px] leading-relaxed underline underline-offset-2 active:opacity-70"
                    style={{ color: colors.textSecondary }}
                >
                    {l.label}
                </a>
            ))}
        </div>
    )
}
