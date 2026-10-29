// src/components/v3/DigitalStrip.tsx
//
// "Cursos e produtos digitais" da home 3.0: a mesma fileira de cartões 16:9 com prévia em vídeo da 2.0 (um cartão por vez a cada 3 s; mouse em cima ou dedo segurado toca até 15 s),
// no cabeçalho das outras vitrines da 3.0. "Ver tudo" abre /digitais. Sem nenhum produto digital, a seção some.
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import DigitalCards from '@/components/digital/DigitalCards'
import { loadDigitalShowcase, type ShowcaseItem } from '@/modules/digital'

const COLOR = '#0ea5e9'

export default function DigitalStrip({ className = 'mt-8' }: { className?: string }) {
    const router = useRouter()
    const { colors } = useTheme()
    const [items, setItems] = useState<ShowcaseItem[] | null>(null)

    useEffect(() => {
        let alive = true
        loadDigitalShowcase(12).then((r) => { if (alive) setItems(r) }).catch(() => { if (alive) setItems([]) })
        return () => { alive = false }
    }, [])

    if (items !== null && items.length === 0) return null
    return (
        <section className={className}>
            <div className="flex items-center gap-3 mb-3">
                <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-black leading-tight truncate" style={{ color: colors.textPrimary }}>Cursos e produtos digitais</h2>
                    <p className="text-xs truncate" style={{ color: colors.textSecondary }}>Aprenda e abra na hora, no celular · segure para ver a prévia</p>
                </div>
                <button onClick={() => router.push('/digitais')} className="flex items-center gap-0.5 text-xs font-black flex-shrink-0 px-3 py-1.5 rounded-full transition hover:scale-105" style={{ color: COLOR, background: `${COLOR}1a` }}>
                    Ver tudo <ChevronRight size={14} />
                </button>
            </div>
            {items === null
                ? <div className="flex gap-3 overflow-hidden -mx-6 px-6">{[0, 1, 2].map((i) => <div key={i} className="h-[250px] w-[272px] flex-shrink-0 rounded-3xl animate-pulse" style={{ background: `${colors.border}40` }} />)}</div>
                : <DigitalCards items={items} layout="strip" />}
        </section>
    )
}
