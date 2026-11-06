// app/api/admin/manual/device/route.ts
//
// Aparelhos confiáveis do cofre do manual (passkey / WebAuthn). Todas as ações exigem o administrador geral logado (bearer) e a ORIGEM permitida;
// as que mexem em aparelhos (listar, aprovar, revogar) exigem, além disso, a sessão de um aparelho já cadastrado.
//   status                          estado do cofre (sem sessão): configurado? há aparelhos? este navegador está desbloqueado?
//   unlock-options / unlock-verify  desbloquear com digital/rosto de um aparelho cadastrado → abre a sessão de 15 min
//   enroll-start {label}            cadastrar ESTE aparelho: o primeiro (nenhum cadastrado) segue direto; os outros viram um PEDIDO que um aparelho já
//                                   cadastrado precisa aprovar (com a digital dele)
//   enroll-status {requestId}       o pedido já foi aprovado?
//   enroll-options / enroll-verify  registrar a passkey deste aparelho (só com o pedido aprovado, uma vez)
//   pending / approve-options / approve-verify / deny   (sessão) quem aprova os pedidos de aparelho novo
//   list / revoke / lock            (sessão) ver, revogar aparelhos e encerrar a sessão
import { NextResponse } from 'next/server'
import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from '@simplewebauthn/server'
import { isoBase64URL } from '@simplewebauthn/server/helpers'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { SUPER_ADMIN_EMAIL, getAuthedUser } from '@/lib/adminAuth'
import {
    SESSION_COOKIE, SESSION_MINUTES, VAULT_HEADERS, allowedOrigins, clientIp, cookieHeader, logAccess, newSessionCookie, readCookie, requireVaultSession, sweepChallenges, tooManyFails, vaultSecret, whereFrom,
    type Where,
} from '@/lib/adminVault'
import { verifyToken } from '@/lib/manualCrypto.mjs'

export const runtime = 'nodejs'

const json = (body: unknown, status = 200, extra?: Record<string, string>) => {
    const res = NextResponse.json(body, { status, headers: VAULT_HEADERS })
    if (extra?.['Set-Cookie']) res.headers.append('Set-Cookie', extra['Set-Cookie'])
    return res
}
const RP_NAME = 'iUser'
const UUID = /^[0-9a-f-]{36}$/i

interface DeviceRow { id: string; credential_id: string; public_key: string; counter: number; transports: string[] | null; label: string; user_agent: string | null; created_at: string; last_used_at: string | null; revoked_at: string | null }

async function activeDevices(adminId: string): Promise<DeviceRow[]> {
    const { data } = await supabaseAdmin.from('admin_trusted_devices').select('id, credential_id, public_key, counter, transports, label, user_agent, created_at, last_used_at, revoked_at').eq('profile_id', adminId).is('revoked_at', null).order('created_at')
    return (data || []) as DeviceRow[]
}

/** Opções de "entrar com a digital" para os aparelhos cadastrados */
async function authOptions(adminId: string, where: Where, devices: DeviceRow[], kind: 'auth' | 'approve', payload: Record<string, unknown> = {}) {
    const options = await generateAuthenticationOptions({
        rpID: where.rpID, userVerification: 'required', timeout: 60_000,
        allowCredentials: devices.map((d) => ({ id: d.credential_id, transports: (d.transports || undefined) as any })),
    })
    const { data: ch } = await supabaseAdmin.from('admin_webauthn_challenges').insert({ profile_id: adminId, kind, challenge: options.challenge, payload }).select('id').single()
    return { options, challengeId: ch!.id as string }
}

