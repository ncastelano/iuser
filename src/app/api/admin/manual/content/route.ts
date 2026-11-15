// app/api/admin/manual/content/route.ts
//
// Leitura do MANUAL DE REGRAS. Só com o administrador geral logado + sessão de um aparelho cadastrado (ver lib/adminVault.ts). O texto sai decifrado
// UM CAPÍTULO POR VEZ, sem cache, e cada leitura fica no registro de acessos. Não existe exportação nem download.
//   index            os capítulos (uma palavra cada) e o nome das seções
//   chapter {slug}   um capítulo inteiro
//   search {q}       trechos que batem com a busca (nos títulos e no texto de todas as seções)
import { NextResponse } from 'next/server'
import { VAULT_HEADERS, loadChapters, logAccess, metaOf, newSessionCookie, requireVaultSession, whereFrom } from '@/lib/adminVault'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const reply = (body: unknown, status: number, cookie?: string) => {
    const res = NextResponse.json(body, { status, headers: VAULT_HEADERS })
    if (cookie) res.headers.append('Set-Cookie', cookie)
    return res
}

/** Todo o texto de um bloco/seção, para a busca */
const textOf = (v: unknown): string => (typeof v === 'string' ? v : Array.isArray(v) ? v.map(textOf).join(' ') : v && typeof v === 'object' ? Object.values(v as object).map(textOf).join(' ') : '')

export async function POST(req: Request) {
    const where = whereFrom(req)
    const session = await requireVaultSession(req)
    if (!where || !session) return reply({ error: 'Desbloqueie o cofre com este aparelho.' }, 401)
    const body = await req.json().catch(() => ({}))
    const action = String(body.action || '')
    const cookie = newSessionCookie(session.admin.id, session.deviceId, where)

    let chapters
    try { chapters = await loadChapters() } catch { return reply({ error: 'Não foi possível ler o manual.' }, 500) }

    if (action === 'index') {
        await logAccess(req, session.admin.id, session.deviceId, 'index')
        return reply({ chapters: chapters.map(metaOf) }, 200, cookie)
    }
    if (action === 'chapter') {
        const ch = chapters.find((c) => c.slug === String(body.slug || ''))
        if (!ch) return reply({ error: 'Capítulo não encontrado.' }, 404, cookie)
        await logAccess(req, session.admin.id, session.deviceId, 'chapter', ch.slug)
        return reply({ chapter: ch }, 200, cookie)
    }
    if (action === 'search') {
        const q = String(body.q || '').trim().toLowerCase().slice(0, 80)
        if (q.length < 2) return reply({ hits: [] }, 200, cookie)
        await logAccess(req, session.admin.id, session.deviceId, 'search')
        const hits: { slug: string; chapter: string; sectionId: string; section: string; snippet: string }[] = []
        for (const c of chapters) {
            for (const s of c.sections as any[]) {
                const full = `${s.title} ${textOf(s.blocks)} ${textOf(s.where)} ${textOf(s.config)} ${textOf(s.evolve)}`
                const i = full.toLowerCase().indexOf(q)
                if (i < 0) continue
                hits.push({ slug: c.slug, chapter: c.title, sectionId: String(s.id), section: String(s.title), snippet: (i > 40 ? '…' : '') + full.slice(Math.max(0, i - 40), i + 120).replace(/\s+/g, ' ') + '…' })
                if (hits.length >= 40) break
            }
            if (hits.length >= 40) break
        }
        return reply({ hits }, 200, cookie)
    }
    return reply({ error: 'Ação inválida' }, 400, cookie)
}
