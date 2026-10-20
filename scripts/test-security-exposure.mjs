// Guarda permanente contra exposição de dados privados (Etapa 2.7.1). Varre o código e as migrations:
//  - as listas de colunas públicas do app (src/lib/publicColumns.ts) são IGUAIS às liberadas no banco (migration B2);
//  - nenhuma coluna privada (Pix, e-mail, CPF/CNPJ, telefone, endereço, coordenadas, saldos...) está na lista pública;
//  - nenhum código lê profiles/stores com select('*') nem pede coluna privada (nem filtra/ordena por ela) — o dono
//    usa my_profile / my_stores, e terceiros usam as RPCs com vínculo;
//  - nada imprime Pix/CPF em log.
// A prova no banco (anon, estranho, dono, views, funções, realtime) é supabase/tests/security_exposure_scenarios.sql.
// Rodar: npm run test:security-exposure
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repo = path.resolve(import.meta.dirname, '..')
const srcRoot = path.join(repo, 'src')
function walk(dir, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name)
        if (e.isDirectory()) walk(p, out)
        else if (/\.(ts|tsx)$/.test(e.name)) out.push(p)
    }
    return out
}
const files = walk(srcRoot)
const read = (f) => fs.readFileSync(f, 'utf8')
const rel = (f) => path.relative(repo, f)

const PRIVATE_PROFILE = ['whatsapp', 'address', 'address_number', 'address_complement', 'location', 'store_lat', 'store_lng',
    'cart_data', 'pix_key', 'pix_key_type', 'email', 'cpf_cnpj', 'is_admin', 'is_blocked', 'blocked_reason', 'last_login_at',
    'available_balance', 'total_earnings', 'total_sales', 'direct_sales', 'notification_preferences', 'privacy_settings',
    'updated_at', 'preferred_version', 'team_id', 'breakaway_team_id', 'is_breakaway_leader', 'qualified_at',
    'breakaway_qualified_at', 'can_generate_store_codes', 'store_codes_granted_by', 'store_codes_granted_at', 'scheduling_activated_at']
const PRIVATE_STORE = ['whatsapp', 'pix_key', 'pix_key_type', 'whatsapp_bot_opt_in', 'whatsapp_bot_phone_number_id',
    'whatsapp_bot_display_number', 'whatsapp_bot_connected_at', 'whatsapp_bot_requested_number', 'whatsapp_bot_status',
    'access_granted_at', 'access_expires_at', 'access_source', 'access_grant_id']

function arrayFrom(src, name) {
    const m = src.match(new RegExp(`${name}\\s*(?:text\\[\\])?\\s*:?=\\s*ARRAY\\[([\\s\\S]*?)\\]`))
    assert.ok(m, `lista ${name} não encontrada`)
    return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
}
const lockdown = read(path.join(repo, 'supabase/migrations/20261105000000_exposure_lockdown.sql'))
// colunas liberadas por migrations posteriores à trava (redes sociais): entram nas duas listas
const social = read(path.join(repo, 'supabase/migrations/20261109000000_social_links_columns.sql'))
const socialCols = arrayFrom(social, 'social_cols')
const dbProfilePublic = [...arrayFrom(lockdown, 'profile_public'), ...socialCols]
const linksMig = read(path.join(repo, 'supabase/migrations/20261113000000_store_links.sql'))
const dbStorePublic = [...arrayFrom(lockdown, 'store_public'), ...socialCols, ...arrayFrom(linksMig, 'links_cols')]

const pc = read(path.join(srcRoot, 'lib/publicColumns.ts'))
function tsList(name) {
    const m = pc.match(new RegExp(`export const ${name}\\s*=\\s*'([^']+)'`))
    assert.ok(m, `${name} não encontrada em publicColumns.ts (precisa ser UMA literal)`)
    return m[1].split(', ')
}
const appProfilePublic = tsList('PROFILE_PUBLIC_SELECT')
const appStorePublic = tsList('STORE_PUBLIC_SELECT')

test('as colunas públicas do app são as mesmas do banco (profiles e stores)', () => {
    assert.deepEqual([...appProfilePublic].sort(), [...dbProfilePublic].sort())
    assert.deepEqual([...appStorePublic].sort(), [...dbStorePublic].sort())
})

