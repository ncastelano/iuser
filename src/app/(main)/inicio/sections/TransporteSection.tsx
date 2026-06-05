// src/app/(main)/inicio/sections/TransporteSection.tsx

import { ReactNode } from 'react'
import { ChevronRight, MapPinned } from 'lucide-react'

interface TransporteSectionProps {
    dragHandle?: ReactNode
}

export default function TransporteSection({
    dragHandle,
}: TransporteSectionProps) {
    return (
        <section>

            {/* HEADER PADRONIZADO */}
            <div className="flex items-center gap-2 mb-3">
                {dragHandle}

                <h2 className="text-xl font-black text-gray-800">
                    Transporte
                </h2>
            </div>

            {/* CARD */}
            <div className="bg-gradient-to-r from-blue-600 to-cyan-500 rounded-2xl p-4 flex items-center gap-4 text-white shadow-md cursor-pointer hover:shadow-lg transition-all">
                <MapPinned className="w-8 h-8" />

                <div className="flex-1">
                    <h3 className="font-bold">
                        Ir para algum lugar
                    </h3>

                    <p className="text-sm opacity-90">
                        Encontre seu motorista!
                    </p>
                </div>

                <ChevronRight className="w-5 h-5" />
            </div>
        </section>
    )
}