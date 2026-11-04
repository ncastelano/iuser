// Painel Admin → Uploads (src/modules/uploads/admin.ts, rota /api/admin/uploads, migration 20261130000021). Rodar: npm run test:upload-admin
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
    parseMegabytes, parseCount, kindToForm, formToPatch, diffLimits, checkLimits, validatePatch, limitText, validateBlock, denialLabel, DENIAL_LABEL, ABUSE_CODES,
    BLOCK_DURATIONS, LIMIT_FIELDS, FIELD_LABEL, meterPct, meterTone, mbText,
} from '../src/modules/uploads/admin.ts'
import { MB } from '../src/lib/uploadLimits.ts'

const root = path.resolve(import.meta.dirname, '..')
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
const CUR = { enabled: true, requires_plan: false, max_bytes: 5 * MB, per_hour_files: 20, per_day_bytes: 50 * MB, per_user_bytes: 200 * MB, grant_minutes: 15 }
const uuid = '11111111-2222-4333-8444-555555555555'

test('MB digitado vira bytes; vazio é "sem limite"; lixo é inválido', () => {
    assert.equal(parseMegabytes('5'), 5 * MB)
    assert.equal(parseMegabytes('1,5'), Math.round(1.5 * MB))
    assert.equal(parseMegabytes(' 0.5 '), Math.round(0.5 * MB))
    assert.equal(parseMegabytes(''), null)
    assert.equal(parseMegabytes('   '), null)
    for (const bad of ['0', '-1', 'abc', '1,2,3', '5 MB', '1e3', '.5']) assert.equal(parseMegabytes(bad), 'invalid', bad)
    assert.equal(parseCount('20'), 20); assert.equal(parseCount(''), null)
    for (const bad of ['0', '-3', '1.5', '2,5', 'x']) assert.equal(parseCount(bad), 'invalid', bad)
    assert.equal(mbText(5 * MB), '5'); assert.equal(mbText(Math.round(1.5 * MB)), '1,5'); assert.equal(mbText(null), '')
})

test('formulário ↔ valores: ida e volta não muda nada, e só o que mudou vai no patch', () => {
    const f = kindToForm(CUR)
    assert.deepEqual(f, { enabled: true, requires_plan: false, max_mb: '5', per_hour_files: '20', per_day_mb: '50', per_user_mb: '200', grant_minutes: '15' })
    const same = formToPatch(f, CUR)
    assert.ok(same.ok); assert.deepEqual(same.patch, {})
    const one = formToPatch({ ...f, per_hour_files: '40' }, CUR)
    assert.ok(one.ok); assert.deepEqual(one.patch, { per_hour_files: 40 })
    const many = formToPatch({ ...f, enabled: false, per_day_mb: '', max_mb: '8' }, CUR)
    assert.ok(many.ok); assert.deepEqual(many.patch, { enabled: false, per_day_bytes: null, max_bytes: 8 * MB })
    const free = formToPatch({ ...f, per_hour_files: '', per_user_mb: '' }, CUR)
    assert.ok(free.ok); assert.deepEqual(free.patch, { per_hour_files: null, per_user_bytes: null }, 'vazio vira "sem limite" (null)')
    assert.deepEqual(kindToForm({ ...CUR, per_hour_files: null, per_day_bytes: null, per_user_bytes: null }), { ...f, per_hour_files: '', per_day_mb: '', per_user_mb: '' })
})

