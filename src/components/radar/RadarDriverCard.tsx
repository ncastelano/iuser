// src/components/radar/RadarDriverCard.tsx
//
// Card de um motorista flutuando sobre o mapa do /pedir-motorista (v3): o mesmo cabeçalho e os mesmos detalhes do /radar
// (RadarDriverDetails) e um botão para chamar ESSE motorista. Só apresentação; quem decide o que o botão faz é a tela.
'use client'

import { ChevronRight, MapPin, Star, X } from 'lucide-react'
import RadarDriverDetails from '@/components/radar/RadarDriverDetails'
import type { RadarDriverItem } from '@/lib/radarDrivers'

export default function RadarDriverCard({ driver, distanceKm, primaryLabel, onPrimary, onClose, go }: {
    driver: RadarDriverItem
    distanceKm: number | null
    primaryLabel: string
    onPrimary: () => void
    onClose: () => void
    go: (path: string) => void
}) {
    const distance = distanceKm == null ? null : distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m` : `${distanceKm.toFixed(1).replace('.', ',')} km`
    return (
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden border-2 border-orange-200 flex flex-col max-h-[72%] text-gray-900">
            <button onClick={onClose} aria-label="Fechar" className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-orange-100 hover:bg-orange-500 hover:text-white transition-all z-10 shadow-md">
                <X className="w-4 h-4" />
            </button>
            <div className="overflow-y-auto">
                <div className="p-4 flex items-center gap-4">
                    <div className="w-20 h-20 rounded-full p-[4px] flex-shrink-0" style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)' }}>
                        <div className="relative w-full h-full rounded-full overflow-hidden bg-gradient-to-br from-orange-100 to-red-100 flex items-center justify-center">
                            <span className="text-2xl font-black italic text-orange-400">{driver.name.replace('@', '').charAt(0).toUpperCase()}</span>
                            {(driver.avatarUrl || driver.photoUrl) && <img src={driver.avatarUrl || driver.photoUrl || ''} className="absolute inset-0 w-full h-full object-cover" alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />}
                        </div>
                    </div>
                    <div className="flex-1 min-w-0 space-y-1 pr-8">
                        <h3 className="text-lg font-black text-gray-900 truncate">{driver.name}</h3>
                        <p className="text-xs font-bold text-orange-500 truncate">{driver.model}{driver.color ? ` · ${driver.color}` : ''}</p>
                        <p className="text-[11px] font-bold text-gray-600 truncate flex items-center gap-1">
                            {driver.ratingCount > 0
                                ? <><Star size={11} className="fill-yellow-500 text-yellow-500 flex-shrink-0" /> {Number(driver.rating).toFixed(1).replace('.', ',')} ({driver.ratingCount})</>
                                : 'Novo no iUser'}
                            <span className="text-gray-400">·</span> {driver.rides} {driver.rides === 1 ? 'corrida' : 'corridas'}
                        </p>
                        {distance && (
                            <span className="text-[10px] font-black uppercase text-gray-500 flex items-center gap-1"><MapPin className="w-3 h-3 text-orange-500" />{distance}</span>
                        )}
                    </div>
                </div>
                <RadarDriverDetails item={driver} go={go} />
            </div>
            <div className="p-4 pt-0 flex-shrink-0">
                <button
                    onClick={onPrimary}
                    className="w-full py-3.5 rounded-full bg-gradient-to-r from-orange-500 to-red-500 text-white font-black uppercase text-xs tracking-wider shadow-lg transition-all active:scale-95 flex items-center justify-center gap-1.5"
                >
                    {primaryLabel}
                    <ChevronRight className="w-4 h-4" />
                </button>
            </div>
        </div>
    )
}
