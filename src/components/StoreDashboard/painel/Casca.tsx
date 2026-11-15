'use client'

// A moldura das PÁGINAS que abrem a partir do painel da loja da 3.0 (extrato, repasses, apoios, avaliações, digital, agora na loja), no
// desenho do laboratório /painel-teste: voltar + ícone + título presos no alto, conteúdo rolando, rodapé opcional. O destino vai no endereço
// (`?secao=<k>`) por `useSecaoUrl`: o voltar do navegador fecha e o link pode ser aberto direto.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { ForceExpandedContext } from '@/hooks/usePersistedExpanded'
import { URL_CHANGE_EVENT } from '@/lib/urlFocus'

/** `?secao=` no endereço, sem recarregar a página (pushState: o voltar do navegador fecha) */
export function useSecaoUrl<K extends string>(validas: readonly K[]) {
    const [secao, setSecao] = useState<K | null>(null)
    const pushed = useRef(false)
    const ler = useCallback(() => {
        const k = new URLSearchParams(window.location.search).get('secao') as K | null
        return k && validas.includes(k) ? k : null
    }, [validas])
    useEffect(() => {
        setSecao(ler())
        const onPop = () => { pushed.current = false; setSecao(ler()) }
        window.addEventListener('popstate', onPop)
        // aviso da ilha que leva a esta mesma página com outro ?secao= (ex.: "Tito levou a maquininha" → Repasses)
        window.addEventListener(URL_CHANGE_EVENT, onPop)
        return () => { window.removeEventListener('popstate', onPop); window.removeEventListener(URL_CHANGE_EVENT, onPop) }
    }, [ler])
    const abrir = useCallback((k: K) => {
        const q = new URLSearchParams(window.location.search)
        q.set('secao', k)
        const url = `${window.location.pathname}?${q}`
        if (pushed.current) window.history.replaceState(window.history.state, '', url)
        else { window.history.pushState(window.history.state, '', url); pushed.current = true }
        setSecao(k)
    }, [])
    const fechar = useCallback(() => {
        if (pushed.current) { pushed.current = false; window.history.back(); return }
        const q = new URLSearchParams(window.location.search)
        q.delete('secao')
        window.history.replaceState(window.history.state, '', `${window.location.pathname}${q.toString() ? `?${q}` : ''}`)
        setSecao(null)
    }, [])
    return { secao, abrir, fechar }
}

export function PaginaPainel({ titulo, sub, cor, icone, onClose, rodape, children }: {
    titulo: string; sub?: string; cor: string; icone: ReactNode; onClose: () => void; rodape?: ReactNode; children: ReactNode
}) {
    const { colors } = useTheme()
    const [mounted, setMounted] = useState(false)
    useEffect(() => { setMounted(true) }, [])
    if (!mounted) return null
    return createPortal(
        <div className="fixed inset-x-0 z-[60] flex flex-col" style={{ top: 'var(--shell-top, 0px)', bottom: 0, background: colors.background }}>
            <div className="flex-1 overflow-y-auto">
                <div className="max-w-2xl mx-auto">
                    <div className="sticky top-0 z-10 flex items-center gap-2.5 px-4 py-2.5" style={{ background: colors.background, borderBottom: `1px solid ${colors.border}` }}>
                        <button onClick={onClose} aria-label="Voltar" className="w-10 h-10 rounded-full flex items-center justify-center active:scale-90" style={{ border: `1px solid ${colors.border}`, color: colors.textPrimary }}><ArrowLeft size={18} /></button>
                        <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${cor}26`, color: cor }}>{icone}</span>
                        <div className="min-w-0"><p className="text-[16px] font-black leading-tight" style={{ color: colors.textPrimary }}>{titulo}</p>{sub && <p className="text-[11px] truncate" style={{ color: colors.textSecondary }}>{sub}</p>}</div>
                    </div>
                    <div className="px-4 pt-4" style={{ paddingBottom: rodape ? 24 : 'calc(var(--shell-bottom, 0px) + 96px)', color: colors.textPrimary }}>
                        <ForceExpandedContext.Provider value={true}>{children}</ForceExpandedContext.Provider>
                    </div>
                </div>
            </div>
            {rodape && <div className="max-w-2xl w-full mx-auto px-4 pt-3 pb-[calc(14px+env(safe-area-inset-bottom)+var(--staging-banner-h,0px))]" style={{ borderTop: `1px solid ${colors.border}`, background: colors.background }}>{rodape}</div>}
        </div>,
        document.body,
    )
}
