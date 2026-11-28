// Testes das regras dos avisos (src/modules/campaigns/domain.ts). Rodar: npm run test:campaigns
// Os limites e as regras de quem pode o quê também são conferidos no banco: supabase/tests/push_campaigns_scenarios.sql
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { validateCampaign, audienceAllowed, CAMPAIGN_TITLE_MAX, CAMPAIGN_BODY_MAX, CAMPAIGN_URL_MAX } from '../src/modules/campaigns/domain.ts'

const sql = readFileSync(new URL('../supabase/migrations/20261130000149_push_campaigns.sql', import.meta.url), 'utf8')

test('os limites são os MESMOS do banco', () => {
    assert.match(sql, new RegExp(`char_length\\(btrim\\(title\\)\\) BETWEEN 2 AND ${CAMPAIGN_TITLE_MAX}`))
    assert.match(sql, new RegExp(`char_length\\(btrim\\(body\\)\\) BETWEEN 1 AND ${CAMPAIGN_BODY_MAX}`))
    assert.match(sql, new RegExp(`char_length\\(url\\) <= ${CAMPAIGN_URL_MAX}`))
})

test('aceita um aviso certo e recusa título, texto e link fora do iUser', () => {
    assert.equal(validateCampaign({ title: 'Promoção', body: 'Aproveite', url: '/minha-loja' }), null)
    assert.ok(validateCampaign({ title: 'a', body: 'x', url: '/x' }))
    assert.ok(validateCampaign({ title: 'Oi', body: '', url: '/x' }))
    assert.ok(validateCampaign({ title: 'Oi', body: 'x', url: 'https://fora.com' }))
    assert.ok(validateCampaign({ title: 'Oi', body: 'x', url: '//fora.com' }))
})

test('a loja só usa o próprio público; o administrador usa todos', () => {
    assert.equal(audienceAllowed('store_followers', false), true)
    assert.equal(audienceAllowed('store_customers', false), true)
    assert.equal(audienceAllowed('all', false), false)
    assert.equal(audienceAllowed('all', true), true)
    assert.equal(audienceAllowed('lojistas', true), true)
})
