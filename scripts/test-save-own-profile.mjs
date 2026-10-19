// saveOwnProfile (src/lib/saveOwnProfile.ts): UPDATE primeiro; INSERT só se a linha não existe; erro volta como veio. Rodar: npm run test:save-own-profile
import test from 'node:test'
import assert from 'node:assert/strict'
import { saveOwnProfile } from '../src/lib/saveOwnProfile.ts'

function fakeClient({ updateRows = [{ id: 'u1' }], updateError = null, insertError = null } = {}) {
    const calls = []
    return {
        calls,
        from: (t) => ({
            update: (v) => { calls.push(['update', t, v]); return { eq: (c, id) => { calls.push(['eq', c, id]); return { select: async () => ({ data: updateError ? null : updateRows, error: updateError }) } } } },
            insert: async (v) => { calls.push(['insert', t, v]); return { error: insertError } },
        }),
    }
}

test('caminho normal: só UPDATE do próprio perfil, sem mandar o id no corpo', async () => {
    const c = fakeClient()
    const r = await saveOwnProfile(c, 'u1', { id: 'outro', name: 'A', address: 'Rua 1' })
    assert.equal(r.error, null)
    assert.deepEqual(c.calls[0], ['update', 'profiles', { name: 'A', address: 'Rua 1' }])
    assert.deepEqual(c.calls[1], ['eq', 'id', 'u1'])
    assert.equal(c.calls.some((x) => x[0] === 'insert'), false)
})

test('linha ainda não existe: cria com o id do usuário', async () => {
    const c = fakeClient({ updateRows: [] })
    const r = await saveOwnProfile(c, 'u9', { name: 'B' })
    assert.equal(r.error, null)
    assert.deepEqual(c.calls.at(-1), ['insert', 'profiles', { name: 'B', id: 'u9' }])
})

test('erro do banco volta igual (ex.: CPF repetido, código 23505) e não tenta inserir', async () => {
    const err = { code: '23505', message: 'duplicate key value violates unique constraint "profiles_cpf_cnpj_key"' }
    const c = fakeClient({ updateError: err })
    const r = await saveOwnProfile(c, 'u1', { cpf_cnpj: '1' })
    assert.equal(r.error.code, '23505')
    assert.equal(c.calls.some((x) => x[0] === 'insert'), false)
})
