// Pontinhos de uma vitrine paginada (o da página atual é alongado), com a animação de entrada pelos dois lados.
'use client'

import { useTheme } from '@/app/contexts/theme'

export function PageDots({ pages, page, onGo, label = 'Ver página' }: { pages: number; page: number; onGo: (i: number) => void; label?: string }) {
    const { colors } = useTheme()
    if (pages <= 1) return null
    return (
        <div className="flex items-center justify-center gap-1.5 mt-3">
            {Array.from({ length: pages }).map((_, i) => (
                <button
                    key={i}
                    onClick={() => onGo(i)}
                    aria-label={`${label} ${i + 1}`}
                    className="rounded-full transition-all duration-300"
                    style={{ width: i === page ? 20 : 8, height: 8, background: i === page ? '#f97316' : colors.border }}
                />
            ))}
        </div>
    )
}

export const PAGE_SLIDE_CSS = `@keyframes pageInNext { from { opacity: 0; transform: translateX(28px) } to { opacity: 1; transform: none } } @keyframes pageInPrev { from { opacity: 0; transform: translateX(-28px) } to { opacity: 1; transform: none } } .page-in-next { animation: pageInNext .35s ease-out } .page-in-prev { animation: pageInPrev .35s ease-out }`