test('nenhuma coluna privada está na lista pública', () => {
    for (const c of PRIVATE_PROFILE) assert.ok(!dbProfilePublic.includes(c), `profiles.${c} não pode ser público`)
    for (const c of PRIVATE_STORE) assert.ok(!dbStorePublic.includes(c), `stores.${c} não pode ser público`)
})

// ---- varredura do código ----
function statementAfter(src, idx) {
    // o encadeamento da consulta: até a primeira linha em branco ou até 900 caracteres
    const tail = src.slice(idx, idx + 900)
    const cut = tail.search(/\n\s*\n/)
    return cut > 0 ? tail.slice(0, cut) : tail
}
function resolveConst(src, name) {
    const m = src.match(new RegExp(`const\\s+${name}\\s*=\\s*(\`[^\`]*\`|'[^']*'|"[^"]*")`))
    return m ? m[1].slice(1, -1) : null
}
function splitTopLevel(s) {
    const parts = []
    let depth = 0
    let cur = ''
    for (const ch of s) {
        if (ch === '(') depth++
        if (ch === ')') depth--
        if (ch === ',' && depth === 0) { parts.push(cur); cur = '' } else cur += ch
    }
    if (cur.trim()) parts.push(cur)
    return parts.map((x) => x.trim()).filter(Boolean)
}
function columnsOf(selectStr, relPublic) {
    const bad = []
    for (let part of splitTopLevel(selectStr.replace(/\s+/g, ' '))) {
        if (/\(/.test(part)) continue // relação embutida (outra tabela): tratada na varredura de embeds
        part = part.replace(/^\w+:/, '').replace(/::\w+$/, '').replace(/"/g, '').trim()
        if (part === '*') { bad.push('*'); continue }
        if (part && !relPublic.includes(part)) bad.push(part)
    }
    return bad
}

const OFFENDERS = { profiles: [], stores: [] }
const info = { profiles: { pub: appProfilePublic, priv: PRIVATE_PROFILE }, stores: { pub: appStorePublic, priv: PRIVATE_STORE } }

// Colunas que NÃO existem no banco (consultas antigas que já falhavam antes desta etapa; fora do escopo de segurança).
const NONEXISTENT = { profiles: ['phone'], stores: ['opening_hours'] }
for (const t of Object.keys(NONEXISTENT)) info[t].pub = [...info[t].pub, ...NONEXISTENT[t]]

for (const f of files) {
    const src = read(f)
    // Rotas/serviços do servidor com service role (supabaseAdmin) leem o que precisam; o navegador não passa por aqui.
    if (/\bsupabaseAdmin\b|\badmin:\s*SupabaseClient\b/.test(src)) continue
    for (const table of ['profiles', 'stores']) {
        const re = new RegExp(`\\.from\\(\\s*['"]${table}['"]\\s*\\)`, 'g')
        for (const m of src.matchAll(re)) {
            const line = src.slice(0, m.index).split('\n').length
            const stmt = statementAfter(src, m.index + m[0].length)
            const sel = stmt.match(/^\s*\.select\(\s*(`[^`]*`|'[^']*'|"[^"]*"|[A-Za-z_][\w.]*)\s*(?:,\s*\{([^}]*)\})?\s*\)/)
            if (sel) {
                let arg = sel[1]
                const opts = sel[2] || ''
                let text
                if (/^[`'"]/.test(arg)) text = arg.slice(1, -1)
                else if (/^(PROFILE|STORE)_PUBLIC_SELECT$/.test(arg)) text = null // lista pública oficial
                else text = resolveConst(src, arg)
                if (text !== null) {
                    if (text === undefined || text === null) { OFFENDERS[table].push(`${rel(f)}:${line} select não resolvido (${arg})`); continue }
                    if (/head:\s*true/.test(opts) && text.trim() === '*') continue // só contagem
                    for (const c of columnsOf(text, info[table].pub)) OFFENDERS[table].push(`${rel(f)}:${line} select ${table}.${c}`)
                }
            }
            // upsert no navegador: INSERT ... ON CONFLICT DO UPDATE exige SELECT nas colunas privadas e devolve 403 (cadastro e "Definir local"
            // quebraram assim em 18/10). Use saveOwnProfile (src/lib/saveOwnProfile.ts) = UPDATE, com INSERT se a linha ainda não existir.
            if (/^\s*\.upsert\(/.test(stmt)) OFFENDERS[table].push(`${rel(f)}:${line} upsert em ${table} (use saveOwnProfile / update)`)
            // gravar e pedir de volta coluna PRIVADA (.update/.insert(...).select('address, ...')) também dá 403
            if (/^\s*\.(update|insert)\(/.test(stmt)) {
                const back = stmt.match(/\)\s*(?:\.eq\([^)]*\)\s*)*\.select\(\s*['"`]([^'"`]*)['"`]/)
                if (back) for (const c of back[1].split(',').map((x) => x.trim().split(':').pop())) if (info[table].priv.includes(c)) OFFENDERS[table].push(`${rel(f)}:${line} ${table}.${c} pedida de volta após gravar (coluna privada; use my_profile/my_stores)`)
            }
            // filtros/ordem por coluna privada = oráculo (mesmo sem selecionar a coluna)
            for (const fm of stmt.matchAll(/\.(?:eq|neq|in|ilike|like|is|gt|gte|lt|lte|order|contains|not)\(\s*['"]([\w".]+)['"]/g)) {
                const col = fm[1].replace(/"/g, '')
                if (info[table].priv.includes(col)) OFFENDERS[table].push(`${rel(f)}:${line} filtra/ordena ${table}.${col}`)
            }
            for (const om of stmt.matchAll(/\.or\(\s*[`'"]([^`'"]*)/g)) {
                for (const tok of om[1].split(',')) {
                    const col = tok.split('.')[0].replace(/"/g, '').trim()
                    if (info[table].priv.includes(col)) OFFENDERS[table].push(`${rel(f)}:${line} .or() em ${table}.${col}`)
                }
            }
        }
    }
    // embeds: tabela(colunas) dentro de selects de outras tabelas
    for (const table of ['profiles', 'stores']) {
        const re = new RegExp(`(?:\\b\\w+:)?\\b${table}(?:!\\w+)?\\(([^()]*)\\)`, 'g')
        for (const m of src.matchAll(re)) {
            const before = src.slice(Math.max(0, m.index - 400), m.index)
            if (!/\.select\(\s*[`'"][^`'"]*$/.test(before) && !/\.select\(\s*`[^`]*$/.test(before)) continue
            const line = src.slice(0, m.index).split('\n').length
            for (const c of columnsOf(m[1], info[table].pub)) OFFENDERS[table].push(`${rel(f)}:${line} embed ${table}.${c}`)
        }
    }
}

test('nenhum código lê profiles com select(*) ou coluna privada', () => {
    assert.deepEqual(OFFENDERS.profiles, [], 'Use my_profile (dono), public_address, ou RPC com vínculo:\n' + OFFENDERS.profiles.join('\n'))
})

test('nenhum código lê stores com select(*) ou coluna privada', () => {
    assert.deepEqual(OFFENDERS.stores, [], 'Use my_stores (dono), STORE_PUBLIC_SELECT, ou RPC com vínculo:\n' + OFFENDERS.stores.join('\n'))
})

test('nada imprime Pix ou CPF/CNPJ em log', () => {
    const bad = []
    for (const f of files) {
        const src = read(f)
        for (const m of src.matchAll(/console\.(?:log|info|warn|error|debug)\(([^;]*?)\)\s*(?:;|\n)/g)) {
            if (/pix_?key|pixKey|cpf_?cnpj|cpfCnpj/i.test(m[1])) bad.push(`${rel(f)}:${src.slice(0, m.index).split('\n').length}`)
        }
    }
    assert.deepEqual(bad, [])
})

test('Pix do V2 continua só nas estruturas privadas (driver_payout_keys / get_delivery_payment_view)', () => {
    const offenders = []
    for (const f of files) {
        const s = read(f)
        if (/driver_payout_keys/.test(s) && !/\.rpc\(/.test(s) && !/api\//.test(rel(f)) && !/\bsupabaseAdmin\b/.test(s)) offenders.push(rel(f))
    }
    assert.deepEqual(offenders, [], 'driver_payout_keys só é acessado por RPC/servidor')
})

test('a migration de trava revoga o que a hotfix deixou e nunca devolve SELECT de tabela inteira', () => {
    assert.match(lockdown, /REVOKE SELECT, INSERT, UPDATE ON public\.profiles FROM anon, authenticated/)
    assert.match(lockdown, /REVOKE SELECT, INSERT, UPDATE ON public\.stores FROM anon, authenticated/)
    assert.doesNotMatch(lockdown, /GRANT SELECT ON public\.(profiles|stores)\b/)
})
