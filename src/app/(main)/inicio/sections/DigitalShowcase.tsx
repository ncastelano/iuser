// src/app/(main)/inicio/sections/DigitalShowcase.tsx
//
// "Cursos e produtos digitais" da home 2.0: uma fileira de cartões 16:9 que rola de lado, com a PRÉVIA em vídeo: um cartão por vez ganha vida a cada 3 s e, ao passar o mouse
// (ou segurar o dedo), a prévia toca por até 15 s (DigitalCards). Mostra os produtos digitais ativos que já têm conteúdo, os mais vistos primeiro; "ver digitais" abre
// /digitais. Sem nenhum produto digital a seção some, como as outras vitrines.
'use client'

import { useEffect, useState, ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useNavProgressStore } from '@/store/useNavProgressStore'
import { useTheme } from '@/app/contexts/theme'
import { HomeSectionHeader } from './HomeSectionKit'
import { ViewServicesButton } from './ViewServicesButton'
import DigitalCards from '@/components/digital/DigitalCards'
import { loadDigitalShowcase, type ShowcaseItem } from '@/modules/digital'

export const brl = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n)

export default function DigitalShowcase({ dragHandle }: { dragHandle?: ReactNode }) {
    const router = useRouter()
    const startNavProgress = useNavProgressStore((s) => s.start)
    const { colors } = useTheme()
    const [items, setItems] = useState<ShowcaseItem[] | null>(null)

    useEffect(() => {
        let alive = true
        loadDigitalShowcase(12).then((r) => { if (alive) setItems(r) }).catch(() => { if (alive) setItems([]) })
        return () => { alive = false }
    }, [])

    if (items === null) {
        return (
            <div className="w-full">
                <div className="flex items-center gap-2 mb-4">
                    {dragHandle}
                    <div className="h-6 rounded w-56 animate-pulse" style={{ background: `${colors.border}60` }} />
                </div>
                <div className="flex gap-3 overflow-hidden">
                    {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-[250px] w-[272px] flex-shrink-0 rounded-3xl animate-pulse" style={{ background: `${colors.border}40` }} />)}
                </div>
            </div>
        )
    }
    if (items.length === 0) return null

    return (
        <div className="relative w-full">
            <HomeSectionHeader
                title="Cursos e produtos digitais"
                subtitle="Vídeo-aulas, cursos, playlists e e-books — passe o mouse ou segure para ver a prévia"
                dragHandle={dragHandle}
                action={<ViewServicesButton label="ver digitais" onClick={() => { startNavProgress(); router.push('/digitais') }} />}
            />
            <DigitalCards items={items} layout="strip" />
        </div>
    )
}
