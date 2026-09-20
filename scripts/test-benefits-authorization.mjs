// scripts/test-benefits-authorization.mjs
// Testa de ponta a ponta a autorização de concessão de benefícios contra o
// Supabase real e o servidor Next local (http://localhost:3000): cria
// usuários temporários (@example.invalid), roda os cenários pela ROTA
// /api/benefits/grant com o JWT de cada ator e apaga tudo no final.
//   node scripts/test-benefits-authorization.mjs
import fs from 'node:fs'
import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)] }))
const URL = env.NEXT_PUBLIC_SUPABASE_URL
const admin = createClient(URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const APP = process.env.APP_URL || 'http://localhost:3000'
const stamp = Date.now()
const PASSWORD = `Tmp-${Math.random().toString(36).slice(2)}A1!`

const users = {}
const createdPlans = []
let pass = 0, fail = 0
const check = (name, cond, extra = '') => {
    if (cond) { pass++; console.log(`  PASS  ${name}`) } else { fail++; console.log(`  FAIL  ${name} ${extra}`) }
}

async function mkUser(key, { statusSlug, upline, extra = {} } = {}) {
    const email = `bench-${key}-${stamp}@example.invalid`
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true })
    if (error) throw error
    const id = data.user.id
    const patch = { name: `Bench ${key}`, profileSlug: `bench-${key}-${stamp}`, ...extra }
    if (upline) patch.upline_id = upline
    if (statusSlug) {
        const { data: st } = await admin.from('user_statuses').select('id').eq('slug', statusSlug).single()
        patch.status_id = st.id
    }
    const { error: pe } = await admin.from('profiles').update(patch).eq('id', id)
    if (pe) throw pe
    users[key] = { id, email }
    return id
}

async function tokenFor(key) {
    const c = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
    const { data, error } = await c.auth.signInWithPassword({ email: users[key].email, password: PASSWORD })
    if (error) throw error
    return { token: data.session.access_token, client: c }
}

async function planId(code) {
    const { data } = await admin.from('plans').select('id').eq('code', code).single()
    return data.id
}

