// src/components/dev/ScreenDirector.tsx
//
// "DIRETOR DE TELA" — SÓ no ambiente LOCAL de desenvolvimento e SÓ dentro de um quadro da página /tres-telas. Recebe comandos (postMessage) da página-mãe e age no app como
// uma pessoa: mostra um cursor que anda até o botão, faz o toque (ondinha), rola a página devagar, digita letra por letra e narra o que está fazendo numa etiqueta.
// Nada daqui existe em produção/staging: `isLocalDevOnly()` desliga tudo e o componente nem renderiza fora de um iframe.
'use client'

import { useEffect, useRef, useState } from 'react'
import { isLocalDevOnly } from '@/lib/devOnly'

export interface DirTarget { text?: string; selector?: string; nth?: number; exact?: boolean; within?: string }
export type DirCmd =
    | { op: 'goto'; path: string }
    | { op: 'click'; target: DirTarget; noScroll?: boolean }
    | { op: 'move'; target: DirTarget }
    | { op: 'type'; target: DirTarget; text: string }
    | { op: 'scroll'; by?: number; to?: 'top' | 'bottom'; ms?: number }
    | { op: 'has'; target: DirTarget }
    | { op: 'count'; target: DirTarget }
    | { op: 'text' }
    | { op: 'list' }
    | { op: 'caption'; text: string | null }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const visible = (el: Element) => {
    const r = (el as HTMLElement).getBoundingClientRect()
    if (r.width < 2 || r.height < 2) return false
    const st = getComputedStyle(el as HTMLElement)
    return st.visibility !== 'hidden' && st.display !== 'none' && Number(st.opacity) > 0.05
}
const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase()

/** Acha o elemento: por seletor, ou pelo MENOR elemento visível que contém o texto (e sobe até o botão/link clicável) */
export function findTarget(t: DirTarget, clickable = false): HTMLElement | null {
    const root: ParentNode = t.within ? (document.querySelector(t.within) || document) : document
    let list: HTMLElement[] = []
    if (t.selector && !t.text) list = Array.from(root.querySelectorAll<HTMLElement>(t.selector)).filter(visible)
    else if (t.text) {
        const want = norm(t.text)
        const pool = Array.from(root.querySelectorAll<HTMLElement>(t.selector || 'button, a, [role=button], [role=tab], input, textarea, label, h1, h2, h3, h4, p, span, div, li')).filter(visible)
        const hit = pool.filter((el) => {
            const own = norm((el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('placeholder') || '') + ' ' + (el.textContent || ''))
            return t.exact ? norm(el.textContent || '') === want || norm(el.getAttribute('aria-label') || '') === want || norm(el.getAttribute('placeholder') || '') === want : own.includes(want)
        })
        // o mais fundo (nenhum filho também casa)
        list = hit.filter((el) => !hit.some((o) => o !== el && el.contains(o)))
    }
    let el = list[t.nth ?? 0] || null
    if (el && clickable) el = (el.closest('button, a, [role=button], [role=tab], label, [onclick]') as HTMLElement) || el
    return el
}

function scroller(): HTMLElement | Window {
    const se = document.scrollingElement as HTMLElement
    if (se && se.scrollHeight > se.clientHeight + 4) return window
    let best: HTMLElement | null = null, area = 0
    document.querySelectorAll<HTMLElement>('div, main, section').forEach((el) => {
        const st = getComputedStyle(el)
        if (!/(auto|scroll)/.test(st.overflowY) || el.scrollHeight <= el.clientHeight + 4) return
        const a = el.clientWidth * el.clientHeight
        if (a > area) { area = a; best = el }
    })
    return best || window
}

async function smoothScroll(by: number, ms: number) {
    const sc = scroller()
    const get = () => (sc === window ? window.scrollY : (sc as HTMLElement).scrollTop)
    const set = (v: number) => (sc === window ? window.scrollTo(0, v) : ((sc as HTMLElement).scrollTop = v))
    const from = get(), to = from + by, t0 = performance.now()
    await new Promise<void>((done) => {
        const step = (now: number) => {
            const k = Math.min(1, (now - t0) / ms)
            set(from + (to - from) * (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2))
            k < 1 ? requestAnimationFrame(step) : done()
        }
        requestAnimationFrame(step)
    })
}

