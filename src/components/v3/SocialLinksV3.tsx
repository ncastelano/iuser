// src/components/v3/SocialLinksV3.tsx
//
// Botões de redes sociais (Instagram, YouTube, X, GitHub) no mesmo estilo neutro do WhatsApp e do chat: cápsula com o nome escrito, só o ícone colorido.
// Recebe a lista pronta de `buildSocialLinks` (lib/socialLinks.ts): só aparece botão para a rede que tiver link.
'use client'

import type { SocialKind, SocialLink } from '@/lib/socialLinks'

function SocialIcon({ kind, size = 16 }: { kind: SocialKind; size?: number }) {
    const common = { width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': true } as const
    switch (kind) {
        case 'instagram':
            return (
                <svg {...common} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="5" />
                    <circle cx="12" cy="12" r="4" />
                    <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />
                </svg>
            )
        case 'youtube':
            return (
                <svg {...common} fill="currentColor">
                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                </svg>
            )
        case 'x':
            return (
                <svg {...common} fill="currentColor">
                    <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
                </svg>
            )
        case 'github':
            return (
                <svg {...common} fill="currentColor">
                    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
                </svg>
            )
    }
}

// só o ícone leva a cor da rede (o botão é neutro, igual aos outros contatos); X e GitHub usam a cor do texto do tema
const BRAND: Partial<Record<SocialKind, string>> = {
    instagram: '#e1306c',
    youtube: '#ff0000',
}

export default function SocialLinksV3({ links, colors }: { links: SocialLink[]; colors: any }) {
    if (links.length === 0) return null
    return (
        <div className="mt-2 flex flex-wrap gap-2">
            {links.map((l) => {
                const iconColor = BRAND[l.kind]
                return (
                    <a
                        key={l.kind}
                        href={l.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 min-w-[calc(50%-4px)] h-10 rounded-full text-[12px] font-black flex items-center justify-center gap-1.5 transition active:scale-95"
                        style={{ background: `${colors.border}40`, color: colors.textPrimary }}
                    >
                        <span style={{ color: iconColor ?? colors.textPrimary }} className="flex"><SocialIcon kind={l.kind} size={15} /></span>
                        {l.label}
                    </a>
                )
            })}
        </div>
    )
}
