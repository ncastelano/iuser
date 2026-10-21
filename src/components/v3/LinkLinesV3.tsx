// src/components/v3/LinkLinesV3.tsx
//
// Linhas de links clicáveis em texto simples, uma por linha, logo abaixo da descrição: mesma fonte e cor da descrição, só sublinhadas
// e sem ícone. Discretas de propósito: podem ser várias sem tirar a atenção das ações. Cada linha é um texto + um endereço
// (WhatsApp, links que a loja cadastrou...). Só aparece linha de quem tiver link.
'use client'

export interface LinkLine { label: string; url: string }

export default function LinkLinesV3({ lines, colors, inline = false }: { lines: LinkLine[]; colors: any; /** todos na mesma linha (quebra só se não couber), em vez de um por linha */ inline?: boolean }) {
    if (lines.length === 0) return null
    return (
        <div className={inline ? 'mt-1 flex flex-wrap items-center gap-x-3' : 'mt-1 flex flex-col items-start'}>
            {lines.map((l, i) => (
                <a
                    key={`${i}-${l.url}`}
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="text-[13px] leading-relaxed underline underline-offset-2 active:opacity-70 max-w-full break-words"
                    style={{ color: colors.textSecondary }}
                >
                    {l.label}
                </a>
            ))}
        </div>
    )
}
