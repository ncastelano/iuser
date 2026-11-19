// src/components/ai/AiAssistantSheet.tsx — a folha da IA do iUser (abre do "O que você procura?" da home).
//
// 1. "Entendendo…" enquanto a IA lê o pedido;  2. o que ela ENTENDEU — o que só abre uma página/busca roda direto; o que MUDA algo
// (cadastrar produto, preço, pausar a loja, ficar online) mostra os detalhes e só acontece no "Confirmar";  3. o resultado, com um atalho.
'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Sparkles, X, Check, ArrowRight, LogIn } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { toast } from '@/lib/toast'
import { Spinner } from '@/components/Spinner'
import { askAi, runPlan, needsConfirm, brl, type AiPlan, type RunResult } from '@/modules/ai-assistant'

const ORANGE = '#f97316'

interface Props {
    text: string | null                     // o pedido (null = fechada)
    loggedIn: boolean
    near?: { lat: number; lng: number } | null
    onClose: () => void
    go: (path: string) => void
    search: (text: string) => void
}

type Stage = { k: 'thinking' } | { k: 'confirm'; plan: AiPlan } | { k: 'running'; plan: AiPlan } | { k: 'done'; result: RunResult } | { k: 'error'; message: string; code?: string }

// o que roda sem perguntar (só abre/procura/lê) e fecha a folha
const DIRECT = new Set(['search', 'go', 'service', 'store_orders', 'ride'])

