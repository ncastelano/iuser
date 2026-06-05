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

                <h2 className="text-xl font-black text-gray-800">
                    Motorista
                </h2>
            </div>

            {/* CARD */}
            <div className="bg-gradient-to-r from-red-500 to-yellow-500 rounded-2xl p-4 flex items-center gap-4 text-white shadow-md cursor-pointer hover:shadow-lg transition-all">
                <Route className="w-8 h-8" />

                <div className="flex-1">
                    <h3 className="font-bold">
                        Dirigir para ganhar
                    </h3>

                    <p className="text-sm opacity-90">
                        Seja um motorista!
                    </p>
                </div>

                <ChevronRight className="w-5 h-5" />
            </div>
        </section>
    )
}