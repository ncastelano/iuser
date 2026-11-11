'use client'

// src/components/digital/PdfReader.tsx — o LEITOR de livro em PDF dentro do app (Editora): a prévia de algumas páginas, ou o livro todo se for
// grátis/da pessoa. Desenha cada página num <canvas> com o pdf.js (o leitor do navegador não funciona no celular: no iPhone mostra só a 1ª
// página e no Android baixa o arquivo). O arquivo vem SEMPRE por link assinado de /api/digital/open — quem decide o acesso é o banco; a prévia
// é um PDF à parte, cortado pelo servidor, então o livro inteiro nunca chega a quem só pode ver a prévia.
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { BookOpen, Loader2, X } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { lockBodyScroll } from '@/lib/bodyScrollLock'

type PdfDoc = { numPages: number; getPage: (n: number) => Promise<any>; destroy: () => Promise<void> }

async function loadPdf(url: string): Promise<PdfDoc> {
    const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs')
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'      // cópia local do worker (public/), sem depender de CDN
    return pdfjs.getDocument({ url, isEvalSupported: false }).promise
}

/** uma página: só desenha quando chega perto da tela (livro grande não trava o celular) */
function Page({ doc, n, width }: { doc: PdfDoc; n: number; width: number }) {
    const box = useRef<HTMLDivElement>(null)
    const canvas = useRef<HTMLCanvasElement>(null)
    const [ratio, setRatio] = useState(1.414)   // A4 até saber a proporção real
    const [drawn, setDrawn] = useState(false)
    useEffect(() => {
        const el = box.current
        if (!el || drawn || !width) return
        const io = new IntersectionObserver(async ([e]) => {
            if (!e.isIntersecting) return
            io.disconnect()
            const page = await doc.getPage(n)
            const v1 = page.getViewport({ scale: 1 })
            setRatio(v1.height / v1.width)
            const dpr = Math.min(2, window.devicePixelRatio || 1)
            const vp = page.getViewport({ scale: (width / v1.width) * dpr })
            const c = canvas.current
            if (!c) return
            c.width = vp.width; c.height = vp.height
            await page.render({ canvasContext: c.getContext('2d')!, viewport: vp }).promise
            setDrawn(true)
        }, { rootMargin: '600px 0px' })
        io.observe(el)
        return () => io.disconnect()
    }, [doc, n, width, drawn])
    return (
        <div ref={box} className="relative bg-white shadow-md rounded-sm overflow-hidden" style={{ width, height: width * ratio }}>
            <canvas ref={canvas} className="w-full h-full block" aria-label={`Página ${n}`} />
            {!drawn && <div className="absolute inset-0 flex items-center justify-center text-[12px] text-gray-400">Página {n}</div>}
        </div>
    )
}

export default function PdfReader({ url, title, subtitle, footer, onClose }: { url: string; title: string; subtitle?: string; footer?: React.ReactNode; onClose: () => void }) {
    const { colors } = useTheme()
    const scroller = useRef<HTMLDivElement>(null)
    const [doc, setDoc] = useState<PdfDoc | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [width, setWidth] = useState(0)
    const [mounted, setMounted] = useState(false)

    useEffect(() => { setMounted(true); return lockBodyScroll() }, [])
    useEffect(() => {
        let alive = true, d: PdfDoc | null = null
        loadPdf(url).then((x) => { d = x; if (alive) setDoc(x); else x.destroy() }).catch(() => alive && setError('Não foi possível abrir o livro.'))
        return () => { alive = false; d?.destroy() }
    }, [url])
    useEffect(() => {
        const el = scroller.current
        if (!el) return
        const ro = new ResizeObserver(() => setWidth(Math.min(820, el.clientWidth - 24)))
        ro.observe(el)
        return () => ro.disconnect()
    }, [mounted])
    useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onClose])

    if (!mounted) return null
    return createPortal(
        <div className="fixed inset-0 z-[130] flex flex-col" style={{ background: colors.background }} role="dialog" aria-label={`Ler ${title}`}>
            <div className="flex items-center gap-2.5 px-3 pt-[calc(10px+env(safe-area-inset-top))] pb-2.5 flex-shrink-0" style={{ borderBottom: `1px solid ${colors.border}` }}>
                <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#8b5cf622', color: '#8b5cf6' }}><BookOpen size={18} /></span>
                <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-black leading-tight truncate" style={{ color: colors.textPrimary }}>{title}</p>
                    <p className="text-[11px] truncate" style={{ color: colors.textSecondary }}>{subtitle || (doc ? `${doc.numPages} páginas` : 'Abrindo…')}</p>
                </div>
                <button onClick={onClose} aria-label="Fechar o livro" className="w-10 h-10 rounded-full flex items-center justify-center" style={{ border: `1px solid ${colors.border}`, color: colors.textPrimary }}><X size={18} /></button>
            </div>
            <div ref={scroller} className="flex-1 overflow-y-auto py-4" style={{ background: `${colors.border}40` }}>
                {error ? <p className="text-center text-[13px] mt-10" style={{ color: colors.textSecondary }}>{error}</p>
                    : !doc || !width ? <div className="flex justify-center mt-16" style={{ color: colors.textSecondary }}><Loader2 className="animate-spin" size={26} /></div>
                    : <div className="flex flex-col items-center gap-3">{Array.from({ length: doc.numPages }, (_, i) => <Page key={i} doc={doc} n={i + 1} width={width} />)}</div>}
            </div>
            {footer && <div className="flex-shrink-0 px-4 pt-3 pb-[calc(14px+env(safe-area-inset-bottom))]" style={{ borderTop: `1px solid ${colors.border}`, background: colors.background }}>{footer}</div>}
        </div>,
        document.body,
    )
}
