// src/app/tres-telas/stage.ts — o "palco" da página /tres-telas (só LOCAL): fala com o ScreenDirector de cada quadro (postMessage) e roda os roteiros.
import type { DirCmd, DirTarget } from '@/components/dev/ScreenDirector'

export type Who = 'owner' | 'client' | 'driver'
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
export const rnd = (a: number, b: number) => a + Math.random() * (b - a)
export const pick = <T,>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)]

export class Stage {
    frames: Record<Who, HTMLIFrameElement | null> = { owner: null, client: null, driver: null }
    ready: Record<Who, { path: string; at: number } | null> = { owner: null, client: null, driver: null }
    private pend = new Map<number, { ok: (v: any) => void; err: (e: Error) => void }>()
    private seq = 1
    stopped = false
    onLog: (who: Who, msg: string) => void = () => {}

    private onMessage = (e: MessageEvent) => {
        const d = e.data
        if (!d || !d.dir) return
        const who = (Object.keys(this.frames) as Who[]).find((k) => this.frames[k]?.contentWindow === e.source)
        if (!who) return
        if (d.dir === 'ready') this.ready[who] = { path: d.path, at: Date.now() }
        if (d.dir === 'res') {
            const p = this.pend.get(d.id)
            if (!p) return
            this.pend.delete(d.id)
            d.ok ? p.ok(d.value) : p.err(new Error(d.error || 'falhou'))
        }
    }
    start() { window.addEventListener('message', this.onMessage); this.stopped = false }
    stop() { window.removeEventListener('message', this.onMessage); this.stopped = true; this.pend.forEach((p) => p.err(new Error('parado'))); this.pend.clear() }

    call(who: Who, cmd: DirCmd, timeout = 25000): Promise<any> {
        const win = this.frames[who]?.contentWindow
        if (!win) return Promise.reject(new Error(`quadro ${who} indisponível`))
        const id = this.seq++
        return new Promise((ok, err) => {
            const t = setTimeout(() => { this.pend.delete(id); err(new Error(`tempo esgotado: ${cmd.op}`)) }, timeout)
            this.pend.set(id, { ok: (v) => { clearTimeout(t); ok(v) }, err: (e) => { clearTimeout(t); err(e) } })
            win.postMessage({ dir: 'cmd', id, cmd }, '*')
        })
    }
    /** igual a `call`, mas nunca lança: devolve null se não deu */
    async soft(who: Who, cmd: DirCmd, timeout?: number): Promise<any> { try { return await this.call(who, cmd, timeout) } catch (e: any) { this.onLog(who, `· ${cmd.op}: ${e.message}`); return null } }

    /** abre um endereço no quadro e espera a página avisar que carregou */
    async goto(who: Who, path: string) {
        const before = Date.now()
        this.ready[who] = null
        try { await this.call(who, { op: 'goto', path }, 4000) } catch { /* a página some ao navegar */ }
        for (let i = 0; i < 80; i++) {
            const r = this.ready[who] as { path: string; at: number } | null
            if (r && r.at >= before) break
            await sleep(250)
        }
        await sleep(700)
    }
    click(who: Who, target: DirTarget, timeout = 12000) { return this.call(who, { op: 'click', target }, timeout) }
    type(who: Who, target: DirTarget, text: string) { return this.call(who, { op: 'type', target, text }, 20000 + text.length * 250) }
    scroll(who: Who, by: number, ms = 1000) { return this.call(who, { op: 'scroll', by, ms }) }
    has(who: Who, target: DirTarget) { return this.call(who, { op: 'has', target }) as Promise<boolean> }
    caption(who: Who, text: string | null) { return this.soft(who, { op: 'caption', text }) }
    text(who: Who) { return this.call(who, { op: 'text' }) as Promise<string> }
    where(who: Who) { return this.ready[who]?.path || '' }
}
