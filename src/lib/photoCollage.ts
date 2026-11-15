// src/lib/photoCollage.ts — como o quadradinho das fotos de um pedido se divide entre elas (regra pura; o desenho está em components/PhotoCollage.tsx).
//   1 foto  → inteira                                  | 2 fotos → uma em cima e uma embaixo
//   3 fotos → uma em cima (larga) e duas embaixo        | 4 ou mais → duas em cima, uma embaixo e, ao lado dela, a 4ª escurecida com o "+N"
// O "+N" conta as fotos que NÃO aparecem inteiras: com 4 fotos é "+1" (a 4ª fica por trás do selo), com 6 é "+3".
export type CollageShape = 'one' | 'two' | 'three' | 'four'
export interface PhotoCollageLayout { shape: CollageShape; tiles: number; extra: number }

export function photoCollageLayout(count: number): PhotoCollageLayout {
    const n = Math.max(0, Math.floor(Number.isFinite(count) ? count : 0))
    if (n <= 1) return { shape: 'one', tiles: n, extra: 0 }
    if (n === 2) return { shape: 'two', tiles: 2, extra: 0 }
    if (n === 3) return { shape: 'three', tiles: 3, extra: 0 }
    return { shape: 'four', tiles: 4, extra: n - 3 }
}
