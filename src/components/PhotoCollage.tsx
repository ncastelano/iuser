// src/components/PhotoCollage.tsx — o quadradinho das fotos de um pedido: divide o MESMO espaço entre as fotos (1, 2, 3 ou 4+ com "+N"), para não ocupar mais lugar quando há muitas.
// Regra do layout em lib/photoCollage.ts. Cada pedaço entra com uma animaçãozinha (escala + fade, um depois do outro; desligada em "reduzir movimento"). O pai decide o que acontece ao tocar.
'use client'

import { photoCollageLayout } from '@/lib/photoCollage'

export default function PhotoCollage({ photos, size = 80, className = '' }: { photos: string[]; size?: number; className?: string }) {
    const { shape, tiles, extra } = photoCollageLayout(photos.length)
    if (tiles === 0) return null
    const grid = shape === 'one' ? '' : shape === 'two' ? 'grid-rows-2' : 'grid-cols-2 grid-rows-2'
    return (
        <span className={`grid gap-[2px] overflow-hidden rounded-2xl ${grid} ${className}`} style={{ width: size, height: size, background: 'rgba(0,0,0,0.35)' }} aria-hidden>
            {photos.slice(0, tiles).map((p, i) => (
                <span key={p + i} className={`iuser-collage-tile relative block overflow-hidden ${shape === 'three' && i === 0 ? 'col-span-2' : ''}`} style={{ animationDelay: `${i * 70}ms` }}>
                    <img src={p} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
                    {shape === 'four' && i === 3 && (
                        <span className="absolute inset-0 flex items-center justify-center text-white font-black text-sm" style={{ background: 'rgba(0,0,0,0.55)' }}>+{extra}</span>
                    )}
                </span>
            ))}
        </span>
    )
}