async function grantVia(actorKey, body) {
    const { token } = await tokenFor(actorKey)
    const res = await fetch(`${APP}/api/benefits/grant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
    })
    return { status: res.status, json: await res.json().catch(() => ({})) }
}

async function hasDriver(key) {
    const { data } = await admin.rpc('get_active_plan_grants', { p_user_id: users[key].id })
    return data?.[0]?.has_driver === true
}

async function cleanup() {
    const ids = Object.values(users).map((u) => u.id)
    if (ids.length) {
        await admin.from('grant_audit_logs').delete().in('actor_user_id', ids)
        await admin.from('grant_audit_logs').delete().in('target_user_id', ids)
    }
    await admin.from('profiles').update({ upline_id: null }).in('id', ids)
    for (const u of Object.values(users)) {
        await admin.rpc('admin_delete_profile', { p_user_id: u.id })
        await admin.auth.admin.deleteUser(u.id)
    }
    for (const id of createdPlans) await admin.from('plans').delete().eq('id', id)
}

try {
    // ---- montagem ----
    await mkUser('plain')
    await mkUser('leader', { statusSlug: 'lider' })
    await mkUser('invited', { upline: users.leader.id })
    await mkUser('invited2', { upline: users.leader.id })
    await mkUser('stranger')
    await mkUser('supervisor', { statusSlug: 'supervisor' })
    await mkUser('b', { upline: users.supervisor.id })
    await mkUser('c', { upline: users.b.id })
    await mkUser('adm', { statusSlug: 'administrador' })
    await mkUser('leaderStore', { statusSlug: 'lider' })
    await mkUser('invitedStore', { upline: users.leaderStore.id })
    await mkUser('leaderRevoked', { statusSlug: 'lider' })
    await mkUser('invitedRevoked', { upline: users.leaderRevoked.id })
    await mkUser('legacyLeader')

    await mkUser('sched', { upline: users.leader.id })
    await mkUser('postpaid')
    await mkUser('monthly')
    await mkUser('requester')

    // exceções por pessoa (mesmo status, permissões diferentes)
    const permId = async (slug) => (await admin.from('permissions').select('id').eq('slug', slug).single()).data.id
    await admin.from('user_permissions').insert({ profile_id: users.leaderStore.id, permission_id: await permId('grant_store_plan'), effect: 'grant', scope: 'direct_invite' })
    await admin.from('user_permissions').insert({ profile_id: users.leaderRevoked.id, permission_id: await permId('grant_driver_plan'), effect: 'revoke' })

    const P = { motorista: await planId('motorista'), beta: await planId('motorista_beta'), loja: await planId('loja'), recrutador: await planId('recrutador'), combo: await planId('combo'), posPago: await planId('pos_pago') }

    console.log('\nTESTE 1 — usuário comum tenta conceder Motorista')
    let r = await grantVia('plain', { targetUserId: users.invited.id, planId: P.motorista, days: 30 })
    check('negado (403 permission_denied)', r.status === 403 && r.json.code === 'permission_denied', JSON.stringify(r))

    console.log('\nTESTE 2 — Líder concede Motorista dentro do escopo')
    r = await grantVia('leader', { targetUserId: users.invited.id, planId: P.motorista, days: 30, reason: 'teste' })
    check('permitido (200)', r.status === 200 && r.json.success, JSON.stringify(r))
    check('beneficiário passou a ter has_driver', await hasDriver('invited'))
    const { data: audit } = await admin.from('grant_audit_logs').select('*').eq('actor_user_id', users.leader.id).eq('outcome', 'granted')
    check('auditoria registrou status/permissão/escopo', audit?.[0]?.actor_status_slug === 'lider' && audit?.[0]?.permission_used === 'grant_driver_plan' && audit?.[0]?.scope_used === 'direct_invite', JSON.stringify(audit?.[0]))
    const { data: sub } = await admin.from('subscriptions').select('source, granted_by, granted_reason').eq('user_id', users.invited.id).single()
    check('assinatura marcada como concessão de liderança', sub?.source === 'leader_grant' && sub?.granted_by === users.leader.id && sub?.granted_reason === 'teste', JSON.stringify(sub))

    console.log('\nTESTE 3 — Líder (grant_driver_plan) tenta conceder Loja')
    r = await grantVia('leader', { targetUserId: users.invited2.id, planId: P.loja, days: 30 })
    check('negado (permission_denied)', r.status === 403 && r.json.code === 'permission_denied', JSON.stringify(r))

    console.log('\nTESTE 4 — Líder tenta conceder Motorista fora do escopo')
    r = await grantVia('leader', { targetUserId: users.stranger.id, planId: P.motorista, days: 30 })
    check('negado (out_of_scope)', r.status === 403 && r.json.code === 'out_of_scope', JSON.stringify(r))

    console.log('\nTESTE 5 — Supervisor concede Loja dentro do escopo (rede, 2 níveis)')
    r = await grantVia('supervisor', { targetUserId: users.c.id, planId: P.loja, days: 30 })
    check('permitido (200)', r.status === 200 && r.json.success, JSON.stringify(r))
    r = await grantVia('supervisor', { targetUserId: users.stranger.id, planId: P.loja, days: 30 })
    check('fora da estrutura negado (out_of_scope)', r.status === 403 && r.json.code === 'out_of_scope', JSON.stringify(r))

    console.log('\nTESTE 6 — Supervisor tenta conceder Recrutador sem permissão')
    r = await grantVia('supervisor', { targetUserId: users.c.id, planId: P.recrutador, days: 30 })
    check('negado (permission_denied)', r.status === 403 && r.json.code === 'permission_denied', JSON.stringify(r))

    console.log('\nTESTE 7 — Administrador com grant_any_plan')
    r = await grantVia('adm', { targetUserId: users.stranger.id, planId: P.combo, days: 30 })
    check('concede Combo (200)', r.status === 200 && r.json.success, JSON.stringify(r))
    r = await grantVia('adm', { targetUserId: users.stranger.id, planId: P.recrutador, days: 30 })
    check('concede Recrutador (200)', r.status === 200 && r.json.success, JSON.stringify(r))
    r = await grantVia('adm', { targetUserId: users.plain.id, planId: P.posPago, days: 30 })
    check('plano não habilitado p/ concessão (Pós-pago) negado', r.status === 403 && r.json.code === 'plan_not_grantable', JSON.stringify(r))
    const { data: admPlans } = await admin.rpc('get_grantable_plans', { p_actor: users.adm.id })
    check('lista do admin traz todos os elegíveis (6)', (admPlans || []).length === 6, `veio ${(admPlans || []).length}`)
    const { data: leaderPlans } = await admin.rpc('get_grantable_plans', { p_actor: users.leader.id })
    check('lista do Líder = Motorista + Motorista Beta', JSON.stringify((leaderPlans || []).map((p) => p.code).sort()) === JSON.stringify(['motorista', 'motorista_beta']), JSON.stringify(leaderPlans?.map((p) => p.code)))
    const { data: supPlans } = await admin.rpc('get_grantable_plans', { p_actor: users.supervisor.id })
    check('lista do Supervisor = Motorista, Beta, Prestador, Loja', JSON.stringify((supPlans || []).map((p) => p.code).sort()) === JSON.stringify(['loja', 'motorista', 'motorista_beta', 'prestador']), JSON.stringify(supPlans?.map((p) => p.code)))

    console.log('\nTESTE 8 — request manipulado (plan_id diferente do mostrado)')
    r = await grantVia('leader', { targetUserId: users.invited2.id, planId: P.combo, days: 30 })
    check('plan_id de Combo enviado por Líder Motorista → negado', r.status === 403, JSON.stringify(r))
    r = await grantVia('leader', { targetUserId: users.invited2.id, planId: 'nao-e-uuid', days: 30 })
    check('plan_id inválido → 400', r.status === 400, JSON.stringify(r))
    r = await grantVia('leader', { targetUserId: users.invited2.id, planId: '00000000-0000-0000-0000-000000000000', days: 30 })
    check('plan_id inexistente → negado', r.status !== 200, JSON.stringify(r))
    const res401 = await fetch(`${APP}/api/benefits/grant`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    check('sem token → 401', res401.status === 401)
    const anon = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
    const direct = await anon.rpc('grant_plan_internal', { p_actor: users.adm.id, p_target: users.plain.id, p_plan_id: P.motorista, p_days: 30 })
    check('chamar grant_plan_internal direto do cliente é bloqueado', !!direct.error, JSON.stringify(direct.data))
    const { client: leaderClient } = await tokenFor('leader')
    const direct2 = await leaderClient.rpc('grant_plan_internal', { p_actor: users.adm.id, p_target: users.plain.id, p_plan_id: P.motorista, p_days: 30 })
    check('logado também não chama grant_plan_internal (fingir admin)', !!direct2.error, JSON.stringify(direct2.data))
    const ins = await leaderClient.from('subscriptions').insert({ user_id: users.plain.id, plan_id: P.motorista, status: 'active', source: 'admin_grant', current_period_end: '2099-01-01' })
    check('INSERT direto em subscriptions pelo cliente é bloqueado (RLS)', !!ins.error)
    r = await grantVia('leader', { targetUserId: users.leader.id, planId: P.motorista, days: 30 })
    check('conceder para si mesmo → negado', r.status === 403 && r.json.code === 'self_grant_denied', JSON.stringify(r))

    console.log('\nTESTE 9 — limite de vagas')
    const { data: slotPlan } = await admin.from('plans').insert({ code: `zz_slots_${stamp}`, name: 'Teste vagas', price: 1, grants_driver: true, is_active: false, grantable: true, grant_permission: 'grant_driver_plan', max_active_subscriptions: 1, billing_cycle: 'MONTHLY' }).select('id').single()
    createdPlans.push(slotPlan.id)
    r = await grantVia('leader', { targetUserId: users.invited.id, planId: slotPlan.id, days: 30 })
    check('1ª concessão cabe na vaga', r.status === 200, JSON.stringify(r))
    r = await grantVia('leader', { targetUserId: users.invited2.id, planId: slotPlan.id, days: 30 })
    check('2ª concessão → negada (slots_full)', r.status === 409 && r.json.code === 'slots_full', JSON.stringify(r))

    console.log('\nTESTE 10 — concessão expirada não dá mais o benefício')
    await admin.from('subscriptions').update({ current_period_end: new Date(Date.now() - 86400000).toISOString() }).eq('user_id', users.invited.id)
    check('has_driver = false após expirar', !(await hasDriver('invited')))

    console.log('\nTESTE 11 — Líder Motorista migrado')
    const { count: stillLegacy } = await admin.from('profiles').select('id', { count: 'exact', head: true }).eq('is_lider_motorista', true).is('status_id', null).neq('id', users.legacyLeader.id)
    check('nenhum líder real ficou sem status após a migração', (stillLegacy || 0) === 0, `restaram ${stillLegacy}`)
    const { data: lstat } = await admin.from('user_statuses').select('id').eq('slug', 'lider').single()
    await admin.from('profiles').update({ status_id: lstat.id }).eq('id', users.legacyLeader.id) // mesmo UPDATE da migration
    await admin.from('profiles').update({ upline_id: users.legacyLeader.id }).eq('id', users.invited2.id)
    r = await grantVia('legacyLeader', { targetUserId: users.invited2.id, planId: P.motorista, days: 30 })
    check('ex-is_lider_motorista concede Motorista a convidado', r.status === 200, JSON.stringify(r))
    r = await grantVia('legacyLeader', { targetUserId: users.invited2.id, planId: P.beta, days: 30 })
    check('… e Motorista Beta', r.status === 200, JSON.stringify(r))
    for (const [nome, pid] of [['Loja', P.loja], ['Recrutador', P.recrutador], ['Combo', P.combo]]) {
        r = await grantVia('legacyLeader', { targetUserId: users.invited2.id, planId: pid, days: 30 })
        check(`… e NÃO concede ${nome}`, r.status === 403, JSON.stringify(r))
    }
    const { data: prest } = await admin.from('plans').select('id').eq('code', 'prestador').single()
    r = await grantVia('legacyLeader', { targetUserId: users.invited2.id, planId: prest.id, days: 30 })
    check('… e NÃO concede Prestador', r.status === 403, JSON.stringify(r))

    console.log('\nEXTRA — exceções por pessoa (mesmo status, permissões diferentes)')
    r = await grantVia('leaderStore', { targetUserId: users.invitedStore.id, planId: P.loja, days: 30 })
    check('Líder + grant_store_plan concede Loja', r.status === 200, JSON.stringify(r))
    r = await grantVia('leaderStore', { targetUserId: users.invitedStore.id, planId: P.motorista, days: 30 })
    check('… e continua concedendo Motorista', r.status === 200, JSON.stringify(r))
    r = await grantVia('leaderRevoked', { targetUserId: users.invitedRevoked.id, planId: P.motorista, days: 30 })
    check('Líder com grant_driver_plan REVOGADO → negado', r.status === 403 && r.json.code === 'permission_denied', JSON.stringify(r))

    console.log('\nEXTRA — busca e histórico respeitam o escopo')
    const { data: found } = await leaderClient.rpc('find_grant_targets', { p_query: 'Bench' })
    const foundIds = (found || []).map((f) => f.id)
    check('busca do Líder só traz convidados dele', foundIds.includes(users.invited.id) && !foundIds.includes(users.stranger.id) && !foundIds.includes(users.c.id), JSON.stringify(foundIds.length))
    const { data: hLeader } = await leaderClient.rpc('get_benefit_history', { p_limit: 100, p_only_granted: true })
    check('histórico do Líder só tem concessões dele', (hLeader || []).length > 0 && (hLeader || []).every((h) => h.actor_user_id === users.leader.id), `${hLeader?.length}`)
    const { client: plainClient } = await tokenFor('plain')
    const { data: hPlain } = await plainClient.rpc('get_benefit_history', { p_limit: 100, p_only_granted: true })
    check('usuário comum não vê histórico', (hPlain || []).length === 0)
    const { client: admClient } = await tokenFor('adm')
    const { data: hAdm } = await admClient.rpc('get_benefit_history', { p_limit: 500, p_only_granted: true })
    check('Administrador vê tudo', (hAdm || []).some((h) => h.actor_user_id === users.leader.id) && (hAdm || []).some((h) => h.actor_user_id === users.supervisor.id))
    const { data: myStatus } = await leaderClient.rpc('get_my_status')
    check('get_my_status do Líder: nível 1, grant_driver_plan @ direct_invite', myStatus?.level === 1 && myStatus.permissions.some((p) => p.slug === 'grant_driver_plan' && p.scope === 'direct_invite'), JSON.stringify(myStatus))


    console.log('\nPENDÊNCIA 5 — concessão agendada (início futuro)')
    const inTen = new Date(Date.now() + 10 * 86400000).toISOString()
    r = await grantVia('leader', { targetUserId: users.sched.id, planId: P.motorista, days: 30, startsAt: inTen })
    check('agendar início daqui a 10 dias → 200', r.status === 200, JSON.stringify(r))
    check('antes do início NÃO dá o benefício', !(await hasDriver('sched')))
    const { data: schedHist } = await leaderClient.rpc('get_benefit_history', { p_limit: 100, p_only_granted: true })
    check('histórico marca como agendado', (schedHist || []).some((h) => h.target_user_id === users.sched.id && h.is_scheduled === true && h.is_active === false))
    r = await grantVia('leader', { targetUserId: users.sched.id, planId: P.motorista, days: 30, startsAt: new Date(Date.now() + 20 * 86400000).toISOString() })
    check('reagendar por cima de agendamento pendente (nada em vigor) é permitido', r.status === 200, JSON.stringify(r))
    await admin.from('subscriptions').update({ starts_at: new Date(Date.now() - 3600000).toISOString() }).eq('user_id', users.sched.id)
    check('depois do início passa a valer', await hasDriver('sched'))
    r = await grantVia('leader', { targetUserId: users.sched.id, planId: P.motorista, days: 30, startsAt: new Date(Date.now() + 5 * 86400000).toISOString() })
    check('agendar por cima de benefício em vigor → negado (already_active)', r.status === 409 && r.json.code === 'already_active', JSON.stringify(r))
    r = await grantVia('leader', { targetUserId: users.invited2.id, planId: P.motorista, days: 30, startsAt: new Date(Date.now() + 500 * 86400000).toISOString() })
    check('início a mais de 1 ano → negado (invalid_start)', r.status === 409 && r.json.code === 'invalid_start', JSON.stringify(r))
    r = await grantVia('leader', { targetUserId: users.invited2.id, planId: P.motorista, days: 30, startsAt: 'lixo' })
    check('data inválida → 400', r.status === 400, JSON.stringify(r))

    console.log('\nPENDÊNCIA 4 — administração da hierarquia')
    const hier = async (actor, action, payload) => {
        const { token } = await tokenFor(actor)
        const res = await fetch(`${APP}/api/admin/hierarchy`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ action, payload }) })
        return { status: res.status, json: await res.json().catch(() => ({})) }
    }
    const zz = `zz_test_${stamp}`
    r = await hier('leader', 'upsert_status', { slug: zz, name: 'Teste', level: 5 })
    check('Líder NÃO administra a hierarquia (403)', r.status === 403, JSON.stringify(r))
    r = await hier('adm', 'upsert_status', { slug: zz, name: 'Teste', level: 5, description: 'temporário' })
    check('Administrador cria status novo', r.status === 200, JSON.stringify(r))
    r = await hier('adm', 'upsert_status', { slug: 'usuario', name: 'Usuário', level: 3 })
    check('status Usuário é protegido (nível fixo 0)', r.status === 403, JSON.stringify(r))
    r = await hier('adm', 'upsert_status', { slug: 'administrador', name: 'Administrador', level: 4, is_active: false })
    check('Administrador não pode ser desativado', r.status === 403, JSON.stringify(r))
    r = await hier('adm', 'remove_status_permission', { status_slug: 'administrador', permission_slug: 'grant_any_plan' })
    check('Administrador não perde grant_any_plan', r.status === 403, JSON.stringify(r))
    r = await hier('adm', 'set_status_permission', { status_slug: 'administrador', permission_slug: 'manage_hierarchy', scope: 'network' })
    check('Administrador não rebaixa manage_hierarchy p/ escopo menor', r.status === 403, JSON.stringify(r))
    r = await hier('adm', 'set_status_permission', { status_slug: zz, permission_slug: 'grant_store_plan', scope: 'direct_invite' })
    check('dá permissão ao status novo', r.status === 200, JSON.stringify(r))
    await admin.from('profiles').update({ status_id: (await admin.from('user_statuses').select('id').eq('slug', zz).single()).data.id }).eq('id', users.plain.id)
    await admin.from('profiles').update({ upline_id: users.plain.id }).eq('id', users.stranger.id)
    r = await grantVia('plain', { targetUserId: users.stranger.id, planId: P.loja, days: 30 })
    check('pessoa no status novo concede Loja ao convidado (sem mexer no código)', r.status === 200, JSON.stringify(r))
    r = await grantVia('plain', { targetUserId: users.stranger.id, planId: P.motorista, days: 30 })
    check('… mas não Motorista', r.status === 403, JSON.stringify(r))
    r = await hier('adm', 'set_plan_grant_settings', { plan_id: slotPlan.id, grantable: false, grant_permission: 'grant_driver_plan' })
    check('Administrador desmarca plano como concedível', r.status === 200, JSON.stringify(r))
    r = await grantVia('leader', { targetUserId: users.invited2.id, planId: slotPlan.id, days: 30 })
    check('… e concessão desse plano passa a ser negada (plan_not_grantable)', r.status === 403 && r.json.code === 'plan_not_grantable', JSON.stringify(r))
    r = await hier('adm', 'set_plan_grant_settings', { plan_id: slotPlan.id, grantable: true, grant_permission: 'grant_any_plan' })
    check('permissão de plano não pode ser grant_any_plan (inválido)', r.status === 403, JSON.stringify(r))
    r = await hier('adm', 'set_user_permission', { profileSlug: `bench-invited2-${stamp}`, permission_slug: 'grant_store_plan', effect: 'grant', scope: 'direct_invite' })
    check('exceção por pessoa via @slug', r.status === 200, JSON.stringify(r))
    const { data: ovList } = await (async () => { const { token } = await tokenFor('adm'); const res = await fetch(`${APP}/api/admin/hierarchy`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ action: 'list_user_overrides', payload: { profileSlug: `bench-invited2-${stamp}` } }) }); return { data: await res.json() } })()
    check('lista de exceções da pessoa', (ovList.overrides || []).length === 1)
    r = await hier('adm', 'remove_user_permission', { profileSlug: `bench-invited2-${stamp}`, permission_slug: 'grant_store_plan' })
    check('remove a exceção', r.status === 200, JSON.stringify(r))
    r = await hier('adm', 'set_user_permission', { profileSlug: `bench-adm-${stamp}`, permission_slug: 'manage_hierarchy', effect: 'revoke' })
    check('Administrador não revoga as próprias permissões', r.status === 403, JSON.stringify(r))
    const { data: hierAudit } = await admin.from('grant_audit_logs').select('outcome').eq('action', 'hierarchy_change').eq('actor_user_id', users.adm.id)
    check('mudanças e negativas da hierarquia foram auditadas', (hierAudit || []).some((a) => a.outcome === 'granted') && (hierAudit || []).some((a) => a.outcome === 'denied'))
    await admin.from('profiles').update({ status_id: null }).eq('id', users.plain.id)
    await admin.from('user_statuses').delete().eq('slug', zz)

    console.log('\nPENDÊNCIA 3 — cobrança pós-paga REAL (triggers do banco)')
    await admin.from('subscriptions').insert({ user_id: users.postpaid.id, plan_id: P.posPago, status: 'active', source: 'postpaid', current_period_end: '2099-12-31' })
    await admin.from('subscriptions').insert({ user_id: users.monthly.id, plan_id: P.motorista, status: 'active', source: 'asaas', current_period_end: '2099-12-31' })
    const debtOf = async (key) => Number((await admin.rpc('get_driver_postpaid_debt', { p_driver_id: users[key].id })).data)
    // corrida finalizada
    for (const key of ['postpaid', 'monthly']) {
        const { data: ride, error: re } = await admin.from('ride_requests').insert({ requester_id: users.requester.id, ride_type: 'pessoa', origin_address: 'A', destination_address: 'B', status: 'accepted', driver_id: users[key].id }).select('id').single()
        if (re) throw re
        await admin.from('ride_requests').update({ status: 'completed' }).eq('id', ride.id)
        if (key === 'postpaid') await admin.from('ride_requests').update({ status: 'completed' }).eq('id', ride.id) // 2ª vez: não pode duplicar
        await admin.from('ride_requests').delete().eq('id', ride.id).then(() => {}, () => {})
    }
    check('corrida finalizada cobra R$ 0,50 do pós-pago (e não duplica)', (await debtOf('postpaid')) === 0.5, `dívida ${await debtOf('postpaid')}`)
    check('corrida finalizada NÃO cobra quem tem plano mensal', (await debtOf('monthly')) === 0)
    // pedido de serviço aceito
    for (const key of ['postpaid', 'monthly']) {
        const { data: sr, error: se } = await admin.from('service_requests').insert({ requester_id: users.requester.id, service_type: 'outro', custom_service: 'teste', location_address: 'X', description: 'teste' }).select('id').single()
        if (se) throw se
        const { data: app } = await admin.from('service_applications').insert({ service_request_id: sr.id, applicant_id: users[key].id }).select('id').single()
        await admin.from('service_applications').update({ status: 'accepted' }).eq('id', app.id)
    }
    check('serviço aceito cobra R$ 0,50 do prestador pós-pago (total R$ 1,00)', (await debtOf('postpaid')) === 1, `dívida ${await debtOf('postpaid')}`)
    check('serviço aceito NÃO cobra plano mensal', (await debtOf('monthly')) === 0)
    // pedido de loja pago
    for (const key of ['postpaid', 'monthly']) {
        const { data: store, error: ste } = await admin.from('stores').insert({ name: `Loja bench ${key}`, storeSlug: `bench-loja-${key}-${stamp}`, owner_id: users[key].id }).select('id').single()
        if (ste) throw new Error('criar loja de teste: ' + ste.message)
        const { error: oe } = await admin.from('orders').insert({ store_id: store.id, total_amount: 10, status: 'paid', checkout_id: crypto.randomUUID() })
        if (oe) throw new Error('criar pedido de teste: ' + oe.message)
    }
    check('pedido de loja pago cobra R$ 0,50 do dono pós-pago (total R$ 1,50)', (await debtOf('postpaid')) === 1.5, `dívida ${await debtOf('postpaid')}`)
    check('pedido de loja pago NÃO cobra dono de plano mensal', (await debtOf('monthly')) === 0)
    // bloqueio em R$ 50
    await admin.from('driver_postpaid_charges').insert({ driver_id: users.postpaid.id, type: 'payment', amount: 48.5, asaas_payment_id: `bench-${stamp}` }).then(() => {})
    await admin.from('driver_postpaid_charges').delete().eq('asaas_payment_id', `bench-${stamp}`)
    await admin.from('driver_postpaid_charges').insert({ driver_id: users.postpaid.id, type: 'ride_fee', amount: 48.5 })
    check('dívida chega a R$ 50', (await debtOf('postpaid')) === 50)
    const { data: st2 } = await admin.from('stores').select('id').eq('owner_id', users.postpaid.id).single()
    const blocked = await admin.from('orders').insert({ store_id: st2.id, buyer_id: users.requester.id, total_amount: 10, status: 'pending', checkout_id: crypto.randomUUID() })
    check('loja com R$ 50 de dívida não recebe pedido online', !!blocked.error, JSON.stringify(blocked.data))

    console.log('\nTESTE 12 — plano mensal continua sem cobrança pós-paga por serviço')
    const { data: monthlyCheck } = await admin.rpc('is_postpaid_user', { p_user_id: users.c.id })
    check('quem tem plano mensal/concedido NÃO é pós-pago', monthlyCheck === false)
    await admin.from('subscriptions').insert({ user_id: users.plain.id, plan_id: P.posPago, status: 'active', source: 'postpaid', current_period_end: '2099-12-31' })
    const { data: postCheck } = await admin.rpc('is_postpaid_user', { p_user_id: users.plain.id })
    check('quem ativou o Pós-pago continua sendo cobrado por serviço', postCheck === true)
} catch (e) {
    fail++
    console.error('ERRO NO TESTE:', e)
} finally {
    await cleanup()
    console.log(`\n${pass} passaram, ${fail} falharam. Usuários e planos de teste removidos.`)
    process.exit(fail ? 1 : 0)
}
