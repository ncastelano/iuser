// src/lib/vehicleMarkerIcon.ts
//
// SVG do veículo (carro/moto/bicicleta) usado no marcador "Você" do mapa da
// corrida — os mesmos traços do ícone do Lucide (Car/Motorbike/Bike), só que
// como string crua, porque o marcador do Mapbox GL é um elemento DOM criado
// fora da árvore do React.
import type { VehicleKind } from '@/lib/rideVehicle'

const PATHS: Record<VehicleKind, string> = {
    carro: `
        <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
        <circle cx="7" cy="17" r="2" />
        <path d="M9 17h6" />
        <circle cx="17" cy="17" r="2" />
    `,
    moto: `
        <path d="m18 14-1-3" />
        <path d="m3 9 6 2a2 2 0 0 1 2-2h2a2 2 0 0 1 1.99 1.81" />
        <path d="M8 17h3a1 1 0 0 0 1-1 6 6 0 0 1 6-6 1 1 0 0 0 1-1v-.75A5 5 0 0 0 17 5" />
        <circle cx="19" cy="17" r="3" />
        <circle cx="5" cy="17" r="3" />
    `,
    bicicleta: `
        <circle cx="18.5" cy="17.5" r="3.5" />
        <circle cx="5.5" cy="17.5" r="3.5" />
        <circle cx="15" cy="5" r="1" />
        <path d="M12 17.5V14l-3-3 4-3 2 3h2" />
    `,
}

// Marcador redondo colorido com o ícone do veículo dentro, mais um rótulo
// opcional acima (ex: "Você") — igual ao padrão dos outros marcadores do mapa.
export function vehicleMarkerHtml(kind: VehicleKind, color: string, label?: string): string {
    return `
        <div style="display:flex;flex-direction:column;align-items:center;">
            ${label ? `<div style="background:${color};color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:9999px;margin-bottom:4px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.35);">${label}</div>` : ''}
            <div style="width:30px;height:30px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    ${PATHS[kind]}
                </svg>
            </div>
        </div>
    `
}
