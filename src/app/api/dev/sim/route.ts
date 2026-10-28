// POST /api/dev/sim { stage: boolean } — só no ambiente LOCAL de desenvolvimento: o botão 🎬 Teatro da página /tres-telas liga e desliga o MODO TEATRO do simulador da pizzaria
// (os motoristas, a cliente e o dono passam a agir pelas telas). Fala com o comando único dos simuladores (scripts/local/simulate-all.py) pelo arquivo de controle dele, sem
// reiniciar o ecossistema. Em qualquer outro ambiente: 404.  GET devolve se o simulador está no modo Teatro agora.
import { NextResponse } from 'next/server'
import { appendFile, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { isLocalDevOnly } from '@/lib/devOnly'

const DIR = path.join(os.homedir(), '.iuser-sim')

async function status(): Promise<{ running: boolean; stage: boolean }> {
    try {
        const st = JSON.parse(await readFile(path.join(DIR, 'status.json'), 'utf8'))
        const fresh = Date.now() / 1000 - Number(st.updated) < 8
        return { running: fresh && !!st.sims?.pizzaria, stage: !!st.sims?.pizzaria?.args?.includes('--stage') }
    } catch { return { running: false, stage: false } }
}

export async function GET() {
    if (!isLocalDevOnly()) return new NextResponse(null, { status: 404 })
    return NextResponse.json(await status())
}

export async function POST(req: Request) {
    if (!isLocalDevOnly()) return new NextResponse(null, { status: 404 })
    const body = await req.json().catch(() => ({}))
    const want = !!body.stage
    const st = await status()
    if (!st.running) return NextResponse.json({ ok: false, ...st, hint: 'O comando único dos simuladores não está rodando: npm run sim' }, { status: 409 })
    if (st.stage === want) return NextResponse.json({ ok: true, changed: false, ...st })
    await appendFile(path.join(DIR, 'control'), JSON.stringify({ op: 'restart', targets: ['pizzaria'], args: [want ? '--stage' : '--default'] }) + '\n')
    return NextResponse.json({ ok: true, changed: true, stage: want, running: true })
}
