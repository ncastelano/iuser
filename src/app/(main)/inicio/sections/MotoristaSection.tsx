// src/app/(main)/inicio/sections/MotoristaSection.tsx

import { ReactNode } from 'react'
import { ChevronRight, Route } from 'lucide-react'

interface MotoristaSectionProps {
    dragHandle?: ReactNode
}

export default function MotoristaSection({
    dragHandle,
}: MotoristaSectionProps) {
    return (
        <section>
            {/* HEADER PADRONIZADO */}
            <div className="flex items-center gap-2 mb-3">
                {dragHandle}

                <h2 className="text-xl font-black text-white">
                    Motorista
                </h2>
            </div>

            {/* CARD – VIDRO ESCURO */}
            <div
                className="rounded-2xl p-4 flex items-center gap-4 text-white cursor-pointer hover:shadow-lg transition-all"
                style={{
                    background: 'rgba(255, 255, 255, 0.06)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                }}
            >
                <Route className="w-8 h-8 text-yellow-400" />

                <div className="flex-1">
                    <h3 className="font-bold">Dirigir para ganhar</h3>
                    <p className="text-sm opacity-70">Seja um motorista!</p>
                </div>

                <ChevronRight className="w-5 h-5 opacity-50" />
            </div>
        </section>
    )
}