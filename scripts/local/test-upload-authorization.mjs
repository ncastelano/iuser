// TESTE PONTA A PONTA da autorização de envio (migration 20261130000020) contra a API REAL do Supabase LOCAL: login de verdade (GoTrue), JWT da pessoa, PostgREST e Storage.
//   node scripts/local/test-upload-authorization.mjs
// Só o banco LOCAL (recusa qualquer outro). Usa duas pessoas de teste (cliente-teste e lojista-teste), envia arquivos de verdade e SEMPRE restaura no final
// (interruptor desligado, limites originais, bloqueios levantados, arquivos de teste apagados), mesmo se algum passo falhar.
// Antes de começar alinha o banco local com a PRODUÇÃO: remove as políticas antigas de INSERT/ALL do Storage que o baseline local ainda traz (a produção as perdeu no bloqueio 20261106).
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'

const env = Object.fromEntries(execFileSync('npx', ['supabase', 'status', '-o', 'env', '--workdir', '.local-supabase'], { encoding: 'utf8', env: { ...process.env, SUPABASE_ACCESS_TOKEN: '' } })
    .split('\n').map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/)).filter(Boolean).map((m) => [m[1], m[2]]))
const API = env.API_URL, ANON = env.ANON_KEY, SERVICE = env.SERVICE_ROLE_KEY
if (!API || !ANON || !SERVICE || !/127\.0\.0\.1|localhost/.test(API)) throw new Error('Supabase LOCAL desligado — este teste só roda no banco local')
const PASSWORD = 'Teste-local-24h'
const SVC = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' }
const psql = (sql) => execFileSync('docker', ['exec', '-i', 'supabase_db_iuser-local', 'psql', '-U', 'postgres', '-d', 'postgres', '-X', '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8' }).trim()

let passed = 0
const ok = (cond, msg) => { if (!cond) throw new Error(`FALHOU: ${msg}`); passed++; console.log(`  ok  ${msg}`) }
const jpeg = (n) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), crypto.randomBytes(n - 4)])   // n bytes que parecem JPEG (o Storage confere o tipo declarado, não o conteúdo)

async function rest(method, path, { token, body, headers } = {}) {
    const r = await fetch(`${API}${path}`, { method, headers: token === 'service' ? { ...SVC, ...headers } : { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) })
    const t = await r.text()
    return { status: r.status, body: t ? JSON.parse(t) : null }
}
const rpc = (token, fn, args) => rest('POST', `/rest/v1/rpc/${fn}`, { token, body: args })
const authorize = async (token, bucket, path, bytes, mime = 'image/jpeg', upsert = false) =>
    (await rpc(token, 'authorize_upload', { p_bucket: bucket, p_path: path, p_bytes: bytes, p_mime: mime, p_upsert: upsert })).body