/** Confere a resposta da digital contra o desafio guardado (uso único) e devolve o aparelho que assinou */
async function checkAssertion(adminId: string, where: Where, kind: 'auth' | 'approve', challengeId: string, response: any, devices: DeviceRow[]): Promise<{ device: DeviceRow; payload: any } | null> {
    if (!UUID.test(challengeId || '')) return null
    const { data: ch } = await supabaseAdmin.from('admin_webauthn_challenges').delete().eq('id', challengeId).eq('profile_id', adminId).eq('kind', kind).gt('expires_at', new Date().toISOString()).select('challenge, payload').maybeSingle()
    if (!ch?.challenge) return null
    const device = devices.find((d) => d.credential_id === response?.id)
    if (!device) return null
    try {
        const v = await verifyAuthenticationResponse({
            response, expectedChallenge: ch.challenge as string, expectedOrigin: where.origin, expectedRPID: where.rpID, requireUserVerification: true,
            credential: { id: device.credential_id, publicKey: isoBase64URL.toBuffer(device.public_key), counter: Number(device.counter), transports: (device.transports || undefined) as any },
        })
        if (!v.verified) return null
        await supabaseAdmin.from('admin_trusted_devices').update({ counter: v.authenticationInfo.newCounter, last_used_at: new Date().toISOString() }).eq('id', device.id)
        return { device, payload: ch.payload }
    } catch { return null }
}

