// Limpeza de arquivos sem uso (Camada 6): src/modules/uploads/cleanup.ts, src/lib/uploadCleanup.ts, rota /api/internal/uploads-cleanup, migration 20261130000022. Rodar: npm run test:upload-cleanup
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { validateCleanupPatch, cleanupFormToPatch, cleanupToForm, runSummary, candidateStatus, fileLabel, CLEANUP_DB_FIELD } from '../src/modules/uploads/cleanup.ts'
import { runUploadCleanup, isSafeToRemove } from '../src/lib/uploadCleanup.ts'

const root = path.resolve(import.meta.dirname, '..')
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
const SET = { enabled: false, min_age_days: 3, quarantine_days: 7, max_per_run: 200 }

test('configuração: só campos conhecidos, tipos certos e dentro dos limites', () => {
    const ok = validateCleanupPatch({ enabled: true, min_age_days: 5, quarantine_days: 10, max_per_run: 50 })
    assert.ok(ok.ok); assert.deepEqual(ok.patch, { cleanup_enabled: true, cleanup_min_age_days: 5, cleanup_quarantine_days: 10, cleanup_max_per_run: 50 })
    for (const bad of [{ enabled: 'sim' }, { enabled: 1 }, { min_age_days: 0 }, { min_age_days: 366 }, { quarantine_days: 1.5 }, { max_per_run: 1001 }, { max_per_run: '5' }, { max_per_run: null }, { foo: 1 }, { cleanup_enabled: true }]) {
        assert.equal(validateCleanupPatch(bad).ok, false, JSON.stringify(bad))
    }
    for (const bad of [null, undefined, 'x', 5, [], [1]]) assert.equal(validateCleanupPatch(bad).ok, false)
    assert.deepEqual(Object.keys(CLEANUP_DB_FIELD).sort(), ['enabled', 'max_per_run', 'min_age_days', 'quarantine_days'])
})

test('formulário: ida e volta não muda nada; só o que mudou vai; lixo é recusado', () => {
    const f = cleanupToForm(SET)
    assert.deepEqual(f, { min_age_days: '3', quarantine_days: '7', max_per_run: '200' })
    const same = cleanupFormToPatch(f, SET); assert.ok(same.ok); assert.deepEqual(same.patch, {})
    const one = cleanupFormToPatch({ ...f, quarantine_days: ' 14 ' }, SET); assert.ok(one.ok); assert.deepEqual(one.patch, { quarantine_days: 14 })
    for (const bad of ['', '0', '-1', '1,5', 'abc', '366']) assert.equal(cleanupFormToPatch({ ...f, min_age_days: bad }, SET).ok, false, bad)
    assert.equal(cleanupFormToPatch({ ...f, max_per_run: '1001' }, SET).ok, false)
})

test('textos do painel', () => {
    const b = (n) => `${n} B`
    const run = { started_at: '', source: 'cron', dry_run: true, scanned: 583, marked: 2, cleared: 1, due: 0, deleted: 0, bytes_freed: 0, reconciled: 0, errors: 0, note: null }
    assert.equal(runSummary(run, b), 'Simulação · olhou 583 · marcou 2 · desmarcou 1 · 0 já poderiam ser apagados')
    assert.match(runSummary({ ...run, dry_run: false, deleted: 3, bytes_freed: 99, errors: 1 }, b), /^Apagou de verdade · olhou 583 .* apagou 3 \(99 B\) · 1 erro\(s\)$/)
    assert.equal(candidateStatus({ keep: true, due: false, days_left: 3 }), 'Mantido: nunca será apagado')
    assert.equal(candidateStatus({ keep: false, due: true, days_left: 0 }), 'Pronto para apagar na próxima rodada')
    assert.equal(candidateStatus({ keep: false, due: false, days_left: 1 }), 'Em quarentena: 1 dia para poder apagar')
    assert.equal(candidateStatus({ keep: false, due: false, days_left: 5 }), 'Em quarentena: 5 dias para poder apagar')
    assert.equal(fileLabel('abc/def/foto.jpg'), 'foto.jpg'); assert.equal(fileLabel('foto.jpg'), 'foto.jpg')
    assert.equal(fileLabel('e4930b16-9d4f-4675-8aa8-211f7ce3f721-1793668635106.jpg'), '…1f7ce3f721-1793668635106.jpg')
})

