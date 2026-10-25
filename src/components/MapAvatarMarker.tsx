// src/components/MapAvatarMarker.tsx
//
// Marcador de PESSOA/MOTORISTA nos mapas (/radar e /pedir-motorista): o avatar do perfil, redondo, com borda de cor e — se a pessoa
// equipou uma — o anel de borda que gira em volta (o mesmo do avatar em qualquer lugar do app). Lojas, produtos e serviços continuam
// quadrados. Os marcadores do Mapbox são elementos DOM fora da árvore do React, então aqui se monta uma raiz própria dentro do elemento
// (`mountMapAvatarMarker`); quem cria o marcador deve chamar o `unmount` quando o remover. Sem PlanAvatarRing de propósito: ele depende de
// contextos do app, que não existem nessa raiz; só usa o que é independente (`useAvatarBorder` + `PlanRingFrame`).
'use client'

import { createRoot } from 'react-dom/client'
import { PlanRingFrame, useAvatarBorder } from '@/components/PlanAvatarRing'

export interface MapAvatarMarkerProps {
    userId?: string | null
    imageUrl: string | null
    /** letra/sigla quando não há foto */
    fallbackText: string
    size?: number
    /** cor da borda de baixo (o anel equipado, se houver, gira por fora dela) */
    borderColor?: string
    /** SVG (string) do selo no canto inferior direito, ex: tipo de veículo */
    badgeSvg?: string | null
}

export function MapAvatarMarker({ userId, imageUrl, fallbackText, size = 48, borderColor = '#f97316', badgeSvg }: MapAvatarMarkerProps) {
    const ring = useAvatarBorder(userId)
    const initial = (fallbackText || '?').replace('@', '').charAt(0).toUpperCase()
    const avatar = (
        <span
            className="relative block rounded-full overflow-hidden"
            style={{ width: size, height: size, border: `3px solid ${borderColor}`, background: 'linear-gradient(135deg,#fed7aa,#fecaca)', boxShadow: '0 4px 15px rgba(0,0,0,0.3)' }}
        >
            <span className="absolute inset-0 flex items-center justify-center font-black italic" style={{ color: '#ea580c', fontSize: Math.round(size * 0.38) }}>{initial}</span>
            {imageUrl && <img src={imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />}
        </span>
    )
    return (
        <span className="relative inline-block" style={{ width: size, height: size, lineHeight: 0 }}>
            {ring ? <PlanRingFrame colors={ring} width={2}>{avatar}</PlanRingFrame> : avatar}
            {badgeSvg && (
                <span
                    className="absolute flex items-center justify-center rounded-full bg-white"
                    style={{ right: -4, bottom: -4, width: 22, height: 22, border: `2px solid ${borderColor}`, boxShadow: '0 2px 6px rgba(0,0,0,0.35)' }}
                    dangerouslySetInnerHTML={{ __html: badgeSvg }}
                />
            )}
        </span>
    )
}

/** Monta o marcador dentro de `host` (um elemento DOM do Mapbox) e devolve como desmontar. */
export function mountMapAvatarMarker(host: HTMLElement, props: MapAvatarMarkerProps): () => void {
    const root = createRoot(host)
    root.render(<MapAvatarMarker {...props} />)
    // adia o unmount: o Mapbox pode remover o marcador durante um render do React
    return () => { setTimeout(() => root.unmount(), 0) }
}