test('o formulário recusa cada erro, com a mensagem no campo certo', () => {
    const f = kindToForm(CUR)
    const err = (patch) => { const r = formToPatch({ ...f, ...patch }, CUR); assert.equal(r.ok, false); return r.errors }
    assert.ok(err({ max_mb: '' }).max_bytes); assert.ok(err({ max_mb: '0' }).max_bytes); assert.ok(err({ max_mb: 'x' }).max_bytes)
    assert.ok(err({ max_mb: '20000' }).max_bytes, 'acima de 10 GB é provável erro de digitação')
    assert.ok(err({ per_hour_files: '0' }).per_hour_files); assert.ok(err({ per_hour_files: '1,5' }).per_hour_files)
    assert.ok(err({ per_day_mb: '-3' }).per_day_bytes); assert.ok(err({ per_user_mb: 'abc' }).per_user_bytes)
    assert.ok(err({ grant_minutes: '0' }).grant_minutes); assert.ok(err({ grant_minutes: '241' }).grant_minutes); assert.ok(err({ grant_minutes: '' }).grant_minutes)
    assert.ok(err({ per_day_mb: '4' }).per_day_bytes, 'o dia precisa caber um arquivo do tamanho máximo (5 MB)')
    assert.ok(err({ per_user_mb: '40' }).per_user_bytes, 'o total precisa ser ao menos o do dia (50 MB)')
    assert.ok(err({ per_day_mb: '', per_user_mb: '4' }).per_user_bytes, 'sem limite do dia, o total ainda precisa caber um arquivo')
    assert.ok(Object.keys(err({ max_mb: 'x', per_hour_files: '0' })).length === 2, 'mostra todos os erros de uma vez')
    assert.ok(formToPatch({ ...f, per_day_mb: '5' }, CUR).ok, 'exatamente um arquivo por dia é aceito')
})

test('servidor: o corpo é conferido campo a campo (tipo certo, só campos permitidos) e o resultado precisa ser coerente', () => {
    assert.deepEqual(validatePatch({ per_hour_files: 40 }, CUR), { ok: true, patch: { per_hour_files: 40 } })
    assert.deepEqual(validatePatch({ per_day_bytes: null, enabled: false }, CUR), { ok: true, patch: { per_day_bytes: null, enabled: false } })
    assert.deepEqual(validatePatch({}, CUR), { ok: true, patch: {} })
    for (const raw of [null, 'x', 5, [], undefined]) assert.equal(validatePatch(raw, CUR).ok, false, String(raw))
    for (const bad of [{ bucket: 'outro' }, { provider: 'r2' }, { kind: 'x' }, { mime_types: [] }, { __proto__: 1, id: 'x' }]) assert.equal(validatePatch(bad, CUR).ok, false, JSON.stringify(bad))
    assert.equal(validatePatch({ enabled: 'sim' }, CUR).ok, false); assert.equal(validatePatch({ requires_plan: 1 }, CUR).ok, false)
    assert.equal(validatePatch({ max_bytes: '5' }, CUR).ok, false, 'tamanho precisa ser número'); assert.equal(validatePatch({ max_bytes: null }, CUR).ok, false)
    assert.equal(validatePatch({ per_hour_files: '40' }, CUR).ok, false); assert.equal(validatePatch({ per_hour_files: Number.NaN }, CUR).ok, false)
    assert.equal(validatePatch({ max_bytes: 100 * MB }, CUR).ok, false, 'o dia (50 MB) não cabe um arquivo de 100 MB: a coerência vale sobre o resultado final')
    assert.equal(validatePatch({ per_user_bytes: 10 * MB }, CUR).ok, false)
    assert.equal(validatePatch({ per_day_bytes: 0 }, CUR).ok, false)
    assert.equal(validatePatch({ grant_minutes: 500 }, CUR).ok, false)
    assert.deepEqual(validatePatch({ max_bytes: 100 * MB, per_day_bytes: 500 * MB, per_user_bytes: 2000 * MB }, CUR).ok, true, 'mudar vários juntos é avaliado junto')
})

test('conferência de coerência e diferença entre dois conjuntos de limites', () => {
    assert.deepEqual(checkLimits(CUR), {})
    assert.deepEqual(checkLimits({ ...CUR, per_hour_files: null, per_day_bytes: null, per_user_bytes: null }), {}, 'tudo sem limite é válido')
    assert.ok(checkLimits({ ...CUR, max_bytes: 0 }).max_bytes)
    assert.deepEqual(diffLimits(CUR, CUR), {})
    assert.deepEqual(diffLimits(CUR, { ...CUR, enabled: false, grant_minutes: 30 }), { enabled: false, grant_minutes: 30 })
    assert.deepEqual([...LIMIT_FIELDS].sort(), ['enabled', 'grant_minutes', 'max_bytes', 'per_day_bytes', 'per_hour_files', 'per_user_bytes', 'requires_plan'])
    for (const f of LIMIT_FIELDS) assert.ok(FIELD_LABEL[f], f)
})