test('nome seguro para apagar: bucket e caminho conferidos de novo antes de ir à API', () => {
    assert.ok(isSafeToRemove({ bucket: 'avatars', key: 'u1-1700.jpg' }))
    assert.ok(isSafeToRemove({ bucket: 'flash-media', key: '11111111-2222/abc.mp4' }))
    for (const bad of [{ bucket: 'Avatars', key: 'a.jpg' }, { bucket: '../x', key: 'a.jpg' }, { bucket: 'avatars', key: '../a.jpg' }, { bucket: 'avatars', key: 'a/../b.jpg' }, { bucket: 'avatars', key: '/a.jpg' },
        { bucket: 'avatars', key: 'a b.jpg' }, { bucket: 'avatars', key: 'a*.jpg' }, { bucket: 'avatars', key: '' }, { bucket: '', key: 'a.jpg' }, { bucket: 'avatars', key: 5 }, { bucket: null, key: 'a.jpg' }, { bucket: 'avatars', key: 'a'.repeat(401) }]) {
        assert.equal(isSafeToRemove(bad), false, JSON.stringify(bad))
    }
})

// cliente de mentira: registra o que a rotina pediu
function fake({ enabled = true, max = 200, due = [], scan = { scanned: 10, marked: 1, cleared: 0 }, dueError = null, removeError = null, confirm = null, removeThrows = false } = {}) {
    const calls = [], removed = []
    const client = {
        async rpc(fn, args) {
            calls.push([fn, args])
            switch (fn) {
                case 'admin_upload_cleanup_settings': return { data: { enabled, max_per_run: max, min_age_days: 3, quarantine_days: 7 }, error: null }
                case 'media_assets_reconcile': return { data: 0, error: null }
                case 'upload_cleanup_scan': return { data: scan, error: null }
                case 'upload_cleanup_due': return dueError ? { data: null, error: dueError } : { data: due, error: null }
                case 'upload_cleanup_confirm': return { data: confirm ? [confirm(args)] : [{ deleted: args.p_ids.length, bytes: 100 * args.p_ids.length }], error: null }
                case 'upload_cleanup_record_run': return { data: 'run-id', error: null }
            }
            return { data: null, error: { message: 'rpc inesperada ' + fn } }
        },
        storage: { from: (bucket) => ({ async remove(paths) { if (removeThrows) throw new Error('rede caiu'); removed.push([bucket, paths]); return { data: null, error: removeError } } }) },
    }
    return { client, calls, removed, names: () => calls.map((c) => c[0]) }
}
const files = (n, bucket = 'avatars') => Array.from({ length: n }, (_, i) => ({ id: `id${bucket}${i}`, bucket, key: `f${i}.jpg`, bytes: 100 }))

test('desligada: procura e marca, mas NÃO apaga nada (simulação)', async () => {
    const f = fake({ enabled: false, due: files(3) })
    const r = await runUploadCleanup(f.client, { source: 'cron' })
    assert.equal(r.dryRun, true); assert.equal(r.enabled, false); assert.equal(r.due, 3); assert.equal(r.deleted, 0); assert.equal(r.wouldFreeBytes, 300); assert.equal(r.ok, true)
    assert.equal(f.removed.length, 0); assert.ok(!f.names().includes('upload_cleanup_confirm'))
    const rec = f.calls.find((c) => c[0] === 'upload_cleanup_record_run')[1]; assert.equal(rec.p_dry, true); assert.equal(rec.p_source, 'cron'); assert.equal(rec.p_stats.due, 3)
})

