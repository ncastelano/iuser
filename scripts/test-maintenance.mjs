// Aviso de manutenção (src/lib/maintenance.ts + MaintenanceNotice). Rodar: npm run test:maintenance
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const mem = new Map()
globalThis.sessionStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) }
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://abcd.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
const m = await import('../src/lib/maintenance.ts')

test('reportMaintenance liga, avisa os ouvintes uma vez e grava com validade; clearMaintenance desliga', () => {
    let calls = 0
    const off = m.subscribeMaintenance(() => { calls++ })
    assert.equal(m.getMaintenance(), false)
    m.reportMaintenance(); m.reportMaintenance()
    assert.equal(m.getMaintenance(), true)
    assert.equal(calls, 1)
    assert.ok(Number(mem.get('iuser_maintenance_until')) > Date.now())
    m.clearMaintenance()
    assert.equal(m.getMaintenance(), false)
    assert.equal(calls, 2)
    assert.equal(mem.has('iuser_maintenance_until'), false)
    off()
})

test('probeSupabase: 402 liga o aviso, resposta boa desliga, falha de rede não mexe', async () => {
    const seen = []
    globalThis.fetch = async (url, init) => { seen.push({ url, key: init?.headers?.apikey }); return { status: 402, ok: false } }
    await m.probeSupabase()
    assert.equal(m.getMaintenance(), true)
    assert.equal(seen[0].url, 'https://abcd.supabase.co/auth/v1/health')
    assert.equal(seen[0].key, 'anon-key')
    globalThis.fetch = async () => { throw new Error('offline') }
    await m.probeSupabase()
    assert.equal(m.getMaintenance(), true, 'sem rede do usuário não pode limpar nem ligar')
    globalThis.fetch = async () => ({ status: 200, ok: true })
    await m.probeSupabase()
    assert.equal(m.getMaintenance(), false)
})

test('o fetch do cliente liga o aviso no 402 e a telemetria continua instalada', () => {
    const c = fs.readFileSync(path.join(root, 'src/lib/supabase/client.ts'), 'utf8')
    assert.match(c, /response\.status === 402\) reportMaintenance\(\)/)
    assert.match(c, /global: \{\s*fetch: trackedFetch/)
    assert.match(c, /trackEgressBytes/)
})

test('faixa no site todo e cartão em login, cadastro, recuperar senha', () => {
    assert.match(fs.readFileSync(path.join(root, 'src/app/providers.tsx'), 'utf8'), /<MaintenanceBanner \/>/)
    for (const f of ['src/components/LoginAndRegister/LoginAndRegister.tsx', 'src/app/(auth)/cadastrar/page.tsx', 'src/app/(auth)/recuperar-senha/page.tsx']) {
        assert.match(fs.readFileSync(path.join(root, f), 'utf8'), /<MaintenanceCard \/>/, `${f} sem o aviso de manutenção`)
    }
})

test('?manutencao=1 na URL não é desligado pelo teste de saúde (só para conferir o visual)', async () => {
    m.reportMaintenance()
    globalThis.window = { location: { search: '?manutencao=1' } }
    globalThis.fetch = async () => ({ status: 200, ok: true })
    await m.probeSupabase()
    assert.equal(m.getMaintenance(), true)
    globalThis.window = { location: { search: '' } }
    await m.probeSupabase()
    assert.equal(m.getMaintenance(), false)
    delete globalThis.window
})
