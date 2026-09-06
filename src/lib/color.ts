// src/lib/color.ts

export interface RgbColor {
    r: number
    g: number
    b: number
}

export function hexToRgb(hex: string): RgbColor {
    const clean = hex.replace('#', '')
    const bigint = parseInt(clean, 16)
    return {
        r: (bigint >> 16) & 255,
        g: (bigint >> 8) & 255,
        b: bigint & 255,
    }
}