test('ligada mas pedida como simulação: também não apaga', async () => {
    const f = fake({ enabled: true, due: files(2) })
    const r = await runUploadCleanup(f.client, { source: 'admin', dryRun: true })
    assert.equal(r.dryRun, true); assert.equal(f.removed.length, 0); assert.equal(r.deleted, 0)
})

test('ligada: apaga pela API do Storage, por bucket, e só então confirma ao banco', async () => {
    const f = fake({ enabled: true, due: [...files(2, 'avatars'), ...files(1, 'flash-media')] })
    const r = await runUploadCleanup(f.client, { source: 'cron' })
    assert.equal(r.dryRun, false); assert.equal(r.deleted, 3); assert.equal(r.bytesFreed, 300); assert.equal(r.errors, 0); assert.equal(r.ok, true)
    assert.deepEqual(f.removed, [['avatars', ['f0.jpg', 'f1.jpg']], ['flash-media', ['f0.jpg']]])
    const names = f.names(); assert.ok(names.indexOf('upload_cleanup_confirm') > names.indexOf('upload_cleanup_due'))
    assert.deepEqual(f.calls.filter((c) => c[0] === 'upload_cleanup_confirm').map((c) => c[1].p_ids), [['idavatars0', 'idavatars1'], ['idflash-media0']])
    assert.equal(f.calls.find((c) => c[0] === 'upload_cleanup_record_run')[1].p_dry, false)
})

test('lotes de no máximo 100 por chamada ao Storage', async () => {
    const f = fake({ enabled: true, max: 1000, due: files(250) })
    const r = await runUploadCleanup(f.client, { source: 'cron' })
    assert.deepEqual(f.removed.map((x) => x[1].length), [100, 100, 50]); assert.equal(r.deleted, 250)
})

test('limite por rodada: o do banco, nunca acima de 1000', async () => {
    const f = fake({ enabled: true, max: 5000, due: files(1) })
    await runUploadCleanup(f.client, { source: 'cron' })
    assert.equal(f.calls.find((c) => c[0] === 'upload_cleanup_scan')[1].p_limit, 1000)
    assert.equal(f.calls.find((c) => c[0] === 'upload_cleanup_due')[1].p_limit, 1000)
    const g = fake({ enabled: true, max: 7, due: files(20) })   // se o banco devolver mais que o limite, a rotina corta
    const r = await runUploadCleanup(g.client, { source: 'cron' })
    assert.equal(r.due, 7); assert.equal(g.removed.flatMap((x) => x[1]).length, 7)
})

test('nome fora do padrão seguro nunca chega à API de apagar', async () => {
    const f = fake({ enabled: true, due: [{ id: 'a', bucket: 'avatars', key: '../outro/segredo.jpg', bytes: 5 }, { id: 'b', bucket: 'avatars', key: 'ok.jpg', bytes: 5 }, { id: 'c', bucket: 'Bad Bucket', key: 'x.jpg', bytes: 5 }] })
    const r = await runUploadCleanup(f.client, { source: 'cron' })
    assert.deepEqual(f.removed, [['avatars', ['ok.jpg']]]); assert.equal(r.deleted, 1); assert.equal(r.ok, false); assert.ok(r.notes.some((n) => /fora do padrão seguro/.test(n)))
})

test('disjuntor do banco: a rodada para, nada é apagado e o erro aparece em português', async () => {
    const f = fake({ enabled: true, dueError: { code: 'P0001', message: 'circuit_breaker: 45 de 100 arquivos (45%) apareceram como sem uso de uma vez' } })
    const r = await runUploadCleanup(f.client, { source: 'cron' })
    assert.equal(r.ok, false); assert.equal(r.deleted, 0); assert.equal(f.removed.length, 0)
    assert.match(r.notes[0], /^Disjuntor acionado: 45 de 100 arquivos .* Nada foi apagado\.$/)
    assert.ok(f.names().includes('upload_cleanup_record_run'), 'a rodada fica registrada mesmo assim')
})

