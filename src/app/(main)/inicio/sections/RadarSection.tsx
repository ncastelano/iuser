// src/app/(main)/inicio/sections/RadarSection.tsx
'use client'

import { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Radar as RadarIcon, Navigation } from 'lucide-react'
import { useNavProgressStore } from '@/store/useNavProgressStore'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

interface RadarSectionProps {
    dragHandle?: ReactNode
}

// Banner de destaque pro Radar — antes só existia como botão flutuante
// (continua existindo, não mexi nele); isso aqui é o mesmo atalho com mais
// espaço pra explicar o que é, igual ao banner do /modelodehomepage.
export default function RadarSection({ dragHandle }: RadarSectionProps) {
    const router = useRouter()
    const startNavProgress = useNavProgressStore((s) => s.start)

    return (
        <section>
            {dragHandle && <div className="flex mb-2">{dragHandle}</div>}
            <div
                className="relative rounded-3xl p-6 overflow-hidden"
                style={{ background: 'linear-gradient(135deg, #111827, #1f2937)', boxShadow: '0 8px 32px rgba(0,0,0,0.25)' }}
            >
                {/* Anéis do radar, decorativos */}
                <div className="absolute -right-6 sm:right-6 top-1/2 -translate-y-1/2 pointer-events-none">
                    {[140, 100, 60].map((size, i) => (
                        <div
                            key={size}
                            className="absolute rounded-full border"
                            style={{
                                width: size, height: size,
                                left: -size / 2, top: -size / 2,
                                borderColor: `rgba(249,115,22,${0.35 - i * 0.08})`,
                            }}
                        />
                    ))}
                    <div className="absolute w-3 h-3 rounded-full" style={{ left: -6, top: -6, background: GRADIENT, boxShadow: '0 0 16px #f97316' }} />
                </div>

                <div className="relative z-10 max-w-[75%] sm:max-w-[65%]">
                    <div className="flex items-center gap-2 mb-2">
                        <RadarIcon size={20} color="#f97316" />
                        <span className="text-[10px] font-black uppercase tracking-wider text-white/60">iUser</span>
                    </div>
                    <h3 className="text-xl font-black text-white mb-1.5">Radar</h3>
                    <p className="text-sm text-white/70 mb-4">
                        Veja quem e o que tem perto de você agora — lojas, pessoas e ofertas em tempo real.
                    </p>
                    <button
                        onClick={() => { startNavProgress(); router.push('/radar') }}
                        className="flex items-center gap-1.5 px-5 py-2.5 rounded-full font-bold text-sm text-white transition-all hover:scale-105 active:scale-95"
                        style={{ background: GRADIENT, boxShadow: '0 4px 14px #f9731650' }}
                    >
                        <Navigation size={14} />
                        Abrir radar
                    </button>
                </div>
            </div>
        </section>
    )
}
