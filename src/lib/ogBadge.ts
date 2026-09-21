// src/lib/ogBadge.ts
// Server-only: carimba a logo pequena do iUser no canto inferior direito de
// toda miniatura de prévia de link (assinatura da marca, igual em todos os links).
import sharp from 'sharp'
import { readFile } from 'fs/promises'
import path from 'path'

const LOGO_SIZE = 40
const RING = 4
const BADGE_SIZE = LOGO_SIZE + RING * 2
const MARGIN = 6

let badgeCache: Buffer | null = null

async function getBadge(): Promise<Buffer> {
    if (badgeCache) return badgeCache
    const logo = await sharp(await readFile(path.join(process.cwd(), 'public', 'android-chrome-192x192.png')))
        .resize(LOGO_SIZE, LOGO_SIZE)
        .png()
        .toBuffer()
    const ring = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${BADGE_SIZE}" height="${BADGE_SIZE}"><circle cx="${BADGE_SIZE / 2}" cy="${BADGE_SIZE / 2}" r="${BADGE_SIZE / 2}" fill="#ffffff"/></svg>`
    )
    badgeCache = await sharp(ring).composite([{ input: logo, left: RING, top: RING }]).png().toBuffer()
    return badgeCache
}

export async function addLogoBadge(image: Buffer, size: number): Promise<Buffer> {
    const badge = await getBadge()
    return sharp(image)
        .composite([{ input: badge, left: size - BADGE_SIZE - MARGIN, top: size - BADGE_SIZE - MARGIN }])
        .png()
        .toBuffer()
}