test('erro do Storage: não vira "apagado"; o banco só confirma o que sumiu (e a rotina diz o que sobrou)', async () => {
    const f = fake({ enabled: true, due: files(3), removeError: { message: 'timeout' }, confirm: () => ({ deleted: 0, bytes: 0 }) })
    const r = await runUploadCleanup(f.client, { source: 'cron' })
    assert.equal(r.deleted, 0); assert.equal(r.ok, false); assert.equal(r.errors, 1); assert.ok(r.notes.some((n) => /continuam no Storage/.test(n)))
    const g = fake({ enabled: true, due: files(2), removeThrows: true, confirm: () => ({ deleted: 0, bytes: 0 }) })
    const r2 = await runUploadCleanup(g.client, { source: 'cron' })
    assert.equal(r2.deleted, 0); assert.equal(r2.ok, false); assert.ok(r2.notes.some((n) => /rede caiu/.test(n)))
})

test('sem conseguir ler a configuração: não faz nada', async () => {
    const client = { async rpc() { return { data: null, error: { message: 'falhou' } } }, storage: { from() { throw new Error('não podia chegar aqui') } } }
    const r = await runUploadCleanup(client, { source: 'cron' })
    assert.equal(r.ok, false); assert.equal(r.deleted, 0)
})

test('a rota agendada falha fechada e não usa nada da requisição além do cabeçalho', () => {
    const route = read('src/app/api/internal/uploads-cleanup/route.ts')
    assert.match(route, /secret\.length < 16/); assert.match(route, /status: 503/); assert.match(route, /status: 401/); assert.match(route, /timingSafeEqual/)
    assert.ok(route.indexOf('status: 503') < route.indexOf('runUploadCleanup('), 'confere a senha antes de rodar')
    assert.ok(!/req\.(json|text|formData)|searchParams|new URL\(/.test(route), 'nada do corpo nem da URL é usado')
    assert.match(route, /source: 'cron'/); assert.ok(!/dryRun/.test(route), 'quem decide apagar é a chave do painel, não a chamada')
    const vercel = JSON.parse(read('vercel.json'))
    assert.deepEqual(vercel.crons.map((c) => c.path), ['/api/internal/uploads-cleanup'])
})

test('a rota do painel: ações novas só do admin geral, id do admin nunca vem do corpo', () => {
    const route = read('src/app/api/admin/uploads/route.ts')
    assert.ok(route.indexOf('requireSuperAdmin') < route.indexOf("action === 'cleanup_run'"))
    for (const a of ['cleanup_run', 'cleanup_keep', 'cleanup_settings']) assert.ok(route.includes(`action === '${a}'`), a)
    assert.match(route, /source: 'admin'/)
    assert.ok(!/p_admin: body/.test(route))
})

test('migration: só serviço, nunca DELETE direto no Storage, nasce desligada e com os tipos sensíveis protegidos', () => {
    const sql = read('supabase/migrations/20261130000022_upload_cleanup.sql')
    assert.ok(!/DELETE\s+FROM\s+storage\./i.test(sql), 'o Storage proíbe e a regra é apagar pela API')
    assert.match(sql, /cleanup_enabled\s+boolean NOT NULL DEFAULT false/)
    for (const fn of ['upload_cleanup_scan', 'upload_cleanup_due', 'upload_cleanup_confirm', 'upload_cleanup_record_run', 'media_assets_reconcile', 'admin_upload_cleanup_overview', 'admin_upload_cleanup_keep', 'admin_upload_cleanup_settings'])
        assert.match(sql, new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\) FROM PUBLIC, anon, authenticated`), fn)
    const eligible = sql.match(/WHERE kind IN \(([^)]*)\)/)[1]
    for (const k of ['delivery_proof', 'digital_file', 'ride_object_photo']) assert.ok(!eligible.includes(k), `${k} nunca entra na limpeza`)
    assert.ok(fs.existsSync(path.join(root, 'supabase/rollbacks/upload_cleanup_rollback.sql')))
})
