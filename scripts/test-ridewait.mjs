// Testes das regras de espera na corrida (src/modules/ridewait/domain.ts). Rodar: npm run test:ridewait
// A conta é a MESMA do banco (supabase/tests/ride_waits_scenarios.sql confere os mesmos números lá).
import test from 'node:test'
import assert from 'node:assert/strict'
import { waitFeeCents, waitSeconds, waitFeeNow, totalWaitCents, openWait, kindsForPhase, clock, centsToBrl, graceLeft, ruleText, waitLine, cleanNote, viewFromJson, waitError, waitSettingsProblem, exampleWaitCents, settingsFromJson, DEFAULT_WAIT_SETTINGS } from '../src/modules/ridewait/domain.ts'

const w = (o = {}) => ({ id: 'w1', kind: 'stop', note: null, status: 'active', requestedBy: 'p', requestedAt: '2026-11-06T10:00:00Z', startedAt: '2026-11-06T10:00:00Z', endedAt: null, rateCents: 50, graceSeconds: 180, maxSeconds: 7200, seconds: null, feeCents: null, ...o })
const T0 = Date.parse('2026-11-06T10:00:00Z')

test('valor: os minutos grátis abatem do começo; depois, por minuto proporcional aos segundos, em centavos', () => {
    assert.equal(waitFeeCents(0, 180, 50), 0)
    assert.equal(waitFeeCents(180, 180, 50), 0)            // exatamente os 3 min grátis
    assert.equal(waitFeeCents(181, 180, 50), 1)            // 1 s depois: 50/60 = 0,83 → 1 centavo
    assert.equal(waitFeeCents(480, 180, 50), 250)          // 8 min = (480 - 180) s × R$ 0,50/min = R$ 2,50 (o mesmo número do banco)
    assert.equal(waitFeeCents(600, 300, 100), 500)         // regra nova: 5 min grátis e R$ 1,00/min
    assert.equal(waitFeeCents(3600, 300, 100), 5500)
    assert.equal(waitFeeCents(100, 0, 60), 100)            // sem minutos grátis
    assert.equal(waitFeeCents(-5, 180, 50), 0)
    assert.equal(waitFeeCents(NaN, 180, 50), 0)
})
test('segundos: em andamento conta até agora no relógio do servidor e nunca passa do limite congelado', () => {
    assert.equal(waitSeconds(w(), T0 + 90_000), 90)
    assert.equal(waitSeconds(w(), T0 + 90_000, 10_000), 100)          // o servidor está 10 s à frente do aparelho
    assert.equal(waitSeconds(w(), T0 - 5_000), 0)                      // nunca negativo
    assert.equal(waitSeconds(w({ maxSeconds: 3600 }), T0 + 5 * 3600_000), 3600)   // esquecida: trava no limite
    assert.equal(waitSeconds(w({ status: 'ended', seconds: 481 }), T0 + 9e9), 481) // fechada: o valor gravado
    assert.equal(waitSeconds(w({ status: 'requested', startedAt: null }), T0), 0)
})
test('valor agora: em andamento sobe ao vivo; fechada vale o gravado; pedida, recusada e cancelada não cobram', () => {
    assert.equal(waitFeeNow(w(), T0 + 480_000), 250)
    assert.equal(waitFeeNow(w(), T0 + 120_000), 0)                      // dentro dos minutos grátis
    assert.equal(waitFeeNow(w({ status: 'ended', feeCents: 250, seconds: 480 }), T0 + 9e9), 250)
    for (const status of ['requested', 'declined', 'cancelled']) assert.equal(waitFeeNow(w({ status, startedAt: null }), T0 + 9e9), 0, status)
})
test('as esperas se somam, cada uma com os seus minutos grátis', () => {
    const list = [w({ id: 'a', status: 'ended', feeCents: 250, seconds: 480 }), w({ id: 'b', status: 'ended', feeCents: 0, seconds: 120 }), w({ id: 'c', kind: 'dropoff', rateCents: 100, graceSeconds: 300 }), w({ id: 'd', status: 'declined', startedAt: null })]
    assert.equal(totalWaitCents(list, T0 + 600_000), 250 + 0 + 500)    // a em andamento (c): (600 - 300) s × R$ 1,00/min
    assert.equal(totalWaitCents([], T0), 0)
})
test('a espera aberta e as esperas possíveis por fase', () => {
    assert.equal(openWait([w({ status: 'ended' }), w({ id: 'x', status: 'requested', startedAt: null })])?.id, 'x')
    assert.equal(openWait([w({ status: 'ended' }), w({ status: 'declined' })]), null)
    assert.deepEqual(kindsForPhase(false), ['pickup'])
    assert.deepEqual(kindsForPhase(true), ['stop', 'dropoff'])
})
test('textos: relógio, dinheiro, minutos grátis que faltam, regra e linha do histórico', () => {
    assert.equal(clock(0), '0:00'); assert.equal(clock(75), '1:15'); assert.equal(clock(3723), '1:02:03'); assert.equal(clock(-3), '0:00')
    assert.equal(centsToBrl(250), 'R$ 2,50'); assert.equal(centsToBrl(5), 'R$ 0,05'); assert.equal(centsToBrl(-1), 'R$ 0,00')
    assert.equal(graceLeft(100, 180), 80); assert.equal(graceLeft(200, 180), 0)
    assert.equal(ruleText(180, 50), 'Os primeiros 3 min de cada espera são grátis; depois R$ 0,50 por minuto.')
    assert.equal(ruleText(0, 50), 'Cada espera é cobrada: R$ 0,50 por minuto.')
    assert.equal(waitLine(w({ status: 'ended', seconds: 480, feeCents: 250, note: 'comprar água' }), T0), 'Parada · 8 min 00 s · R$ 2,50 (comprar água)')
})
test('nota: sem espaços nas pontas e até 80 caracteres', () => {
    assert.equal(cleanNote('  esperando o elevador  '), 'esperando o elevador')
    assert.equal(cleanNote('   '), null); assert.equal(cleanNote(null), null)
    assert.equal(cleanNote('x'.repeat(200))?.length, 80)
})
test('resposta do banco → o que a tela usa (relógio do servidor, esperas, sem resposta = nada)', () => {
  const v = viewFromJson({ now: '2026-11-06T10:00:10Z', rate_cents: 50, grace_seconds: 180, max_seconds: 7200, total_fee_cents: 0, waits: [{ id: 'a', kind: 'pickup', note: null, status: 'active', requested_by: 'p', requested_at: '2026-11-06T09:59:00Z', started_at: '2026-11-06T10:00:00Z', ended_at: null, rate_cents: 50, grace_seconds: 180, max_seconds: 7200, seconds: 10, fee_cents: 0 }] }, Date.parse('2026-11-06T10:00:00Z'))
  assert.equal(v?.offsetMs, 10_000); assert.equal(v?.waits.length, 1); assert.equal(v?.waits[0].kind, 'pickup'); assert.equal(v?.rateCents, 50)
  assert.equal(viewFromJson(null), null); assert.equal(viewFromJson({}), null)
})
test('erros do banco viram frases em português', () => {
    assert.match(waitError({ hint: 'not_driver' }), /motorista/)
    assert.match(waitError({ hint: 'wrong_phase' }), /etapa/)
    assert.equal(waitError({ message: 'algo' }), 'algo')
    assert.match(waitError(null), /Tente de novo/)
})

