// src/lib/printCards.ts — gera os CARTÕES IMPRESSOS como PDF (no próprio aparelho, pdf-lib + qrcode; nada vai a serviço de fora) e baixa o arquivo.
// PDF em vez de janela de impressão: funciona no celular, no app instalado e dá para levar direto à gráfica (janela nova é bloqueada em vários aparelhos).
//   - tableCardsPdf: QR NA MESA da loja (migration 20261130000086), 4 por folha A4, com a logo, o nome, o QR do cardápio e o número da mesa.
//   - creditCardsPdf: CARTÕES DE CRÉDITO do iUser (migration 20261130000085), 8 por folha A4, tamanho de cartão de visita, com o código e o QR.
'use client'

import QRCode from 'qrcode'

const MM = 72 / 25.4
const A4 = { w: 595.28, h: 841.89 }
const hex = (h: string) => { const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255] as const }

async function lib() { return import('pdf-lib') }

function download(bytes: Uint8Array, name: string) {
    const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = name
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

async function qrPng(text: string): Promise<Uint8Array> {
    const data = await QRCode.toDataURL(text, { margin: 0, width: 600 })
    const b = atob(data.split(',')[1]); const out = new Uint8Array(b.length)
    for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i)
    return out
}

/** caminho SVG de um retângulo com cantos arredondados (o pdf-lib não tem cantos arredondados) */
const rounded = (w: number, h: number, r: number) =>
    `M ${r} 0 L ${w - r} 0 Q ${w} 0 ${w} ${r} L ${w} ${h - r} Q ${w} ${h} ${w - r} ${h} L ${r} ${h} Q 0 ${h} 0 ${h - r} L 0 ${r} Q 0 0 ${r} 0 Z`

/** quebra o texto em linhas que cabem na largura */
function wrap(text: string, font: any, size: number, width: number): string[] {
    const out: string[] = []; let line = ''
    for (const w of text.split(' ')) {
        const t = line ? `${line} ${w}` : w
        if (font.widthOfTextAtSize(t, size) > width && line) { out.push(line); line = w } else line = t
    }
    if (line) out.push(line)
    return out
}

export async function tableCardsPdf(opts: { storeName: string; logoUrl: string | null; items: { label: string; url: string }[] }) {
    const { PDFDocument, StandardFonts, rgb } = await lib()
    const doc = await PDFDocument.create()
    const bold = await doc.embedFont(StandardFonts.HelveticaBold)
    const reg = await doc.embedFont(StandardFonts.Helvetica)
    const orange = rgb(...hex('#f97316'))
    let logo: any = null
    if (opts.logoUrl) {
        try {
            const bytes = new Uint8Array(await (await fetch(opts.logoUrl)).arrayBuffer())
            const isPng = bytes[0] === 0x89 && bytes[1] === 0x50
            const isJpg = bytes[0] === 0xff && bytes[1] === 0xd8
            logo = isPng ? await doc.embedPng(bytes) : isJpg ? await doc.embedJpg(bytes) : null   // webp/avif: sem logo, vai a inicial
        } catch { logo = null }
    }
    const W = 95 * MM, H = 135 * MM, gap = 6 * MM
    const x0 = (A4.w - (2 * W + gap)) / 2, y0 = (A4.h - (2 * H + gap)) / 2
    let page: any = null
    for (let i = 0; i < opts.items.length; i++) {
        if (i % 4 === 0) page = doc.addPage([A4.w, A4.h])
        const col = i % 2, row = Math.floor((i % 4) / 2)
        const x = x0 + col * (W + gap), top = A4.h - y0 - row * (H + gap)
        page.drawSvgPath(rounded(W, H, 5 * MM), { x, y: top, borderColor: orange, borderWidth: 1.6 })
        const cx = x + W / 2
        let y = top - 8 * MM
        const L = 22 * MM
        if (logo) {
            const s = Math.min(L / logo.width, L / logo.height)
            page.drawImage(logo, { x: cx - (logo.width * s) / 2, y: y - logo.height * s, width: logo.width * s, height: logo.height * s })
        } else {
            page.drawCircle({ x: cx, y: y - L / 2, size: L / 2, color: orange })
            const ch = (opts.storeName.trim()[0] || 'L').toUpperCase()
            page.drawText(ch, { x: cx - bold.widthOfTextAtSize(ch, 22) / 2, y: y - L / 2 - 8, size: 22, font: bold, color: rgb(1, 1, 1) })
        }
        y -= L + 7 * MM
        for (const ln of wrap(opts.storeName, bold, 15, W - 12 * MM).slice(0, 2)) {
            page.drawText(ln, { x: cx - bold.widthOfTextAtSize(ln, 15) / 2, y, size: 15, font: bold }); y -= 17
        }
        const t = 'Veja o cardápio e peça pelo celular'
        page.drawText(t, { x: cx - reg.widthOfTextAtSize(t, 9.5) / 2, y: y - 1, size: 9.5, font: reg, color: rgb(0.27, 0.27, 0.27) })
        const Q = 52 * MM
        const qr = await doc.embedPng(await qrPng(opts.items[i].url))
        y -= 6 * MM + Q
        page.drawImage(qr, { x: cx - Q / 2, y, width: Q, height: Q })
        y -= 9 * MM
        const lab = opts.items[i].label
        page.drawText(lab, { x: cx - bold.widthOfTextAtSize(lab, 17) / 2, y, size: 17, font: bold, color: orange })
        const f = 'Aponte a câmera do celular · pelo iUser, sem baixar nada'
        page.drawText(f, { x: cx - reg.widthOfTextAtSize(f, 7.5) / 2, y: top - H + 6 * MM, size: 7.5, font: reg, color: rgb(0.4, 0.4, 0.4) })
    }
    download(await doc.save(), `qr-mesas-${opts.storeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) || 'loja'}.pdf`)
}

