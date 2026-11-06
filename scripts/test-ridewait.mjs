// Testes das regras de espera na corrida (src/modules/ridewait/domain.ts). Rodar: npm run test:ridewait
// A conta é a MESMA do banco (supabase/tests/ride_waits_scenarios.sql confere os mesmos números lá).
import test from 'node:test'
import assert from 'node:assert/strict'
import { waitFeeCents, waitSeconds, waitFeeNow, totalWaitCents, openWait, kindsForPhase, clock, centsToBrl, graceLeft, ruleText, waitLine, cleanNote, viewFromJson, waitError, waitSettingsProblem, exampleWaitCents, settingsFromJson, DEFAULT_WAIT_SETTINGS, parseCents, discountProblem, hasDiscount, hasOwnRate, ruleLine } from '../src/modules/ridewait/domain.ts'

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
    assert.equal(ruleText(180, 60, 300), 'Cada espera vale R$ 3,00 (já cobre os primeiros 3 min); depois, R$ 0,60 por minuto. Cobrado depois, junto com a corrida.')
    assert.equal(ruleText(180, 50), 'Os primeiros 3 min de cada espera são grátis; depois R$ 0,50 por minuto. Cobrado depois, junto com a corrida.')   // sem valor inicial (esperas antigas)
    assert.equal(ruleText(0, 50), 'Cada espera é cobrada: R$ 0,50 por minuto. Cobrado depois, junto com a corrida.')
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
    const ok = { baseFee: 3, ratePerMinute: 0.6, graceMinutes: 3, maxMinutes: 120 }
    assert.equal(waitSettingsProblem(ok), null)
    assert.match(waitSettingsProblem({ ...ok, ratePerMinute: 25 }), /R\$ 20,00/)
    assert.match(waitSettingsProblem({ ...ok, ratePerMinute: -1 }), /R\$ 20,00/)
    assert.match(waitSettingsProblem({ ...ok, graceMinutes: 31 }), /0 e 30/)
    assert.match(waitSettingsProblem({ ...ok, graceMinutes: 2.5 }), /inteiro/)
    assert.match(waitSettingsProblem({ ...ok, maxMinutes: 4 }), /5 e 480/)
    assert.match(waitSettingsProblem({ ...ok, maxMinutes: NaN }), /números/)
    assert.equal(waitSettingsProblem({ baseFee: 0, ratePerMinute: 0, graceMinutes: 0, maxMinutes: 5 }), null)     // espera grátis é uma escolha válida
    assert.equal(exampleWaitCents(10, ok), 720)             // R$ 3,00 + (10 - 3) min × R$ 0,60 = R$ 7,20
    assert.equal(exampleWaitCents(2, ok), 300)              // dentro dos 3 min: só o valor inicial
    assert.equal(exampleWaitCents(0, ok), 300)              // ao aprovar JÁ vale R$ 3,00
    assert.match(waitSettingsProblem({ ...ok, baseFee: 101 }), /R\$ 100,00/)
    assert.deepEqual(settingsFromJson({ rate_per_minute: '1.00', base_fee: '2.50', grace_minutes: 5, max_minutes: 60 }), { baseFee: 2.5, ratePerMinute: 1, graceMinutes: 5, maxMinutes: 60 })
    assert.deepEqual(settingsFromJson(null), DEFAULT_WAIT_SETTINGS)
})

test('NOVA REGRA: ao acionar já vale R$ 3,00 (cobre 3 min); depois R$ 0,60 por minuto; cobrado depois', () => {
    assert.equal(waitFeeCents(0, 180, 60, 300), 300)         // acabou de aprovar
    assert.equal(waitFeeCents(179, 180, 60, 300), 300)
    assert.equal(waitFeeCents(180, 180, 60, 300), 300)       // exatamente os 3 min
    assert.equal(waitFeeCents(240, 180, 60, 300), 360)       // 1 min depois: + R$ 0,60
    assert.equal(waitFeeCents(480, 180, 60, 300), 600)       // 8 min: R$ 3,00 + 5 min × R$ 0,60 = R$ 6,00 (o mesmo número do banco)
    assert.equal(waitFeeCents(3600, 180, 60, 300), 3720)   // 1 h: R$ 3,00 + 57 min × R$ 0,60 = R$ 37,20
    const nw = w({ baseCents: 300, rateCents: 60 })
    assert.equal(waitFeeNow(nw, T0), 300)                    // em andamento, 0 s: já são R$ 3,00
    assert.equal(waitFeeNow(nw, T0 + 480_000), 600)
    assert.equal(waitFeeNow(w({ status: 'requested', startedAt: null, baseCents: 300 }), T0), 0)   // pedida e ainda não aprovada: nada
    assert.equal(totalWaitCents([w({ id: 'a', status: 'ended', baseCents: 300, feeCents: 300, seconds: 60 }), nw], T0 + 480_000), 300 + 600)   // as esperas se somam, cada uma com o seu valor inicial
    assert.equal(waitFeeCents(481, 180, 50), 251)            // regra antiga (sem valor inicial) continua igual
})

