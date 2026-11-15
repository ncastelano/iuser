// TESTE PONTA A PONTA da limpeza de arquivos sem uso (migration 20261130000022 + src/lib/uploadCleanup.ts) contra o Supabase LOCAL de verdade: Storage real, apagando arquivos de verdade.
//   node scripts/local/test-upload-cleanup.mjs
// Só o banco LOCAL (recusa qualquer outro). Envia arquivos como uma pessoa de teste, envelhece-os no banco, roda a MESMA rotina que a rota agendada e o painel usam, e confere no Storage o que sumiu
// e o que ficou. SEMPRE restaura no final (configuração, perfil, arquivos, registros, rodadas e auditoria criados aqui), mesmo se um passo falhar.
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { runUploadCleanup } from '../../src/lib/uploadCleanup.ts'

const env = Object.fromEntries(execFileSync('npx', ['supabase', 'status', '-o', 'env', '--workdir', '.local-supabase'], { encoding: 'utf8', env: { ...process.env, SUPABASE_ACCESS_TOKEN: '' } })
    .split('\n').map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/)).filter(Boolean).map((m) => [m[1], m[2]]))
const API = env.API_URL, ANON = env.ANON_KEY, SERVICE = env.SERVICE_ROLE_KEY
if (!API || !ANON || !SERVICE || !/127\.0\.0\.1|localhost/.test(API)) throw new Error('Supabase LOCAL desligado — este teste só roda no banco local')
const PASSWORD = 'Teste-local-24h'
const SVC = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' }
const psql = (sql) => execFileSync('docker', ['exec', '-i', 'supabase_db_iuser-local', 'psql', '-U', 'postgres', '-d', 'postgres', '-X', '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8' }).trim()
const svc = createClient(API, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })

let passed = 0
const ok = (cond, msg) => { if (!cond) throw new Error(`FALHOU: ${msg}`); passed++; console.log(`  ok  ${msg}`) }
const jpeg = (n) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), crypto.randomBytes(n - 4)])
const exists = async (bucket, path) => (await fetch(`${API}/storage/v1/object/${bucket}/${path}`, { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } })).status === 200
const state = (bucket, key) => psql(`select state||'/'||coalesce(deleted_reason,'-')||'/'||(orphan_since is not null)::text||'/'||keep::text from media_assets where bucket='${bucket}' and key='${key}'`)

async function login(slug) {
    const { data: p } = await svc.from('profiles').select('id').eq('profileSlug', slug).single()
    if (!p) throw new Error(`perfil ${slug} não existe no banco local`)
    await fetch(`${API}/auth/v1/admin/users/${p.id}`, { method: 'PUT', headers: SVC, body: JSON.stringify({ password: PASSWORD }) })
    const email = (await (await fetch(`${API}/auth/v1/admin/users/${p.id}`, { headers: SVC })).json()).email
    const j = await (await fetch(`${API}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }) })).json()
    if (!j.access_token) throw new Error(`login de ${slug} falhou`)
    return { id: p.id, token: j.access_token }
}
async function sendAs(A, bucket, path, bytes = 12_000) {
    const r = await fetch(`${API}/storage/v1/object/${bucket}/${path}`, { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${A.token}`, 'Content-Type': 'image/jpeg' }, body: jpeg(bytes) })
    if (r.status !== 200) throw new Error(`envio de ${bucket}/${path} falhou: HTTP ${r.status} ${await r.text()}`)
    const reg = await fetch(`${API}/rest/v1/rpc/register_media_asset`, { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${A.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_bucket: bucket, p_path: path }) })
    if (reg.status !== 200) throw new Error(`registro falhou: ${await reg.text()}`)
}
const age = (bucket, key, { created = false, orphanDays = null } = {}) => psql(`update media_assets set ${created ? "created_at = now() - interval '10 days'" : ''}${created && orphanDays != null ? ',' : ''}${orphanDays != null ? `orphan_since = now() - interval '${orphanDays} days'` : ''} where bucket='${bucket}' and key='${key}'`)
const runner = (enabledNow, opts) => runUploadCleanup(svc, opts)

