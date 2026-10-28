// src/lib/adminVault.ts
//
// Server-only: o COFRE do manual de regras. As regras de acesso moram aqui e nas duas rotas /api/admin/manual/*; o texto fica cifrado no banco
// (tabelas admin_manual_* sem permissão alguma para o app — só a service role) e só sai para quem passa por TODAS as etapas:
//   1. login do administrador geral (requireSuperAdmin: bearer + e-mail);
//   2. aparelho confiável cadastrado com digital/rosto (passkey, WebAuthn, verificação do usuário obrigatória);
//   3. sessão curta desse aparelho (cookie assinado, HttpOnly, só vale no caminho /api/admin/manual) — e o aparelho continua cadastrado.
// Sem o segredo do servidor (MANUAL_SECRET) ou sem a origem permitida (MANUAL_ORIGINS) o cofre FICA FECHADO (falha para o lado seguro). No ambiente LOCAL
// (Supabase local + localhost:3100) existem padrões só para desenvolver. Never import this from a 'use client' file.
import { supabaseAdmin } from '@/lib/supabase/admin'
import { isLocalDevOnly } from '@/lib/devOnly'
import { SUPER_ADMIN_EMAIL, getAuthedUser } from '@/lib/adminAuth'
import { chapterKey, decryptText, encryptText, signToken, verifyToken } from '@/lib/manualCrypto.mjs'
import type { User } from '@supabase/supabase-js'

export const SESSION_COOKIE = 'iu_manual'
export const SESSION_MINUTES = 15
export const COOKIE_PATH = '/api/admin/manual'
const MAX_FAILS = 8            // falhas de desbloqueio em 10 minutos antes de travar

export function vaultSecret(): string | null {
    const s = process.env.MANUAL_SECRET
    if (s && s.length >= 32) return s
    // só no ambiente LOCAL de desenvolvimento: um segredo derivado da chave do banco local (não vale em nenhum outro lugar)
    if (isLocalDevOnly() && process.env.SUPABASE_SERVICE_ROLE_KEY) return `local-dev:${process.env.SUPABASE_SERVICE_ROLE_KEY}`.slice(0, 200)
    return null
}

/** Endereços onde o cofre pode ser usado (a passkey de cada endereço é separada) */
export function allowedOrigins(): string[] {
    const fromEnv = (process.env.MANUAL_ORIGINS || '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean)
    if (isLocalDevOnly()) fromEnv.push('http://localhost:3100')
    return fromEnv
}

export interface Where { origin: string; rpID: string; secure: boolean }
/** A origem DA REQUISIÇÃO, só se estiver na lista permitida */
export function whereFrom(req: Request): Where | null {
    const origin = (req.headers.get('origin') || '').replace(/\/$/, '')
    if (!origin || !allowedOrigins().includes(origin)) return null
    try { const u = new URL(origin); return { origin, rpID: u.hostname, secure: u.protocol === 'https:' } } catch { return null }
}

export const clientIp = (req: Request): string => (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('x-real-ip') || ''

export function cookieHeader(value: string, secure: boolean, maxAgeSeconds: number): string {
    return `${SESSION_COOKIE}=${value}; Path=${COOKIE_PATH}; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure ? '; Secure' : ''}`
}

export function readCookie(req: Request, name: string): string | null {
    const raw = req.headers.get('cookie') || ''
    for (const part of raw.split(';')) {
        const i = part.indexOf('=')
        if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim()
    }
    return null
}

export interface Session { admin: User; deviceId: string }

/** Etapas 1 + 3: o administrador logado E uma sessão válida de um aparelho que continua cadastrado */
export async function requireVaultSession(req: Request): Promise<Session | null> {
    const secret = vaultSecret()
    const admin = await getAuthedUser(req)
    if (!secret || !admin || admin.email !== SUPER_ADMIN_EMAIL) return null
    const tok = verifyToken(secret, readCookie(req, SESSION_COOKIE))
    if (!tok || tok.uid !== admin.id || typeof tok.did !== 'string') return null
    const { data } = await supabaseAdmin.from('admin_trusted_devices').select('id').eq('id', tok.did).eq('profile_id', admin.id).is('revoked_at', null).maybeSingle()
    return data ? { admin, deviceId: data.id as string } : null
}

/** Cabeçalho para (re)emitir a sessão: 15 minutos a partir de agora */
export function newSessionCookie(adminId: string, deviceId: string, where: Where): string {
    const secret = vaultSecret()!
    const now = Date.now()
    return cookieHeader(signToken(secret, { uid: adminId, did: deviceId, iat: now, exp: now + SESSION_MINUTES * 60_000 }), where.secure, SESSION_MINUTES * 60)
}

export async function logAccess(req: Request, adminId: string | null, deviceId: string | null, action: string, chapterId?: string | null) {
    await supabaseAdmin.from('admin_manual_access_log').insert({
        profile_id: adminId, device_id: deviceId, action, chapter_id: chapterId ?? null, ip: clientIp(req) || null, user_agent: (req.headers.get('user-agent') || '').slice(0, 300) || null,
    })
}

/** Falhas recentes de desbloqueio deste administrador (trava depois de MAX_FAILS em 10 minutos) */
export async function tooManyFails(adminId: string): Promise<boolean> {
    const since = new Date(Date.now() - 10 * 60_000).toISOString()
    const { count } = await supabaseAdmin.from('admin_manual_access_log').select('id', { count: 'exact', head: true }).eq('profile_id', adminId).eq('action', 'unlock_fail').gte('created_at', since)
    return (count ?? 0) >= MAX_FAILS
}

/** Apaga desafios vencidos (limpeza oportunista a cada uso) */
export async function sweepChallenges() {
    await supabaseAdmin.from('admin_webauthn_challenges').delete().lt('expires_at', new Date().toISOString())
}

// ===== Capítulos: id opaco no banco, conteúdo cifrado =====
export interface ManualChapter {
    slug: string
    title: string
    summary: string
    position: number
    sections: unknown[]
}
export interface ChapterMeta { slug: string; title: string; summary: string; position: number; sections: { id: string; title: string; status?: string }[] }

export function sealChapter(ch: ManualChapter, version = 1) {
    const secret = vaultSecret()!
    const id = chapterKey(secret, ch.slug)
    return { id, position: ch.position, version, payload_enc: encryptText(secret, ch, id) }
}

export async function loadChapters(): Promise<ManualChapter[]> {
    const secret = vaultSecret()!
    const { data, error } = await supabaseAdmin.from('admin_manual_chapters').select('id, position, payload_enc').order('position')
    if (error) throw new Error(error.message)
    const out: ManualChapter[] = []
    for (const row of data || []) {
        try { out.push(JSON.parse(decryptText(secret, row.payload_enc as string, row.id as string))) } catch { /* capítulo ilegível (chave trocada ou adulterado): fica de fora */ }
    }
    return out
}

export const metaOf = (c: ManualChapter): ChapterMeta => ({
    slug: c.slug, title: c.title, summary: c.summary, position: c.position,
    sections: (c.sections as any[]).map((s) => ({ id: String(s.id), title: String(s.title), status: s.status })),
})

/** Respostas do cofre: nunca em cache, nunca indexadas */
export const VAULT_HEADERS = { 'Cache-Control': 'no-store, max-age=0', 'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff', Pragma: 'no-cache' }