test('valor da espera ajustado pelo motorista: desconto só no inicial; por minuto nunca abaixo do mínimo do iUser', () => {
    assert.equal(parseCents('3,00'), 300); assert.equal(parseCents('R$ 0,6'), 60); assert.equal(parseCents('0'), 0); assert.equal(parseCents(''), null); assert.equal(parseCents('abc'), null)
    assert.equal(discountProblem(100, 60, 300, 60), null)                      // desconto no inicial, minuto no mínimo
    assert.equal(discountProblem(300, 60, 300, 60), null)                      // exatamente o do iUser vale
    assert.equal(discountProblem(0, 60, 300, 60), null)                         // sem valor inicial vale
    assert.equal(discountProblem(300, 100, 300, 60), null)                      // o motorista põe o SEU minuto, acima do mínimo
    assert.match(discountProblem(400, 60, 300, 60), /não passar de R\$ 3,00/)
    assert.match(discountProblem(300, 30, 300, 60), /abaixo de R\$ 0,60/)      // R$ 0,30 por minuto NÃO pode
    assert.match(discountProblem(300, 59, 300, 60), /abaixo de R\$ 0,60/)
    assert.match(discountProblem(300, 2500, 300, 60), /R\$ 20,00/)
    assert.ok(discountProblem(null, 60, 300, 60)); assert.ok(discountProblem(-1, 60, 300, 60))
    assert.equal(hasDiscount(w({ baseCents: 300, rateCents: 60, listBaseCents: 300, listRateCents: 60 })), false)
    assert.equal(hasDiscount(w({ baseCents: 100, rateCents: 60, listBaseCents: 300, listRateCents: 60 })), true)
    assert.equal(hasOwnRate(w({ baseCents: 300, rateCents: 100, listBaseCents: 300, listRateCents: 60 })), true)
    assert.equal(hasDiscount(w({ baseCents: 300, rateCents: 60 })), false)      // espera antiga: sem valor do iUser guardado, sem selo
    assert.equal(ruleLine({ baseCents: 300, rateCents: 60, graceSeconds: 180 }), 'Valor inicial R$ 3,00 (cobre 3 min) · R$ 0,60 por minuto')
    // R$ 40 por hora = R$ 0,67 por minuto (40 ÷ 60): é acima do mínimo de R$ 0,60 da espera
    assert.equal(Math.round((40 / 60) * 100), 67)
    // com desconto de 50% no inicial: 10 min = R$ 1,50 + 7 min × R$ 0,60 = R$ 5,70
    assert.equal(waitFeeCents(600, 180, 60, 150), 150 + 420)
    const viewed = viewFromJson({ now: '2026-11-06T10:00:10Z', waits: [{ id: 'a', kind: 'stop', status: 'active', requested_by: 'p', requested_at: 'x', started_at: '2026-11-06T10:00:00Z', base_cents: 100, rate_cents: 60, list_base_cents: 300, list_rate_cents: 60, grace_seconds: 180, max_seconds: 7200 }] })
    assert.equal(viewed.waits[0].listBaseCents, 300); assert.equal(viewed.waits[0].baseCents, 100)
})
test('histórico diz quando a espera terminou sozinha', () => {
    assert.equal(waitLine(w({ status: 'ended', seconds: 300, feeCents: 420, baseCents: 300, endedReason: 'left_spot' }), T0), 'Parada · 5 min 00 s · R$ 4,20 · terminou sozinha: o carro saiu do local')
    assert.equal(waitLine(w({ status: 'ended', seconds: 240, feeCents: 360, endedReason: 'ride_started', kind: 'pickup' }), T0), 'Embarque · 4 min 00 s · R$ 3,60 · terminou ao começar a corrida')
    assert.equal(waitLine(w({ status: 'ended', seconds: 60, feeCents: 300, endedReason: null }), T0), 'Parada · 1 min 00 s · R$ 3,00')
    assert.equal(viewFromJson({ now: '2026-11-06T10:00:10Z', waits: [{ id: 'a', kind: 'stop', status: 'ended', requested_by: 'p', requested_at: 'x', ended_reason: 'left_spot', seconds: 5, fee_cents: 300 }] }).waits[0].endedReason, 'left_spot')
})