export async function creditCardsPdf(opts: { title: string; value: string; footer: string; codes: { code: string; url: string }[] }) {
    const { PDFDocument, StandardFonts, rgb } = await lib()
    const doc = await PDFDocument.create()
    const bold = await doc.embedFont(StandardFonts.HelveticaBold)
    const reg = await doc.embedFont(StandardFonts.Helvetica)
    const white = rgb(1, 1, 1)
    const W = 85 * MM, H = 55 * MM, gx = 6 * MM, gy = 5 * MM
    const x0 = (A4.w - (2 * W + gx)) / 2, y0 = 12 * MM
    let page: any = null
    for (let i = 0; i < opts.codes.length; i++) {
        if (i % 8 === 0) page = doc.addPage([A4.w, A4.h])
        const col = i % 2, row = Math.floor((i % 8) / 2)
        const x = x0 + col * (W + gx), top = A4.h - y0 - row * (H + gy)
        page.drawSvgPath(rounded(W, H, 4 * MM), { x, y: top, color: rgb(...hex('#f97316')) })
        const pad = 4.5 * MM, Q = 24 * MM
        const qr = await doc.embedPng(await qrPng(opts.codes[i].url))
        page.drawRectangle({ x: x + W - pad - Q - 1.5 * MM, y: top - H / 2 - Q / 2 - 1.5 * MM, width: Q + 3 * MM, height: Q + 3 * MM, color: white })
        page.drawImage(qr, { x: x + W - pad - Q, y: top - H / 2 - Q / 2, width: Q, height: Q })
        const tw = W - 2 * pad - Q - 4 * MM
        let y = top - pad - 11
        page.drawText('iUser', { x: x + pad, y, size: 12, font: bold, color: white }); y -= 25
        page.drawText(opts.value, { x: x + pad, y, size: 23, font: bold, color: white }); y -= 11
        for (const ln of wrap(opts.title, reg, 7.5, tw).slice(0, 3)) { page.drawText(ln, { x: x + pad, y, size: 7.5, font: reg, color: white }); y -= 9 }
        const code = opts.codes[i].code
        const cw = bold.widthOfTextAtSize(code, 10) + 4 * MM
        y -= 6
        page.drawRectangle({ x: x + pad, y: y - 3, width: cw, height: 15, color: white })
        page.drawText(code, { x: x + pad + 2 * MM, y: y + 1, size: 10, font: bold, color: rgb(0.07, 0.07, 0.07) })
        let fy = top - H + pad + 7
        for (const ln of wrap(opts.footer, reg, 6, tw).slice(0, 3).reverse()) { page.drawText(ln, { x: x + pad, y: fy - 7, size: 6, font: reg, color: white }); fy += 7.5 }
    }
    download(await doc.save(), `cartoes-iuser-${opts.codes.length}.pdf`)
}