const T = Date.now()
const startedAt = new Date().toISOString()
const made = []                 // [bucket, key]
let A, saved = null, savedBio = null
try {
    console.log('preparo')
    saved = JSON.parse(psql(`select row_to_json(s) from (select cleanup_enabled, cleanup_min_age_days, cleanup_quarantine_days, cleanup_max_per_run from upload_settings where id) s`))
    // limite alto para a conferência olhar TODOS os arquivos (os reais também) e o teste não depender da ordem
    psql(`update upload_settings set cleanup_enabled=false, cleanup_min_age_days=3, cleanup_quarantine_days=7, cleanup_max_per_run=1000 where id`)
    A = await login('cliente-teste')
    savedBio = psql(`select coalesce(bio,'') from profiles where id='${A.id}'`)

    const f = (n) => `${A.id}-e2eclean-${T}-${n}.jpg`
    const names = { orphan1: f('o1'), orphan2: f('o2'), used: f('used'), kept: f('kept'), reappear: f('back') }
    for (const k of Object.values(names)) { await sendAs(A, 'avatars', k); made.push(['avatars', k]) }
    const proof = `${A.id}/e2eclean-${T}-proof.jpg`
    await sendAs(A, 'delivery-proofs', proof); made.push(['delivery-proofs', proof])
    for (const [b, k] of made) age(b, k, { created: true })
    ok(made.every(([b, k]) => state(b, k).startsWith('ready/')), `6 arquivos de verdade enviados (5 fotos de perfil e 1 prova de entrega), registrados e envelhecidos 10 dias`)
    ok(psql(`select kind from media_assets where key='${proof}'`) === 'delivery_proof', 'a prova de entrega é do tipo protegido (delivery_proof)')

    // "used" é citado por um texto do perfil; "kept" é mantido pelo admin
    psql(`update profiles set bio = 'e2e usa ${names.used}' where id='${A.id}'`)
    ok((await svc.rpc('admin_upload_cleanup_keep', { p_asset: psql(`select id from media_assets where key='${names.kept}'`), p_keep: true, p_admin: null })).data === true, 'admin marca um arquivo para manter')

    console.log('1) limpeza DESLIGADA: procura e marca, não apaga nada')
    let r = await runner(false, { source: 'admin' })
    ok(r.ok && r.dryRun === true && r.enabled === false, 'rodada de simulação (chave desligada)')
    ok(r.marked >= 3, `marcou os sem uso (marcados: ${r.marked})`)
    ok(state('avatars', names.orphan1).endsWith('/true/false') && state('avatars', names.orphan2).endsWith('/true/false') && state('avatars', names.reappear).endsWith('/true/false'), 'os 3 sem uso ficaram marcados')
    ok(state('avatars', names.used).endsWith('/false/false'), 'o arquivo citado no perfil NÃO foi marcado')
    ok(state('avatars', names.kept).endsWith('/false/true'), 'o arquivo "manter" NÃO foi marcado')
    ok(state('delivery-proofs', proof).endsWith('/false/false'), 'a prova de entrega NÃO foi marcada (tipo protegido)')
    ok(r.due === 0, 'ainda na quarentena: nada pronto para apagar')
    for (const [b, k] of made) ok(await exists(b, k), `continua no Storage: ${k.slice(-18)}`)

    console.log('2) ligada, mas ainda em quarentena: não apaga')
    psql(`update upload_settings set cleanup_enabled=true where id`)
    r = await runner(true, { source: 'admin' })
    ok(r.dryRun === false && r.deleted === 0 && r.due === 0, 'ligada e nada apagado (quarentena de 7 dias não passou)')

    console.log('3) quarentena vencida: apaga SÓ o que continua sem uso')
    for (const n of ['orphan1', 'orphan2', 'reappear']) age('avatars', names[n], { orphanDays: 8 })
    psql(`update profiles set bio = 'e2e usa ${names.used} e voltou ${names.reappear}' where id='${A.id}'`)   // "reappear" ganha uma referência de novo antes de apagar
    const before = psql(`select count(*) from upload_cleanup_runs`)
    r = await runner(true, { source: 'cron' })
    ok(r.ok && r.dryRun === false && r.deleted === 2, `apagou exatamente 2 (apagados: ${r.deleted})`)
    ok(r.bytesFreed === 24_000, `liberou 24.000 bytes (${r.bytesFreed})`)
    ok(!(await exists('avatars', names.orphan1)) && !(await exists('avatars', names.orphan2)), 'os 2 sem uso SUMIRAM do Storage de verdade')
    ok(await exists('avatars', names.used) && await exists('avatars', names.kept) && await exists('avatars', names.reappear) && await exists('delivery-proofs', proof), 'ficaram: o citado, o mantido, o que voltou a ser citado e a prova de entrega')
    ok(state('avatars', names.orphan1) === 'deleted/orphan/true/false', 'registro do apagado: estado deleted, motivo "orphan"')
    ok(state('avatars', names.reappear) === 'ready/-/false/false', 'quem voltou a ser citado saiu da quarentena sozinho')
    ok(Number(psql(`select count(*) from upload_cleanup_runs`)) === Number(before) + 1, 'a rodada ficou registrada')
    const run = JSON.parse(psql(`select row_to_json(x) from (select source, dry_run, deleted, bytes_freed, errors from upload_cleanup_runs order by started_at desc limit 1) x`))
    ok(run.source === 'cron' && run.dry_run === false && run.deleted === 2 && Number(run.bytes_freed) === 24_000 && run.errors === 0, 'o registro da rodada tem origem, números e zero erros')

    console.log('4) repetir não apaga de novo')
    r = await runner(true, { source: 'cron' })
    ok(r.deleted === 0 && r.ok, 'segunda rodada: nada a apagar')

    console.log('5) falha do Storage: o arquivo continua registrado como existente e a próxima rodada tenta de novo')
    const o3 = f('o3'); await sendAs(A, 'avatars', o3); made.push(['avatars', o3]); age('avatars', o3, { created: true, orphanDays: 8 })
    const broken = { rpc: (fn, a) => svc.rpc(fn, a), storage: { from: () => ({ remove: async () => ({ data: null, error: { message: 'Storage fora do ar (simulado)' } }) }) } }
    r = await runUploadCleanup(broken, { source: 'admin' })
    ok(r.ok === false && r.deleted === 0 && r.errors >= 1, 'a rodada acusa o erro e não conta nada como apagado')
    ok(state('avatars', o3).startsWith('ready/') && await exists('avatars', o3), 'o arquivo continua no Storage e "ready" no registro')
    r = await runner(true, { source: 'admin' })
    ok(r.deleted === 1 && !(await exists('avatars', o3)), 'na rodada seguinte, com o Storage de volta, é apagado')

    console.log('6) arquivo que sumiu por fora do registro')
    const o4 = f('o4'); await sendAs(A, 'avatars', o4); made.push(['avatars', o4])
    await fetch(`${API}/storage/v1/object/avatars/${o4}`, { method: 'DELETE', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } })
    r = await runner(true, { source: 'cron' })
    ok(r.reconciled >= 1 && state('avatars', o4).startsWith('deleted/missing/'), 'a conferência marca como "sumiu" (motivo missing), sem contar como limpeza')

    console.log('7) pedido de simulação com a chave ligada')
    const o5 = f('o5'); await sendAs(A, 'avatars', o5); made.push(['avatars', o5]); age('avatars', o5, { created: true, orphanDays: 8 })
    r = await runner(true, { source: 'admin', dryRun: true })
    ok(r.dryRun === true && r.due === 1 && r.deleted === 0 && await exists('avatars', o5), 'simulação mostra 1 pronto e não apaga')
    ok(r.files.length === 1 && r.files[0].key === o5, 'e diz qual seria apagado')

    console.log('8) auditoria')
    ok(Number(psql(`select count(*) from admin_config_audit where scope='upload_cleanup' and setting like '%${names.kept}' and new_value='true'`)) === 1, 'o "manter" ficou no histórico de mudanças')
    console.log(`\nTUDO CERTO: ${passed} verificações`)
} finally {
    console.log('\nlimpando o que o teste criou…')
    try {
        for (const [b, k] of made) await fetch(`${API}/storage/v1/object/${b}/${k}`, { method: 'DELETE', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } }).catch(() => {})
        for (const [b, k] of made) psql(`delete from media_assets where bucket='${b}' and key='${k}'`)
        psql(`delete from upload_cleanup_runs where started_at >= '${startedAt}'`)
        psql(`delete from admin_config_audit where changed_at >= '${startedAt}' and scope in ('upload_cleanup','upload_settings')`)
        if (saved) psql(`update upload_settings set cleanup_enabled=${saved.cleanup_enabled}, cleanup_min_age_days=${saved.cleanup_min_age_days}, cleanup_quarantine_days=${saved.cleanup_quarantine_days}, cleanup_max_per_run=${saved.cleanup_max_per_run} where id`)
        if (A && savedBio !== null) psql(`update profiles set bio = ${savedBio === '' ? 'NULL' : `'${savedBio.replace(/'/g, "''")}'`} where id='${A.id}'`)
        console.log('  restaurado')
    } catch (e) { console.error('  ERRO ao restaurar:', e.message) }
}
