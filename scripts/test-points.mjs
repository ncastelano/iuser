// Testes das regras puras da PONTUAÇÃO (src/modules/points/domain.ts): Placar do perfil, bônus de diversidade e validação do painel do admin.
// A fonte da verdade dos pontos é o banco (supabase/tests/points_engine_scenarios.sql); aqui conferimos a espelho da conta e as entradas.
// Rodar: npm run test:points
import test from 'node:test'
import assert from 'node:assert/strict'
import {
    POINTS_AREAS, SIGNAL_AREAS, AREA_INFO, scoreboardFromRow, areaShares, computeScore, DEFAULT_DIVERSITY, bonusLabel,
    validateRule, validateSignal, validateDiversity, ruleState, newRuleId, signedPoints,
} from '../src/modules/points/domain.ts'

const zero = () => Object.fromEntries(POINTS_AREAS.map((a) => [a, 0]))
const areas = (o) => ({ ...zero(), ...o })

test('sete áreas, cada uma com nome e cor; só "pessoa" não tem sinais', () => {
    assert.equal(POINTS_AREAS.length, 7)
    assert.equal(SIGNAL_AREAS.length, 6)
    assert.ok(!SIGNAL_AREAS.includes('pessoa'))
    for (const a of POINTS_AREAS) { assert.ok(AREA_INFO[a].label); assert.match(AREA_INFO[a].color, /^#[0-9a-f]{6}$/i) }
})

test('resposta do banco → placar; vazia ou sem áreas é descartada', () => {
    assert.equal(scoreboardFromRow(null), null)
    assert.equal(scoreboardFromRow({}), null)
    assert.equal(scoreboardFromRow('x'), null)
    const sb = scoreboardFromRow({ areas: { pessoa: '120.4', lojas: 300 }, raw: 420, bonus_pct: 0.1, total: 462, ranking_points: 120, use_total: false })
    assert.equal(sb.areas.pessoa, 120)
    assert.equal(sb.areas.motoristas, 0)
    assert.equal(sb.total, 462)
    assert.equal(sb.bonusPct, 0.1)
    assert.equal(sb.rankingPoints, 120)
    assert.equal(sb.useTotal, false)
    assert.equal(scoreboardFromRow({ areas: {}, raw: -5, total: -9 }).total, 0)
})

test('partes de cada área: só as positivas, da maior para a menor', () => {
    const s = areaShares(areas({ pessoa: 25, lojas: 75, servicos: -10 }))
    assert.deepEqual(s.map((x) => x.area), ['lojas', 'pessoa'])
    assert.equal(s[0].share, 0.75)
    assert.deepEqual(areaShares(zero()), [])
})

test('bônus de diversidade: +10% por área extra, até +30%', () => {
    assert.equal(computeScore(areas({ pessoa: 100 })).bonusPct, 0)                                      // uma área só
    assert.equal(computeScore(areas({ pessoa: 100, lojas: 100 })).bonusPct, 0.1)                        // duas
    assert.equal(computeScore(areas({ pessoa: 50, lojas: 50, motoristas: 50 })).bonusPct, 0.2)          // três
    assert.equal(computeScore(areas({ pessoa: 40, lojas: 40, servicos: 40, motoristas: 40, digitais: 40 })).bonusPct, 0.3)  // cinco: trava em 30%
    assert.equal(computeScore(areas({ pessoa: 100, lojas: 100 })).total, 220)
})
test('bônus: área abaixo do mínimo não conta e a maior área não pode passar de 60%', () => {
    assert.equal(computeScore(areas({ pessoa: 100, lojas: 9 })).bonusPct, 0)                            // loja com 9 < 10 pontos
    assert.equal(computeScore(areas({ pessoa: 100, lojas: 10 })).bonusPct, 0)                           // 100/110 = 91% > 60%
    assert.equal(computeScore(areas({ pessoa: 60, lojas: 40 })).bonusPct, 0.1)                          // 60% exato ainda vale
    assert.equal(computeScore(areas({ pessoa: 61, lojas: 39 })).bonusPct, 0)                            // 61% passa
})
test('penalidade baixa a área, o total nunca fica negativo', () => {
    const c = computeScore(areas({ pessoa: 10, lojas: -50 }))
    assert.equal(c.raw, 0)
    assert.equal(c.total, 0)
    assert.equal(computeScore(areas({ pessoa: 100, lojas: -40 })).raw, 60)
})
test('configurações do bônus são validadas', () => {
    assert.equal(validateDiversity(DEFAULT_DIVERSITY), null)
    assert.ok(validateDiversity({ ...DEFAULT_DIVERSITY, step: 1.5 }))
    assert.ok(validateDiversity({ ...DEFAULT_DIVERSITY, maxShare: 0 }))
    assert.ok(validateDiversity({ ...DEFAULT_DIVERSITY, minPoints: 0 }))
    assert.equal(bonusLabel(0.2), '+20%')
    assert.equal(bonusLabel(0), null)
})

test('validação de uma tarefa nova', () => {
    assert.equal(validateRule({ label: 'Black Friday', points: 20, dailyLimit: 3, maxTotal: '', startsAt: '2026-11-27T00:00', endsAt: '2026-11-30T00:00' }, { requireLabel: true }), null)
    assert.ok(validateRule({ label: '  ', points: 5 }, { requireLabel: true }))
    assert.ok(validateRule({ points: 1.5 }))
    assert.ok(validateRule({ points: '' }))
    assert.ok(validateRule({ points: 100001 }))
    assert.equal(validateRule({ points: -10 }), null)                       // penalidade
    assert.ok(validateRule({ points: 5, dailyLimit: 0 }))
    assert.equal(validateRule({ points: 5, dailyLimit: '' }), null)
    assert.ok(validateRule({ points: 5, maxTotal: -1 }))
    assert.ok(validateRule({ points: 5, startsAt: '2026-11-30T00:00', endsAt: '2026-11-27T00:00' }))
    assert.ok(validateRule({ points: 5, startsAt: 'ontem' }))
})
test('validação de um sinal', () => {
    assert.equal(validateSignal({ weight: 0.05 }), null)
    assert.equal(validateSignal({ weight: -3, maxUnits: 50 }), null)
    assert.ok(validateSignal({ weight: '' }))
    assert.ok(validateSignal({ weight: 1001 }))
    assert.ok(validateSignal({ weight: 1, maxUnits: 0 }))
    assert.equal(validateSignal({ weight: 1, maxUnits: '' }), null)
})

test('situação da regra: ligada, desligada, agendada, encerrada', () => {
    const now = Date.parse('2026-11-10T12:00:00Z')
    assert.equal(ruleState({ is_active: false }, now), 'desligada')
    assert.equal(ruleState({ is_active: true }, now), 'ligada')
    assert.equal(ruleState({ is_active: true, starts_at: '2026-11-20T00:00:00Z' }, now), 'agendada')
    assert.equal(ruleState({ is_active: true, ends_at: '2026-11-01T00:00:00Z' }, now), 'encerrada')
    assert.equal(ruleState({ is_active: true, starts_at: '2026-11-01T00:00:00Z', ends_at: '2026-11-30T00:00:00Z' }, now), 'ligada')
})
test('código de regra nova: só letras minúsculas, números e _ (cabe no CHECK do banco)', () => {
    for (let i = 0; i < 20; i++) assert.match(newRuleId('purchase_completed'), /^[a-z0-9_]{3,40}$/)
    assert.match(newRuleId('Evento Estranho!'), /^[a-z0-9_]{3,40}$/)
    assert.notEqual(newRuleId('x_y'), newRuleId('x_y'))
})
test('pontos por extenso, com sinal', () => {
    assert.equal(signedPoints(10), '+10')
    assert.equal(signedPoints(-4), '−4')
    assert.equal(signedPoints(0.05), '+0,05 (1 a cada 20)')
    assert.equal(signedPoints(1500), '+1.500')
})
