// app/api/internal/uploads-cleanup/route.ts
//
// Rotina diária de limpeza de arquivos órfãos (Camada 6 do controle de uploads). Chamada pelo Vercel Cron (vercel.json), que manda `Authorization: Bearer <CRON_SECRET>`.
// FALHA FECHADA: sem CRON_SECRET configurada (ou curta demais) a rota responde 503 e não faz nada; senha errada = 401. Nada do corpo/URL é usado.
// Quem decide se APAGA é a chave "Apagar de verdade" do painel (Admin → Uploads): desligada, a rodada só procura e marca (simulação).
import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { runUploadCleanup, type CleanupClient } from '@/lib/uploadCleanup'
import { readR2Config } from '@/lib/r2'
import { r2CleanupOps } from '@/lib/r2Cleanup'

export const dynamic = 'force-dynamic'
// 60 s é o teto de qualquer plano da Vercel (um valor acima do plano derruba o DEPLOY). A rodada é pequena (até 200 arquivos); se a busca demorar mais, o banco segue trabalhando e a próxima rodada continua.
export const maxDuration = 60

function authorized(req: Request, secret: string): boolean {
    const given = Buffer.from(req.headers.get('authorization') || '')
    const want = Buffer.from(`Bearer ${secret}`)
    return given.length === want.length && timingSafeEqual(given, want)
}

export async function GET(req: Request) {
    const secret = process.env.CRON_SECRET || ''
    if (secret.length < 16) return NextResponse.json({ error: 'Rotina não configurada' }, { status: 503 })
    if (!authorized(req, secret)) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    try {
        const r = await runUploadCleanup(supabaseAdmin as unknown as CleanupClient, { source: 'cron', r2: (() => { const c = readR2Config(); return c ? r2CleanupOps(c) : null })() })
        return NextResponse.json(r, { headers: { 'Cache-Control': 'no-store' } })
    } catch (e) {
        console.error('[uploads-cleanup]', e)
        return NextResponse.json({ error: 'Falha na rodada' }, { status: 500 })
    }
}