export default function AiAssistantSheet({ text, loggedIn, near, onClose, go, search }: Props) {
    const { colors } = useTheme()
    const [stage, setStage] = useState<Stage>({ k: 'thinking' })
    const [mounted, setMounted] = useState(false)
    useEffect(() => { setMounted(true) }, [])

    useEffect(() => {
        if (!text) return
        let alive = true
        if (!loggedIn) { setStage({ k: 'error', message: 'Entre na sua conta para pedir à IA do iUser.', code: 'login' }); return }
        setStage({ k: 'thinking' })
        askAi(text).then(async ({ plan, error, code }) => {
            if (!alive) return
            if (!plan) { setStage({ k: 'error', message: error || 'A IA não respondeu.', code }); return }
            if (DIRECT.has(plan.action)) {
                const r = await runPlan(plan, { go, search, near })
                if (!alive) return
                toast.message(r.message)
                onClose()
                return
            }
            if (plan.action === 'answer' || plan.action === 'store_sales') {
                setStage({ k: 'running', plan })
                const r = await runPlan(plan, { go, search, near })
                if (alive) setStage({ k: 'done', result: r })
                return
            }
            setStage(needsConfirm(plan) ? { k: 'confirm', plan } : { k: 'done', result: { ok: true, message: plan.reply } })
        })
        return () => { alive = false }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [text, loggedIn])

    useEffect(() => {
        if (!text) return
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [text, onClose])

    if (!mounted || !text) return null

    const confirm = async (plan: AiPlan) => {
        setStage({ k: 'running', plan })
        const r = await runPlan(plan, { go, search, near })
        setStage({ k: 'done', result: r })
    }

    const row = (label: string, value: string) => (
        <div className="flex items-baseline justify-between gap-3 py-1.5" style={{ borderBottom: `1px solid ${colors.border}55` }}>
            <span className="text-[12.5px]" style={{ color: colors.textSecondary }}>{label}</span>
            <span className="text-[13.5px] font-bold text-right" style={{ color: colors.textPrimary }}>{value}</span>
        </div>
    )

    const details = (p: AiPlan) => {
        switch (p.action) {
            case 'store_open': return <>{row('Loja', p.store.name)}{row('Vai ficar', p.active ? 'No ar' : 'Pausada (ninguém compra até você abrir)')}</>
            case 'product_create': return <>
                {row('Loja', p.store.name)}{row('Produto', p.name)}{row('Preço', brl(p.price))}{p.category && row('Categoria', p.category)}{p.description && row('Descrição', p.description)}
                <p className="text-[11.5px] mt-2" style={{ color: colors.textSecondary }}>Entra no ar sem foto: depois você põe a foto. No plano Pós-pago cada produto cadastrado custa R$ 0,50 (nunca mais que R$ 100 por mês).</p>
            </>
            case 'product_price': return <>{row('Produto', p.product.name)}{row('Preço agora', brl(p.product.price))}{row('Novo preço', brl(p.price))}</>
            case 'product_active': return <>{row('Produto', p.product.name)}{row('Vai ficar', p.active ? 'No ar' : 'Fora do ar')}</>
            case 'driver_online': return <>{row('Modo motorista', p.active ? 'Online (recebe corridas e entregas)' : 'Offline')}</>
            default: return null
        }
    }

    const body = (() => {
        if (stage.k === 'thinking' || stage.k === 'running') return (
            <div className="py-8 flex flex-col items-center gap-3">
                <Spinner size={26} color={ORANGE} />
                <p className="text-[13.5px] font-bold" style={{ color: colors.textSecondary }}>{stage.k === 'thinking' ? 'Entendendo o seu pedido…' : 'Fazendo…'}</p>
            </div>
        )
        if (stage.k === 'error') return (
            <div className="py-3">
                <p className="text-[14px]" style={{ color: colors.textPrimary }}>{stage.message}</p>
                {stage.code === 'login'
                    ? <button onClick={() => { onClose(); go(`/login?redirect=${encodeURIComponent('/')}`) }} className="mt-4 w-full h-12 rounded-full text-[14px] font-black text-white flex items-center justify-center gap-2" style={{ background: ORANGE }}><LogIn size={17} /> Entrar</button>
                    : <button onClick={() => { onClose(); search(text) }} className="mt-4 w-full h-11 rounded-full text-[13.5px] font-black" style={{ background: `${colors.border}40`, color: colors.textPrimary }}>Só procurar "{text.slice(0, 40)}"</button>}
            </div>
        )
        if (stage.k === 'confirm') return (
            <div>
                <p className="text-[15px] font-black leading-snug" style={{ color: colors.textPrimary }}>{stage.plan.reply}</p>
                <div className="mt-3 rounded-2xl px-3.5 py-2" style={{ background: `${colors.border}22`, border: `1px solid ${colors.border}` }}>{details(stage.plan)}</div>
                <button onClick={() => confirm(stage.plan)} className="mt-4 w-full h-12 rounded-full text-[14.5px] font-black text-white flex items-center justify-center gap-2" style={{ background: ORANGE }}><Check size={18} /> Confirmar</button>
                <button onClick={onClose} className="mt-2 w-full h-10 rounded-full text-[13px] font-bold" style={{ color: colors.textSecondary }}>Cancelar</button>
            </div>
        )
        const r = stage.result
        return (
            <div>
                <div className="flex items-start gap-2.5">
                    <span className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: r.ok ? '#16a34a1f' : '#ef44441f', color: r.ok ? '#16a34a' : '#ef4444' }}>{r.ok ? <Check size={16} /> : <X size={16} />}</span>
                    <p className="text-[14.5px] font-bold leading-snug pt-0.5" style={{ color: colors.textPrimary }}>{r.message}</p>
                </div>
                {r.link && <button onClick={() => { onClose(); go(r.link!.path) }} className="mt-4 w-full h-11 rounded-full text-[13.5px] font-black text-white flex items-center justify-center gap-1.5" style={{ background: ORANGE }}>{r.link.label} <ArrowRight size={16} /></button>}
                <button onClick={onClose} className="mt-2 w-full h-10 rounded-full text-[13px] font-bold" style={{ color: colors.textSecondary }}>Fechar</button>
            </div>
        )
    })()

    return createPortal(
        <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="IA do iUser">
            <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={stage.k === 'running' ? undefined : onClose} />
            <div className="relative w-full sm:max-w-md max-h-[86dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-5 pb-[calc(20px+env(safe-area-inset-bottom))]" style={{ background: colors.background, border: `1px solid ${colors.border}` }}>
                <div className="flex items-center gap-2 mb-3 pr-9">
                    <span className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${ORANGE}1f`, color: ORANGE }}><Sparkles size={17} /></span>
                    <div className="min-w-0">
                        <p className="text-[11px] font-black uppercase tracking-wide" style={{ color: ORANGE }}>IA do iUser</p>
                        <p className="text-[12.5px] truncate" style={{ color: colors.textSecondary }}>“{text}”</p>
                    </div>
                </div>
                {stage.k !== 'running' && <button onClick={onClose} aria-label="Fechar" className="absolute top-4 right-4 w-9 h-9 rounded-full flex items-center justify-center" style={{ background: `${colors.border}40`, color: colors.textPrimary }}><X size={17} /></button>}
                {body}
            </div>
        </div>,
        document.body,
    )
}
