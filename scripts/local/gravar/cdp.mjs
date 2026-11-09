// scripts/local/gravar/cdp.mjs — controle MÍNIMO do Chrome pelo protocolo DevTools (sem instalar nada: Node 22+ já traz WebSocket e fetch).
// Só para gravar demonstrações no banco/app LOCAL. Abre o Chrome do Mac em modo headless com um perfil temporário.
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export async function abrirChrome({ largura = 390, altura = 844, escala = 2, porta = 9333 } = {}) {
    const dir = mkdtempSync(join(tmpdir(), 'iuser-gravar-'))
    const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${porta}`, `--user-data-dir=${dir}`, '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
        '--disable-gpu-vsync', '--mute-audio', `--window-size=${largura},${altura}`, 'about:blank'], { stdio: 'ignore' })
    let ver
    for (let i = 0; i < 60; i++) {
        try { ver = await (await fetch(`http://127.0.0.1:${porta}/json/version`)).json(); break } catch { await sleep(250) }
    }
    if (!ver) { proc.kill(); throw new Error('o Chrome não abriu') }
    const alvos = await (await fetch(`http://127.0.0.1:${porta}/json/list`)).json()
    const pagina = alvos.find((t) => t.type === 'page')
    const ws = new WebSocket(pagina.webSocketDebuggerUrl)
    await new Promise((ok, err) => { ws.onopen = ok; ws.onerror = err })
    let seq = 0
    const espera = new Map()
    ws.onmessage = (m) => {
        const d = JSON.parse(m.data)
        if (d.id && espera.has(d.id)) { const { ok, err } = espera.get(d.id); espera.delete(d.id); d.error ? err(new Error(d.error.message)) : ok(d.result) }
    }
    const enviar = (method, params = {}) => new Promise((ok, err) => { const id = ++seq; espera.set(id, { ok, err }); ws.send(JSON.stringify({ id, method, params })) })
    await enviar('Page.enable'); await enviar('Runtime.enable'); await enviar('Network.enable')
    await enviar('Emulation.setDeviceMetricsOverride', { width: largura, height: altura, deviceScaleFactor: escala, mobile: true })
    await enviar('Emulation.setTouchEmulationEnabled', { enabled: true })
    await enviar('Emulation.setTimezoneOverride', { timezoneId: 'America/Porto_Velho' }).catch(() => { })
    await enviar('Emulation.setLocaleOverride', { locale: 'pt-BR' }).catch(() => { })

    const api = {
        enviar,
        largura, altura, escala,
        async ir(url) { await enviar('Page.navigate', { url }); await sleep(600) },
        async js(expr) {
            const r = await enviar('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
            if (r.exceptionDetails) throw new Error('JS: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text))
            return r.result.value
        },
        async foto(qualidade = 78) { return Buffer.from((await enviar('Page.captureScreenshot', { format: 'jpeg', quality: qualidade })).data, 'base64') },
        async toque(x, y) {
            for (const [type, extra] of [['mouseMoved', {}], ['mousePressed', { button: 'left', clickCount: 1 }], ['mouseReleased', { button: 'left', clickCount: 1 }]])
                await enviar('Input.dispatchMouseEvent', { type, x, y, ...extra })
        },
        async roda(x, y, dy) { await enviar('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY: dy }) },
        async digitar(texto) { for (const ch of texto) { await enviar('Input.insertText', { text: ch }); await sleep(55) } },
        async fechar() { try { ws.close() } catch { } proc.kill(); await sleep(300); try { rmSync(dir, { recursive: true, force: true }) } catch { } },
    }
    return api
}
