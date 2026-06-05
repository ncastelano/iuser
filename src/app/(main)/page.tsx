// src/app/(main)/inicio/page.tsx

'use client'

import { useState } from 'react'

import AnimatedBackground from '@/components/AnimatedBackground'

import { Search } from 'lucide-react'

import {
    DndContext,
    closestCenter,
    DragEndEvent,
} from '@dnd-kit/core'

import {
    SortableContext,
    verticalListSortingStrategy,
    arrayMove,
} from '@dnd-kit/sortable'

import CategoriasSection from './inicio/sections/CategoriasSection'
import TransporteSection from './inicio/sections/TransporteSection'
import MotoristaSection from './inicio/sections/MotoristaSection'
import PromocoesSection from './inicio/sections/PromocoesSection'
import AgendamentosSection from './inicio/sections/AgendamentosSection'
import SortableSection from './inicio/sections/SortableSection'


export default function HomePage() {
    const [sections, setSections] = useState([
        'categorias',
        'transporte',
        'motorista',
        'promocoes',
        'agendamentos',
    ])

    function handleDragEnd(event: DragEndEvent) {
        const { active, over } = event

        if (!over || active.id === over.id) return

        setSections((items) => {
            const oldIndex = items.indexOf(active.id as string)
            const newIndex = items.indexOf(over.id as string)

            return arrayMove(items, oldIndex, newIndex)
        })
    }

    const renderSection = (sectionId: string) => {
        switch (sectionId) {
            case 'categorias':
                return <CategoriasSection />

            case 'transporte':
                return <TransporteSection />

            case 'motorista':
                return <MotoristaSection />

            case 'promocoes':
                return <PromocoesSection />

            case 'agendamentos':
                return <AgendamentosSection />

            default:
                return null
        }
    }

    return (
        <div className="relative min-h-screen">
            {/* Fundo */}
            <div className="fixed inset-0 z-0">
                <AnimatedBackground />
            </div>

            {/* Conteúdo */}
            <main className="relative z-10 min-h-screen pb-24">
                <div className="w-full max-w-7xl mx-auto px-4 md:px-6 lg:px-8">
                    {/* Header */}
                    <header className="sticky top-0 z-20 pt-4 pb-2">
                        <div className="flex items-center gap-3 rounded-2xl bg-white/90 backdrop-blur-lg border border-white/40 shadow-lg p-2">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center shadow-md shrink-0">
                                <img
                                    src="/logo.png"
                                    alt="iUser"
                                    className="w-6 h-6 object-contain rounded-full"
                                />
                            </div>

                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />

                                <input
                                    type="text"
                                    placeholder="Buscar restaurantes, mercados..."
                                    className="w-full pl-9 pr-4 py-2.5 bg-white/50 backdrop-blur-sm border border-gray-200/50 rounded-xl text-sm placeholder:text-gray-400 focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/30 transition-all"
                                />
                            </div>
                        </div>
                    </header>

                    {/* Seções Arrastáveis */}
                    <DndContext
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                    >
                        <SortableContext
                            items={sections}
                            strategy={verticalListSortingStrategy}
                        >
                            <div className="space-y-6 mt-6">
                                {sections.map((sectionId) => {
                                    const section =
                                        renderSection(sectionId)

                                    if (!section) return null

                                    return (
                                        <SortableSection
                                            key={sectionId}
                                            id={sectionId}
                                        >
                                            {section}
                                        </SortableSection>
                                    )
                                })}
                            </div>
                        </SortableContext>
                    </DndContext>
                </div>
            </main>
        </div>
    )
}