test('textos dos limites', () => {
    assert.equal(limitText('max_bytes', 5 * MB), '5 MB'); assert.equal(limitText('per_user_bytes', 3 * 1024 * MB), '3 GB')
    assert.equal(limitText('per_hour_files', 20), '20 por hora'); assert.equal(limitText('per_hour_files', null), 'sem limite')
    assert.equal(limitText('grant_minutes', 15), '15 min'); assert.equal(limitText('enabled', true), 'sim'); assert.equal(limitText('requires_plan', false), 'não')
    assert.equal(limitText('per_day_bytes', Math.round(1.5 * MB)), '1,5 MB')
})

test('bloqueio: pessoa, tipo ou os dois; duração e motivo conferidos', () => {
    assert.deepEqual(validateBlock({ profile_id: uuid, kind: null, hours: 24, reason: '  spam ' }), { ok: true, value: { profile_id: uuid, kind: null, hours: 24, reason: 'spam' } })
    assert.deepEqual(validateBlock({ kind: 'avatar' }), { ok: true, value: { profile_id: null, kind: 'avatar', hours: null, reason: null } })
    assert.deepEqual(validateBlock({ profile_id: uuid, kind: 'flash_media', hours: null }), { ok: true, value: { profile_id: uuid, kind: 'flash_media', hours: null, reason: null } })
    assert.equal(validateBlock({}).ok, false, 'sem pessoa e sem tipo bloquearia ninguém/tudo')
    assert.equal(validateBlock({ profile_id: 'x' }).ok, false); assert.equal(validateBlock({ profile_id: uuid, kind: 'Avatar!' }).ok, false)
    for (const h of [0, -1, 1.5, 24 * 366]) assert.equal(validateBlock({ profile_id: uuid, hours: h }).ok, false, String(h))
    assert.equal(validateBlock({ profile_id: uuid, reason: 'x'.repeat(301) }).ok, false)
    assert.equal(validateBlock({ profile_id: uuid, reason: 'x'.repeat(300) }).ok, true)
    assert.deepEqual(BLOCK_DURATIONS.map((d) => d.hours), [1, 24, 168, 720, null]); assert.ok(BLOCK_DURATIONS.at(-1).label.includes('liberar'))
})

test('todo motivo de recusa que o banco pode devolver tem texto em português', () => {
    const sql = read('supabase/migrations/20261130000020_upload_authorization.sql')
    const codes = [...new Set([...sql.matchAll(/'error', '([a-z_]+)'/g)].map((m) => m[1]))].filter((c) => c !== 'not_authenticated')   // "sem login" nunca é anotado
    assert.ok(codes.length >= 13, `${codes.length} códigos`)
    for (const c of codes) assert.ok(DENIAL_LABEL[c] && denialLabel(c) !== c, `sem texto para ${c}`)
    assert.equal(denialLabel('codigo_novo'), 'codigo_novo', 'código desconhecido aparece como está, nunca some')
    for (const c of ABUSE_CODES) assert.ok(DENIAL_LABEL[c], `abuso ${c} sem texto`)
    assert.ok(ABUSE_CODES.has('rate_limited') && !ABUSE_CODES.has('type_not_allowed'), 'formato errado é erro de uso, não abuso')
})

test('alerta da cota do Supabase: 80% avisa e 90% alerta', () => {
    const m = (used) => ({ label: 'x', used, included: 100, unit: 'GB' })
    assert.equal(meterPct(m(50)), 50); assert.equal(meterPct({ label: 'x', used: 5, included: 0, unit: 'GB' }), 0)
    assert.equal(meterTone(79.9), 'ok'); assert.equal(meterTone(80), 'warn'); assert.equal(meterTone(89.9), 'warn'); assert.equal(meterTone(90), 'danger'); assert.equal(meterTone(250), 'danger')
})