export async function POST(req: Request) {
    const secret = vaultSecret()
    const admin = await getAuthedUser(req)
    if (!admin || admin.email !== SUPER_ADMIN_EMAIL) return json({ error: 'Sem permissão' }, 403)
    const body = await req.json().catch(() => ({}))
    const action = String(body.action || '')
    const where = whereFrom(req)
    const configured = !!secret && allowedOrigins().length > 0

    if (action === 'status') {
        if (!configured) return json({ configured: false, hasDevices: false, unlocked: false })
        const devices = await activeDevices(admin.id)
        const tok = secret ? verifyToken(secret, readCookie(req, SESSION_COOKIE)) : null
        const unlocked = !!(tok && tok.uid === admin.id && devices.some((d) => d.id === tok.did))
        return json({ configured: true, originOk: !!where, hasDevices: devices.length > 0, unlocked, minutes: SESSION_MINUTES })
    }
    if (!configured) return json({ error: 'O cofre não está configurado neste ambiente (MANUAL_SECRET e MANUAL_ORIGINS).' }, 503)
    if (!where) return json({ error: 'Este endereço não está na lista permitida do cofre.' }, 403)
    await sweepChallenges()

    // ----- desbloquear -----
    if (action === 'unlock-options') {
        const devices = await activeDevices(admin.id)
        if (devices.length === 0) return json({ error: 'Nenhum aparelho cadastrado.' }, 409)
        if (await tooManyFails(admin.id)) return json({ error: 'Muitas tentativas. Aguarde alguns minutos.' }, 429)
        return json(await authOptions(admin.id, where, devices, 'auth'))
    }
    if (action === 'unlock-verify') {
        if (await tooManyFails(admin.id)) return json({ error: 'Muitas tentativas. Aguarde alguns minutos.' }, 429)
        const devices = await activeDevices(admin.id)
        const ok = await checkAssertion(admin.id, where, 'auth', String(body.challengeId || ''), body.response, devices)
        if (!ok) { await logAccess(req, admin.id, null, 'unlock_fail'); return json({ error: 'Não foi possível confirmar este aparelho.' }, 401) }
        await supabaseAdmin.from('admin_trusted_devices').update({ last_ip: clientIp(req) || null }).eq('id', ok.device.id)
        await logAccess(req, admin.id, ok.device.id, 'unlock')
        return json({ ok: true, device: ok.device.label }, 200, { 'Set-Cookie': newSessionCookie(admin.id, ok.device.id, where) })
    }

    // ----- cadastrar ESTE aparelho -----
    if (action === 'enroll-start') {
        const label = String(body.label || '').trim().slice(0, 60)
        if (!label) return json({ error: 'Dê um nome ao aparelho (ex.: Notebook, Celular).' }, 400)
        const devices = await activeDevices(admin.id)
        const bootstrap = devices.length === 0
        await supabaseAdmin.from('admin_webauthn_challenges').delete().eq('profile_id', admin.id).eq('kind', 'enroll')
        const { data } = await supabaseAdmin.from('admin_webauthn_challenges').insert({
            profile_id: admin.id, kind: 'enroll', payload: { label, ua: (req.headers.get('user-agent') || '').slice(0, 300), approved: bootstrap, bootstrap },
        }).select('id').single()
        await logAccess(req, admin.id, null, bootstrap ? 'enroll_start_first' : 'enroll_start')
        return json({ requestId: data!.id, needsApproval: !bootstrap })
    }
    if (action === 'enroll-status') {
        const { data } = await supabaseAdmin.from('admin_webauthn_challenges').select('payload').eq('id', String(body.requestId || '')).eq('profile_id', admin.id).eq('kind', 'enroll').gt('expires_at', new Date().toISOString()).maybeSingle()
        if (!data) return json({ error: 'O pedido expirou. Comece de novo.' }, 404)
        return json({ approved: !!(data.payload as any).approved })
    }
    if (action === 'enroll-options') {
        const { data: req0 } = await supabaseAdmin.from('admin_webauthn_challenges').select('id, payload').eq('id', String(body.requestId || '')).eq('profile_id', admin.id).eq('kind', 'enroll').gt('expires_at', new Date().toISOString()).maybeSingle()
        const p = (req0?.payload || {}) as any
        if (!req0 || !p.approved) return json({ error: 'Este aparelho ainda não foi aprovado.' }, 403)
        const devices = await activeDevices(admin.id)
        const options = await generateRegistrationOptions({
            rpName: RP_NAME, rpID: where.rpID, userName: admin.email || 'admin', userDisplayName: p.label, userID: new TextEncoder().encode(admin.id), attestationType: 'none', timeout: 60_000,
            excludeCredentials: devices.map((d) => ({ id: d.credential_id, transports: (d.transports || undefined) as any })),
            authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
        })
        const { data: ch } = await supabaseAdmin.from('admin_webauthn_challenges').insert({ profile_id: admin.id, kind: 'register', challenge: options.challenge, payload: { requestId: req0.id } }).select('id').single()
        return json({ options, challengeId: ch!.id })
    }
    if (action === 'enroll-verify') {
        const challengeId = String(body.challengeId || '')
        if (!UUID.test(challengeId)) return json({ error: 'Pedido inválido.' }, 400)
        const { data: ch } = await supabaseAdmin.from('admin_webauthn_challenges').delete().eq('id', challengeId).eq('profile_id', admin.id).eq('kind', 'register').gt('expires_at', new Date().toISOString()).select('challenge, payload').maybeSingle()
        if (!ch?.challenge) return json({ error: 'O pedido expirou. Comece de novo.' }, 410)
        // o pedido aprovado é consumido (uso único) junto com o desafio
        const { data: rq } = await supabaseAdmin.from('admin_webauthn_challenges').delete().eq('id', (ch.payload as any).requestId).eq('profile_id', admin.id).eq('kind', 'enroll').select('payload').maybeSingle()
        const p = (rq?.payload || {}) as any
        if (!rq || !p.approved) return json({ error: 'Este aparelho não foi aprovado.' }, 403)
        try {
            const v = await verifyRegistrationResponse({ response: body.response, expectedChallenge: ch.challenge as string, expectedOrigin: where.origin, expectedRPID: where.rpID, requireUserVerification: true })
            if (!v.verified || !v.registrationInfo) return json({ error: 'Não foi possível registrar este aparelho.' }, 400)
            const c = v.registrationInfo.credential
            const { data: dev, error } = await supabaseAdmin.from('admin_trusted_devices').insert({
                profile_id: admin.id, credential_id: c.id, public_key: isoBase64URL.fromBuffer(c.publicKey), counter: c.counter, transports: c.transports ?? null,
                label: String(p.label || 'Aparelho').slice(0, 60), user_agent: p.ua || null, last_used_at: new Date().toISOString(), approved_by: p.approvedBy ?? null,
            }).select('id, label').single()
            if (error) return json({ error: 'Este aparelho já está cadastrado.' }, 409)
            await logAccess(req, admin.id, dev!.id as string, 'enroll_done')
            return json({ ok: true, device: dev!.label }, 200, { 'Set-Cookie': newSessionCookie(admin.id, dev!.id as string, where) })
        } catch { return json({ error: 'Não foi possível registrar este aparelho.' }, 400) }
    }

    // ----- daqui para baixo: precisa da sessão de um aparelho já cadastrado -----
    const session = await requireVaultSession(req)
    if (!session) return json({ error: 'Desbloqueie o cofre com este aparelho.' }, 401)
    const refreshed = { 'Set-Cookie': newSessionCookie(admin.id, session.deviceId, where) }

    if (action === 'list') {
        const { data } = await supabaseAdmin.from('admin_trusted_devices').select('id, label, user_agent, created_at, last_used_at, revoked_at').eq('profile_id', admin.id).order('created_at')
        return json({ current: session.deviceId, devices: data || [] }, 200, refreshed)
    }
    if (action === 'pending') {
        const { data } = await supabaseAdmin.from('admin_webauthn_challenges').select('id, payload, created_at').eq('profile_id', admin.id).eq('kind', 'enroll').gt('expires_at', new Date().toISOString()).order('created_at')
        const pending = (data || []).filter((r: any) => !r.payload?.approved).map((r: any) => ({ id: r.id, label: r.payload?.label, userAgent: r.payload?.ua, createdAt: r.created_at }))
        return json({ pending }, 200, refreshed)
    }
    if (action === 'approve-options') {
        const requestId = String(body.requestId || '')
        const { data: rq } = await supabaseAdmin.from('admin_webauthn_challenges').select('id').eq('id', requestId).eq('profile_id', admin.id).eq('kind', 'enroll').gt('expires_at', new Date().toISOString()).maybeSingle()
        if (!rq) return json({ error: 'O pedido expirou.' }, 404)
        return json(await authOptions(admin.id, where, await activeDevices(admin.id), 'approve', { requestId }), 200, refreshed)
    }
    if (action === 'approve-verify') {
        const devices = await activeDevices(admin.id)
        const ok = await checkAssertion(admin.id, where, 'approve', String(body.challengeId || ''), body.response, devices)
        if (!ok) { await logAccess(req, admin.id, session.deviceId, 'approve_fail'); return json({ error: 'Não foi possível confirmar com a digital.' }, 401) }
        const { data: rq } = await supabaseAdmin.from('admin_webauthn_challenges').select('payload').eq('id', ok.payload.requestId).eq('profile_id', admin.id).eq('kind', 'enroll').gt('expires_at', new Date().toISOString()).maybeSingle()
        if (!rq) return json({ error: 'O pedido expirou.' }, 404)
        await supabaseAdmin.from('admin_webauthn_challenges').update({ payload: { ...(rq.payload as object), approved: true, approvedBy: ok.device.id } }).eq('id', ok.payload.requestId)
        await logAccess(req, admin.id, ok.device.id, 'approve')
        return json({ ok: true }, 200, refreshed)
    }
    if (action === 'deny') {
        await supabaseAdmin.from('admin_webauthn_challenges').delete().eq('id', String(body.requestId || '')).eq('profile_id', admin.id).eq('kind', 'enroll')
        return json({ ok: true }, 200, refreshed)
    }
    if (action === 'revoke') {
        const id = String(body.id || '')
        if (!UUID.test(id)) return json({ error: 'Aparelho inválido.' }, 400)
        await supabaseAdmin.from('admin_trusted_devices').update({ revoked_at: new Date().toISOString() }).eq('id', id).eq('profile_id', admin.id).is('revoked_at', null)
        await logAccess(req, admin.id, session.deviceId, 'revoke')
        return json({ ok: true, self: id === session.deviceId }, 200, id === session.deviceId ? { 'Set-Cookie': cookieHeader('', where.secure, 0) } : refreshed)
    }
    if (action === 'lock') {
        await logAccess(req, admin.id, session.deviceId, 'lock')
        return json({ ok: true }, 200, { 'Set-Cookie': cookieHeader('', where.secure, 0) })
    }
    return json({ error: 'Ação inválida' }, 400)
}

export const dynamic = 'force-dynamic'
