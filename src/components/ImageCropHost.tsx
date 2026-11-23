// components/ImageCropHost.tsx — a janela de RECORTE da foto do perfil e do logo da loja (ver lib/imageCrop.ts). Quadrado de 1:1:
// arrastar move, o controle (ou a roda do mouse / pinça) aproxima. Sai um JPEG/PNG de até 1024 px, que segue o caminho de envio de sempre.
'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Crop, ZoomIn, ZoomOut } from 'lucide-react'
import { registerCropHost, type CropRequest } from '@/lib/imageCrop'

const VIEW = 280

export default function ImageCropHost() {
    const [req, setReq] = useState<CropRequest | null>(null)
    const [url, setUrl] = useState<string | null>(null)
    const [nat, setNat] = useState<{ w: number; h: number } | null>(null)
    const [zoom, setZoom] = useState(1)
    const [pos, setPos] = useState<{ x: number; y: number } | null>(null)   // null = centrada
    const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null)
    const pinch = useRef<{ d: number; z: number } | null>(null)

    useEffect(() => { registerCropHost((r) => setReq(r)); return () => registerCropHost(null) }, [])
    useEffect(() => {
        if (!req) return
        const u = URL.createObjectURL(req.file)
        setUrl(u); setZoom(1); setPos(null); setNat(null)
        const img = new Image()
        img.onload = () => setNat({ w: img.naturalWidth, h: img.naturalHeight })
        img.onerror = () => { req.resolve(req.file); setReq(null) }
        img.src = u
        return () => URL.revokeObjectURL(u)
    }, [req])

    if (!req || !url) return null
    const base = nat ? VIEW / Math.min(nat.w, nat.h) : 1           // escala que faz o lado menor cobrir o quadro
    const w = nat ? nat.w * base * zoom : VIEW, h = nat ? nat.h * base * zoom : VIEW
    const clamp = (x: number, y: number) => ({ x: Math.min(0, Math.max(VIEW - w, x)), y: Math.min(0, Math.max(VIEW - h, y)) })
    // posição centrada por padrão
    const cur = pos ? clamp(pos.x, pos.y) : clamp((VIEW - w) / 2, (VIEW - h) / 2)
    const setZoomKeep = (z: number) => {
        const nz = Math.min(4, Math.max(1, z))
        const cx = (VIEW / 2 - cur.x) / w, cy = (VIEW / 2 - cur.y) / h   // mantém o centro
        const nw = nat ? nat.w * base * nz : VIEW, nh = nat ? nat.h * base * nz : VIEW
        setZoom(nz)
        setPos({ x: Math.min(0, Math.max(VIEW - nw, VIEW / 2 - cx * nw)), y: Math.min(0, Math.max(VIEW - nh, VIEW / 2 - cy * nh)) })
    }

    const done = async (crop: boolean) => {
        const r = req
        if (!crop || !nat) { r.resolve(r.file); setReq(null); return }
        const scale = 1 / (base * zoom)                                   // px da tela → px da foto
        const sx = -cur.x * scale, sy = -cur.y * scale, sSize = VIEW * scale
        const out = Math.min(1024, Math.round(sSize))
        const canvas = document.createElement('canvas')
        canvas.width = out; canvas.height = out
        const ctx = canvas.getContext('2d')
        const img = new Image(); img.src = url
        await img.decode().catch(() => {})
        if (!ctx) { r.resolve(r.file); setReq(null); return }
        ctx.drawImage(img, sx, sy, sSize, sSize, 0, 0, out, out)
        const type = r.file.type === 'image/png' ? 'image/png' : 'image/jpeg'
        canvas.toBlob((b) => { r.resolve(b ? new File([b], (r.file as File).name?.replace(/\.\w+$/, type === 'image/png' ? '.png' : '.jpg') || 'foto.jpg', { type }) : r.file); setReq(null) }, type, 0.9)
    }

    return createPortal(
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
            <div className="w-full max-w-sm rounded-3xl bg-white text-gray-900 p-4 shadow-2xl">
                <p className="flex items-center gap-2 text-[15px] font-black"><Crop size={17} className="text-orange-500" /> Ajuste a foto</p>
                <p className="text-[12px] text-gray-500 mt-0.5">Arraste para escolher a parte que aparece e use o controle para aproximar.</p>
                <div
                    className="relative mx-auto mt-3 overflow-hidden touch-none select-none cursor-grab active:cursor-grabbing bg-gray-100"
                    style={{ width: VIEW, height: VIEW, borderRadius: 16 }}
                    onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, px: cur.x, py: cur.y } }}
                    onPointerMove={(e) => { const d = drag.current; if (!d || pinch.current) return; setPos(clamp(d.px + e.clientX - d.x, d.py + e.clientY - d.y)) }}
                    onPointerUp={() => { drag.current = null }}
                    onWheel={(e) => setZoomKeep(zoom * (e.deltaY < 0 ? 1.08 : 0.92))}
                    onTouchStart={(e) => { if (e.touches.length === 2) { const [a, b] = [e.touches[0], e.touches[1]]; pinch.current = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), z: zoom } } }}
                    onTouchMove={(e) => { if (e.touches.length === 2 && pinch.current) { const [a, b] = [e.touches[0], e.touches[1]]; setZoomKeep(pinch.current.z * Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) / pinch.current.d) } }}
                    onTouchEnd={() => { pinch.current = null }}
                >
                    <img src={url} alt="" draggable={false} className="absolute max-w-none pointer-events-none" style={{ left: cur.x, top: cur.y, width: w, height: h }} />
                    {/* a moldura: círculo (foto do perfil) ou quadrado arredondado (logo) */}
                    <span aria-hidden className="absolute inset-0 pointer-events-none" style={{ borderRadius: req.round ? '50%' : 16, boxShadow: `0 0 0 9999px rgba(0,0,0,0.45)`, border: '2px solid #fff' }} />
                </div>
                <div className="mt-3 flex items-center gap-2">
                    <ZoomOut size={16} className="text-gray-500" />
                    <input type="range" min={1} max={4} step={0.01} value={zoom} onChange={(e) => setZoomKeep(Number(e.target.value))} className="flex-1" style={{ accentColor: '#f97316' }} aria-label="Aproximar" />
                    <ZoomIn size={16} className="text-gray-500" />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                    <button onClick={() => done(false)} className="h-11 rounded-full text-[13px] font-black bg-gray-100">Usar sem recortar</button>
                    <button onClick={() => done(true)} className="h-11 rounded-full text-[13px] font-black text-white" style={{ background: '#f97316' }}>Usar esta foto</button>
                </div>
            </div>
        </div>,
        document.body,
    )
}