export default function ScreenDirector() {
    const [on, setOn] = useState(false)
    const [cur, setCur] = useState({ x: 200, y: 400, down: false })
    const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([])
    const [caption, setCaption] = useState<string | null>(null)
    const pos = useRef({ x: 200, y: 400 })

    useEffect(() => {
        if (!isLocalDevOnly() || window.parent === window) return
        setOn(true)
        const reply = (id: number, ok: boolean, value?: any, error?: string) => window.parent.postMessage({ dir: 'res', id, ok, value, error }, '*')
        const moveTo = async (x: number, y: number) => {
            pos.current = { x, y }
            setCur((c) => ({ ...c, x, y }))
            await sleep(650)
        }
        const toEl = async (el: HTMLElement, noScroll?: boolean) => {
            if (!noScroll) {
                const r = el.getBoundingClientRect()
                if (r.top < 90 || r.bottom > window.innerHeight - 110) {
                    const sc = scroller()
                    const base = sc === window ? 0 : (sc as HTMLElement).getBoundingClientRect().top
                    await smoothScroll(r.top - base - window.innerHeight / 2 + r.height / 2, 600)
                    await sleep(120)
                }
            }
            const r = el.getBoundingClientRect()
            await moveTo(r.left + r.width / 2 + (Math.random() * 6 - 3), r.top + r.height / 2 + (Math.random() * 4 - 2))
        }
        const tap = async () => {
            const id = Date.now() + Math.random()
            setCur((c) => ({ ...c, down: true }))
            setRipples((r) => [...r, { id, x: pos.current.x, y: pos.current.y }])
            await sleep(140)
            setCur((c) => ({ ...c, down: false }))
            setTimeout(() => setRipples((r) => r.filter((q) => q.id !== id)), 700)
        }
        const wait = async (t: DirTarget, ms = 8000) => {
            const t0 = Date.now()
            for (;;) {
                const el = findTarget(t, true)
                if (el) return el
                if (Date.now() - t0 > ms) return null
                await sleep(250)
            }
        }
        const onMsg = async (e: MessageEvent) => {
            if (e.source !== window.parent || !e.data || e.data.dir !== 'cmd') return
            const { id, cmd } = e.data as { id: number; cmd: DirCmd }
            try {
                switch (cmd.op) {
                    case 'goto': reply(id, true); window.location.assign(cmd.path); return
                    case 'caption': setCaption(cmd.text); return reply(id, true)
                    case 'text': return reply(id, true, (document.body.innerText || '').slice(0, 6000))
                    case 'list': {
                        const items = Array.from(document.querySelectorAll<HTMLElement>('button, a, [role=button], input, textarea, select')).filter(visible).map((el) => {
                            const r = el.getBoundingClientRect()
                            return { tag: el.tagName.toLowerCase(), text: norm(el.textContent || '').slice(0, 50), aria: el.getAttribute('aria-label') || '', ph: el.getAttribute('placeholder') || '', y: Math.round(r.top), x: Math.round(r.left), w: Math.round(r.width) }
                        })
                        return reply(id, true, items)
                    }
                    case 'has': return reply(id, true, !!findTarget(cmd.target))
                    case 'count': {
                        const t = cmd.target
                        const all = Array.from(document.querySelectorAll<HTMLElement>(t.selector || '*')).filter(visible).filter((el) => !t.text || norm(el.textContent || '').includes(norm(t.text)))
                        return reply(id, true, all.length)
                    }
                    case 'scroll': {
                        if (cmd.to) {
                            const sc = scroller()
                            const h = sc === window ? document.documentElement.scrollHeight : (sc as HTMLElement).scrollHeight
                            const cur0 = sc === window ? window.scrollY : (sc as HTMLElement).scrollTop
                            await smoothScroll((cmd.to === 'top' ? 0 : h) - cur0, cmd.ms ?? 1400)
                        } else await smoothScroll(cmd.by ?? 400, cmd.ms ?? 900)
                        return reply(id, true)
                    }
                    case 'move': { const el = await wait(cmd.target); if (!el) return reply(id, false, null, 'não achei'); await toEl(el); return reply(id, true) }
                    case 'click': {
                        const el = await wait(cmd.target)
                        if (!el) return reply(id, false, null, `não achei ${JSON.stringify(cmd.target)}`)
                        await toEl(el, cmd.noScroll)
                        await tap()
                        el.click()
                        return reply(id, true)
                    }
                    case 'type': {
                        const el = (await wait(cmd.target)) as HTMLInputElement | null
                        if (!el) return reply(id, false, null, 'campo não achado')
                        await toEl(el); await tap(); el.focus()
                        const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
                        const setter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!
                        let acc = ''
                        for (const ch of cmd.text) {
                            acc += ch
                            setter.call(el, acc)
                            el.dispatchEvent(new Event('input', { bubbles: true }))
                            await sleep(55 + Math.random() * 90)
                        }
                        return reply(id, true)
                    }
                }
            } catch (err: any) { reply(id, false, null, String(err?.message || err)) }
        }
        window.addEventListener('message', onMsg)
        const hello = () => window.parent.postMessage({ dir: 'ready', path: location.pathname + location.search }, '*')
        hello()
        const t = setInterval(hello, 1500)   // a página-mãe pode abrir depois: avisa de novo até ser ouvida
        return () => { window.removeEventListener('message', onMsg); clearInterval(t) }
    }, [])

    if (!on) return null
    return (
        <div aria-hidden style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 2147483000 }}>
            {caption && (
                <div style={{ position: 'absolute', left: '50%', bottom: 118, transform: 'translateX(-50%)', maxWidth: '88%', background: 'rgba(15,23,42,0.88)', color: '#fff', fontSize: 12, fontWeight: 800, padding: '6px 12px', borderRadius: 99, boxShadow: '0 4px 16px rgba(0,0,0,.3)', textAlign: 'center' }}>{caption}</div>
            )}
            {ripples.map((r) => <span key={r.id} style={{ position: 'absolute', left: r.x - 20, top: r.y - 20, width: 40, height: 40, borderRadius: 99, border: '3px solid #f97316', animation: 'dirRipple .7s ease-out forwards' }} />)}
            <svg width="30" height="30" viewBox="0 0 24 24" style={{ position: 'absolute', left: 0, top: 0, transform: `translate(${cur.x - 4}px, ${cur.y - 3}px) scale(${cur.down ? 0.82 : 1})`, transition: 'transform .65s cubic-bezier(.4,.1,.2,1)', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.45))' }}>
                <path d="M4 2 L4 19 L8.5 15 L11.5 22 L14 21 L11 14 L17.5 14 Z" fill="#fff" stroke="#111" strokeWidth="1.4" strokeLinejoin="round" />
            </svg>
            <style>{`@keyframes dirRipple { from { transform: scale(.3); opacity: .9 } to { transform: scale(1.7); opacity: 0 } }`}</style>
        </div>
    )
}
