// POST /api/dev/sim { theater: boolean } — só no ambiente LOCAL de desenvolvimento: o botão 🎬 Teatro da página /tres-telas liga e desliga o MODO TEATRO dos simuladores: a pizzaria deixa a
// dona e os três motoristas (Dani, Léo e Tito) para as telas (`--theater`) e o ALIMENTADOR (simulate-teatro.py) traz o movimento da Helena e das corridas. Fala com o comando único dos
// simuladores (scripts/local/simulate-all.py) pelo arquivo de controle dele, sem reiniciar o ecossistema. Em qualquer outro ambiente: 404.  GET devolve se está no modo Teatro agora.
// (`{ stage }` é o modo antigo de 3 telas, ainda aceito.)
import { NextResponse } from 'next/server'
import { appendFile, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { isLocalDevOnly } from '@/lib/devOnly'

const DIR = path.join(os.homedir(), '.iuser-sim')

async function status(): Promise<{ running: boolean; stage: boolean; theater: boolean }> {
    try {
        const st = JSON.parse(await readFile(path.join(DIR, 'status.json'), 'utf8'))
        const fresh = Date.now() / 1000 - Number(st.updated) < 8
        const theater = !!st.sims?.pizzaria?.args?.includes('--theater')
        return { running: fresh && !!st.sims?.pizzaria, stage: !!st.sims?.pizzaria?.args?.includes('--stage'), theater }
    } catch { return { running: false, stage: false, theater: false } }
}

export async function GET() {
    if (!isLocalDevOnly()) return new NextResponse(null, { status: 404 })
    return NextResponse.json(await status())
}

export async function POST(req: Request) {
    if (!isLocalDevOnly()) return new NextResponse(null, { status: 404 })
    const body = await req.json().catch(() => ({}))
    const st = await status()
    if (!st.running) return NextResponse.json({ ok: false, ...st, hint: 'O comando único dos simuladores não está rodando: npm run sim' }, { status: 409 })
    const ctl = (op: Record<string, unknown>) => appendFile(path.join(DIR, 'control'), JSON.stringify(op) + '\n')
    if (body.theater !== undefined) {
        const want = !!body.theater
        if (st.theater === want) return NextResponse.json({ ok: true, changed: false, ...st })
        // pizzaria: dona e motoristas à mão (Dani, Léo, Tito); o alimentador liga/desliga junto
        await ctl({ op: 'restart', targets: ['pizzaria'], args: want ? ['--theater', '--manual-drivers', 'dani,leo,tito', '--burst', '2', '--every', '40', '--appts-every', '150', '--chat-every', '30', '--featured-every', '120'] : ['--default'] })
        await ctl(want ? { op: 'restart', targets: ['teatro'], args: [] } : { op: 'stop', targets: ['teatro'] })
        return NextResponse.json({ ok: true, changed: true, theater: want, running: true })
    }
    const want = !!body.stage
    if (st.stage === want) return NextResponse.json({ ok: true, changed: false, ...st })
    await ctl({ op: 'restart', targets: ['pizzaria'], args: [want ? '--stage' : '--default'] })
    return NextResponse.json({ ok: true, changed: true, stage: want, running: true })
}