async function upload(token, bucket, path, buf, { mime = 'image/jpeg', upsert = false } = {}) {
    const r = await fetch(`${API}/storage/v1/object/${bucket}/${path}`, { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': mime, 'cache-control': 'max-age=3600', ...(upsert ? { 'x-upsert': 'true' } : {}) }, body: buf })
    return { status: r.status, body: await r.json().catch(() => null) }
}
async function login(slug) {
    const [p] = (await rest('GET', `/rest/v1/profiles?select=id&%22profileSlug%22=eq.${slug}`, { token: 'service' })).body
    if (!p) throw new Error(`perfil ${slug} não existe no banco local`)
    await fetch(`${API}/auth/v1/admin/users/${p.id}`, { method: 'PUT', headers: SVC, body: JSON.stringify({ password: PASSWORD }) })
    const email = (await (await fetch(`${API}/auth/v1/admin/users/${p.id}`, { headers: SVC })).json()).email
    const r = await fetch(`${API}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }) })
    const j = await r.json()
    if (!j.access_token) throw new Error(`login de ${slug} falhou: ${JSON.stringify(j).slice(0, 120)}`)
    return { id: p.id, token: j.access_token }
}
const removeObject = (bucket, path) => fetch(`${API}/storage/v1/object/${bucket}/${path}`, { method: 'DELETE', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } })

const made = []   // [bucket, path] enviados, para apagar no final
let A, B
try {
    console.log('preparo')
    const n = Number(psql(`select count(*) from pg_policies where schemaname='storage' and tablename='objects' and cmd in ('INSERT','ALL') and policyname not like 'storage\\_insert\\_%'`))
    if (n > 0) {
        psql(`DO $$ DECLARE r record; BEGIN FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND cmd IN ('INSERT','ALL') AND policyname NOT LIKE 'storage\\_insert\\_%' LOOP EXECUTE format('DROP POLICY %I ON storage.objects', r.policyname); END LOOP; END $$`)
        console.log(`  ${n} política(s) antiga(s) de INSERT/ALL do Storage removida(s) do banco LOCAL (a produção já não as tem)`)
    }
    psql(`select public.admin_upload_set_enforced(false, null)`)
    A = await login('cliente-teste'); B = await login('lojista-teste')
    ok(A.id !== B.id, 'duas pessoas de teste com login real')

    console.log('1) interruptor DESLIGADO (o estado de hoje): envio direto sem autorização continua funcionando')
    const p1 = `${A.id}-e2e-direto-${Date.now()}.jpg`
    let r = await upload(A.token, 'avatars', p1, jpeg(20_000)); made.push(['avatars', p1])
    ok(r.status === 200, `envio direto aceito (HTTP ${r.status})`)

    console.log('2) autorizar → enviar → registrar: o arquivo tem o DONO certo e o tamanho vem do Storage')
    const p2 = `${A.id}-e2e-autorizado-${Date.now()}.jpg`
    const a2 = await authorize(A.token, 'avatars', p2, 30_000)
    ok(a2.ok === true && a2.kind === 'avatar' && a2.grant, `autorização concedida (${JSON.stringify(a2).slice(0, 80)})`)
    r = await upload(A.token, 'avatars', p2, jpeg(30_000)); made.push(['avatars', p2])
    ok(r.status === 200, `envio autorizado aceito (HTTP ${r.status})`)
    const owner = psql(`select owner_id from storage.objects where bucket_id='avatars' and name='${p2}'`)
    ok(owner === A.id, `o dono do arquivo no Storage é a pessoa que enviou (${owner.slice(0, 8)}…)`)
    const reg = await rpc(A.token, 'register_media_asset', { p_bucket: 'avatars', p_path: p2 })
    ok(typeof reg.body === 'string', 'arquivo registrado em media_assets')
    const asset = (await rest('GET', `/rest/v1/media_assets?select=owner_id,bytes,mime,kind,state&bucket=eq.avatars&key=eq.${encodeURIComponent(p2)}`, { token: 'service' })).body[0]
    ok(asset && asset.owner_id === A.id && asset.bytes === 30_000 && asset.mime === 'image/jpeg' && asset.kind === 'avatar', `registro com o tamanho REAL (${asset?.bytes} B) e dono certo`)
    const grant = (await rest('GET', `/rest/v1/upload_grants?select=used_at,actual_bytes&id=eq.${a2.grant}`, { token: 'service' })).body[0]
    ok(grant.used_at && grant.actual_bytes === 30_000, 'a autorização foi fechada (usada, com o tamanho real)')

    console.log('3) a autorização recusa o que não pode (resposta da função, sem enviar nada)')
    ok((await authorize(A.token, 'avatars', `${A.id}-e2e-svg.svg`, 100, 'image/svg+xml')).error === 'type_not_allowed', 'SVG recusado')
    ok((await authorize(A.token, 'avatars', `${A.id}-e2e-grande.jpg`, 6 * 1024 * 1024)).error === 'too_large', 'acima de 5 MB recusado')
    ok((await authorize(A.token, 'community-photos', `${B.id}/e2e.jpg`, 100)).error === 'wrong_folder', 'pasta de outra pessoa recusada')
    const anon = await fetch(`${API}/rest/v1/rpc/authorize_upload`, { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_bucket: 'avatars', p_path: 'x.jpg', p_bytes: 1, p_mime: 'image/jpeg', p_upsert: false }) })
    ok(anon.status >= 400, `visitante sem login não consegue pedir autorização (HTTP ${anon.status})`)

    console.log('4) interruptor LIGADO: sem autorização não há envio, com autorização há — só para aquele caminho e só para quem pediu')
    psql(`select public.admin_upload_set_enforced(true, null)`)
    const p4 = `${A.id}-e2e-semaut-${Date.now()}.jpg`
    r = await upload(A.token, 'avatars', p4, jpeg(10_000))
    ok(r.status >= 400 && r.status < 500, `envio direto SEM autorização recusado pelo Storage (HTTP ${r.status}: ${JSON.stringify(r.body)?.slice(0, 70)})`)
    ok(psql(`select count(*) from storage.objects where name='${p4}'`) === '0', 'nenhum arquivo foi gravado')
    const p4b = `${A.id}-e2e-comaut-${Date.now()}.jpg`
    await authorize(A.token, 'avatars', p4b, 10_000)
    r = await upload(A.token, 'avatars', p4b, jpeg(10_000)); made.push(['avatars', p4b])
    ok(r.status === 200, `envio COM autorização aceito (HTTP ${r.status})`)
    r = await upload(A.token, 'avatars', `${A.id}-e2e-outrocaminho-${Date.now()}.jpg`, jpeg(10_000))
    ok(r.status >= 400, 'a autorização vale só para o caminho pedido')
    const p4c = `${A.id}-e2e-roubo-${Date.now()}.jpg`
    await authorize(A.token, 'avatars', p4c, 10_000)
    r = await upload(B.token, 'avatars', p4c, jpeg(10_000))
    ok(r.status >= 400, 'outra pessoa NÃO consegue usar a autorização de alguém')
    const f4 = `${A.id}/e2e-flash-${Date.now()}.jpg`
    r = await upload(A.token, 'community-photos', f4, jpeg(10_000))
    ok(r.status >= 400, 'pasta própria também exige autorização quando ligado')
    await authorize(A.token, 'community-photos', f4, 10_000)
    r = await upload(A.token, 'community-photos', f4, jpeg(10_000)); made.push(['community-photos', f4])
    ok(r.status === 200, 'pasta própria com autorização aceita')

    console.log('5) trocar o arquivo (upsert): registrar fecha a autorização antiga; trocar exige uma nova, e o dono continua sendo a pessoa')
    await rpc(A.token, 'register_media_asset', { p_bucket: 'avatars', p_path: p4b })      // fecha a autorização do passo 4 (estava ainda aberta)
    r = await upload(A.token, 'avatars', p4b, jpeg(12_000), { upsert: true })
    ok(r.status >= 400, `trocar SEM nova autorização é recusado, porque a antiga foi usada (HTTP ${r.status})`)
    await authorize(A.token, 'avatars', p4b, 12_000, 'image/jpeg', true)
    r = await upload(A.token, 'avatars', p4b, jpeg(12_000), { upsert: true })
    ok(r.status === 200, `trocar COM autorização aceito (HTTP ${r.status})`)
    ok(psql(`select owner_id from storage.objects where bucket_id='avatars' and name='${p4b}'`) === A.id, 'depois de trocar, o dono continua sendo a pessoa')
    const b5 = await authorize(B.token, 'avatars', p4b, 100, 'image/jpeg', true)
    ok(b5.error === 'not_owner', 'outra pessoa não consegue autorizar a troca do arquivo de alguém')
    psql(`select public.admin_upload_set_enforced(false, null)`)

    console.log('6) ritmo: o 3º envio da hora é recusado, com "tente de novo em"')
    psql(`select public.admin_upload_update_kind('store_logo', '{"per_hour_files": 2}'::jsonb, null)`)
    const l = (i) => `e2e-logo-${Date.now()}-${i}.jpg`
    ok((await authorize(B.token, 'store-logos', l(1), 1000)).ok === true && (await authorize(B.token, 'store-logos', l(2), 1000)).ok === true, 'dois envios passam')
    const third = await authorize(B.token, 'store-logos', l(3), 1000)
    ok(third.error === 'rate_limited' && third.retry_after > 0 && third.retry_after <= 3600, `o terceiro é recusado (tente de novo em ${third.retry_after}s)`)

    console.log('7) CONCORRÊNCIA: 12 pedidos ao mesmo tempo com o limite de 1 por hora — passa exatamente 1')
    psql(`delete from upload_grants where profile_id='${A.id}' and kind='store_logo'`)
    psql(`select public.admin_upload_update_kind('store_logo', '{"per_hour_files": 1}'::jsonb, null)`)
    const res = await Promise.all(Array.from({ length: 12 }, (_, i) => authorize(A.token, 'store-logos', l(100 + i), 1000)))
    const passes = res.filter((x) => x.ok === true).length
    ok(passes === 1, `exatamente 1 de 12 passou (passaram ${passes}; os outros: ${[...new Set(res.filter((x) => !x.ok).map((x) => x.error))].join(',')})`)
    ok(Number(psql(`select count(*) from upload_grants where profile_id='${A.id}' and kind='store_logo'`)) === 1, 'só 1 autorização foi gravada')
    psql(`select public.admin_upload_update_kind('store_logo', '{"per_hour_files": 30}'::jsonb, null)`)

    console.log('8) bloqueio de pessoa (e levantar)')
    const blk = psql(`select public.admin_upload_block('${B.id}', null, 'teste ponta a ponta', 1, null)`)
    const blocked = await authorize(B.token, 'avatars', `${B.id}-e2e-bloq.jpg`, 1000)
    ok(blocked.error === 'blocked' && /ponta a ponta/.test(blocked.reason), `pessoa bloqueada recebe o motivo ("${blocked.reason}")`)
    ok((await authorize(A.token, 'avatars', `${A.id}-e2e-livre-${Date.now()}.jpg`, 1000)).ok === true, 'quem não foi bloqueado segue enviando')
    psql(`select public.admin_upload_unblock('${blk}', null)`)
    ok((await authorize(B.token, 'avatars', `${B.id}-e2e-livre-${Date.now()}.jpg`, 1000)).ok === true, 'depois de levantar o bloqueio, volta a enviar')

    console.log(`\nTUDO CERTO: ${passed} verificações passaram.`)
} catch (e) {
    console.error(`\n${e.message}`)
    process.exitCode = 1
} finally {
    console.log('\nrestaurando o banco local...')
    try {
        psql(`select public.admin_upload_set_enforced(false, null)`)
        psql(`select public.admin_upload_update_kind('store_logo', '{"per_hour_files": 30}'::jsonb, null)`)
        psql(`update upload_blocks set lifted_at = now() where lifted_at is null and reason = 'teste ponta a ponta'`)
        for (const [b, p] of made) await removeObject(b, p)
        psql(`delete from media_assets where key like '%e2e-%'`)
        psql(`delete from upload_grants where key like '%e2e-%'`)
        console.log('  interruptor desligado, limites originais, bloqueios levantados, arquivos de teste apagados')
    } catch (e2) { console.error('  ATENÇÃO: não consegui restaurar tudo:', e2.message) }
}