test('a rota: só o admin geral, o id do admin vem do login (nunca do corpo) e só funções do serviço escrevem', () => {
    const r = read('src/app/api/admin/uploads/route.ts')
    assert.match(r, /const admin = await requireSuperAdmin\(req\)\s*\n\s*if \(!admin\) return NextResponse\.json\(\{ error: 'Sem permissão' \}, \{ status: 403 \}\)/)
    assert.ok(!/body\.(admin|p_admin|changed_by|created_by)/.test(r), 'o id do admin nunca é lido do corpo')
    assert.equal((r.match(/p_admin: admin\.id/g) || []).length, 9, 'as 9 escritas levam o admin do login (4 da Camada 5 + manter e configuração da limpeza + 3 da válvula: configurar, liberar e estágio)')
    for (const fn of ['admin_upload_overview', 'admin_upload_top_owners', 'admin_upload_denials', 'admin_upload_set_enforced', 'admin_upload_block', 'admin_upload_unblock', 'admin_upload_update_kind']) assert.ok(r.includes(`'${fn}'`), fn)
    assert.match(r, /validatePatch\(body\.patch/); assert.match(r, /validateBlock\(/)
    assert.match(r, /v\.value\.profile_id === admin\.id/, 'o admin não bloqueia a si mesmo')
    assert.match(r, /typeof body\.on !== 'boolean'/)
    assert.match(r, /'Cache-Control': 'no-store'/)
    assert.ok(!/NextResponse\.json\(\{[^}]*\bkey\b|service_role|SERVICE_ROLE/i.test(r), 'nada de chave na resposta')
})

test('a tela está registrada no painel e usa a rota e o módulo (sem regra duplicada)', () => {
    const d = read('src/components/AdminDashboard/AdminDashboard.tsx')
    assert.match(d, /import UploadsSection from '\.\/UploadsSection'/); assert.match(d, /\| 'uploads'/); assert.match(d, /\{ id: 'uploads', label: 'Uploads', icon: UploadCloud \}/)
    assert.match(d, /section === 'uploads' && <UploadsSection cardStyle=\{cardStyle\} colors=\{colors\} \/>/)
    const u = read('src/components/AdminDashboard/UploadsSection.tsx')
    assert.match(u, /callAdminApi<Loaded>\('\/api\/admin\/uploads'/); assert.match(u, /from '@\/modules\/uploads'/)
    for (const a of ['set_enforced', 'block', 'unblock', 'update_kind', 'top']) assert.ok(u.includes(`'${a}'`), a)
    assert.ok(!/MB\s*=\s*1024|\* 1024 \* 1024/.test(u), 'a tela não refaz conta de tamanho')
})

test('migration: leituras do painel só do serviço, embrulho transparente e anotação que nunca quebra a autorização', () => {
    const s = read('supabase/migrations/20261130000021_upload_admin.sql')
    for (const f of ['admin_upload_overview()', 'admin_upload_top_owners(text, integer)', 'admin_upload_denials(integer, integer)']) {
        const e = f.replace(/[()]/g, '\\$&')
        assert.match(s, new RegExp(`REVOKE ALL ON FUNCTION public\\.${e} FROM PUBLIC, anon, authenticated;\\s*GRANT EXECUTE ON FUNCTION public\\.${e} TO service_role;`), f)
    }
    assert.match(s, /REVOKE ALL ON FUNCTION public\._authorize_upload_core\(text, text, bigint, text, boolean\) FROM PUBLIC, anon, authenticated/)
    assert.match(s, /REVOKE ALL ON public\.upload_denials FROM anon, authenticated/)
    assert.match(s, /EXCEPTION WHEN OTHERS THEN\s*\n\s*NULL;/, 'anotar nunca levanta erro')
    assert.match(s, /COALESCE\(r->>'error', ''\) <> 'not_authenticated'/)
    assert.match(read('supabase/rollbacks/upload_admin_rollback.sql'), /RENAME TO authorize_upload/)
    assert.match(read('supabase/tests/upload_admin_scenarios.sql'), /OK 7/)
})