test('regras do admin: validação, exemplo de valor e leitura do banco', () => {
    const ok = { ratePerMinute: 0.5, graceMinutes: 3, maxMinutes: 120 }
    assert.equal(waitSettingsProblem(ok), null)
    assert.match(waitSettingsProblem({ ...ok, ratePerMinute: 25 }), /R\$ 20,00/)
    assert.match(waitSettingsProblem({ ...ok, ratePerMinute: -1 }), /R\$ 20,00/)
    assert.match(waitSettingsProblem({ ...ok, graceMinutes: 31 }), /0 e 30/)
    assert.match(waitSettingsProblem({ ...ok, graceMinutes: 2.5 }), /inteiro/)
    assert.match(waitSettingsProblem({ ...ok, maxMinutes: 4 }), /5 e 480/)
    assert.match(waitSettingsProblem({ ...ok, maxMinutes: NaN }), /números/)
    assert.equal(waitSettingsProblem({ ratePerMinute: 0, graceMinutes: 0, maxMinutes: 5 }), null)     // espera grátis é uma escolha válida
    assert.equal(exampleWaitCents(10, ok), 350)             // (10 - 3) min × R$ 0,50 = R$ 3,50
    assert.equal(exampleWaitCents(2, ok), 0)
    assert.deepEqual(settingsFromJson({ rate_per_minute: '1.00', grace_minutes: 5, max_minutes: 60 }), { ratePerMinute: 1, graceMinutes: 5, maxMinutes: 60 })
    assert.deepEqual(settingsFromJson(null), DEFAULT_WAIT_SETTINGS)
})
