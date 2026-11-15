// Testes das regras puras dos ganhos do motorista (src/modules/earnings/domain.ts). Rodar: npm run test:earnings
import test from 'node:test'
import assert from 'node:assert/strict'
import { brlFromCents, periodStart, recentCompleted, rideCents, summarize } from '../src/modules/earnings/domain.ts'

// quarta-feira, 04/11/2026, 15:00 (hora local do teste)
const NOW = new Date(2026, 10, 4, 15, 0, 0)
const at = (y, m, d, h = 10) => new Date(y, m - 1, d, h).toISOString()
const row = (over = {}) => ({ status: 'completed', started_at: at(2026, 11, 4, 9), agreed_price: null, offered_price: 20, order_id: null, ...over })

test('o valor combinado vale mais que a oferta; em centavos, sem ponto flutuante', () => {
    assert.equal(rideCents({ agreed_price: 22, offered_price: 20 }), 2200)
    assert.equal(rideCents({ agreed_price: null, offered_price: 19.9 }), 1990)
    assert.equal(rideCents({ agreed_price: '0.1', offered_price: null }), 10)
    assert.equal(rideCents({ agreed_price: null, offered_price: null }), 0)
    assert.equal(rideCents({ agreed_price: -5, offered_price: 8 }), 800)
    // 0,1 + 0,2 não pode virar 0,30000000000000004
    assert.equal(summarize([row({ offered_price: 0.1 }), row({ offered_price: 0.2 })], NOW).day.cents, 30)
})

test('início de cada período: hoje, semana (segunda) e mês (dia 1)', () => {
    assert.deepEqual(periodStart(NOW, 'day'), new Date(2026, 10, 4))
    assert.deepEqual(periodStart(NOW, 'week'), new Date(2026, 10, 2))    // segunda 02/11
    assert.deepEqual(periodStart(NOW, 'month'), new Date(2026, 10, 1))
    const sunday = new Date(2026, 10, 8, 12)
    assert.deepEqual(periodStart(sunday, 'week'), new Date(2026, 10, 2)) // domingo ainda é a semana de segunda
    const monday = new Date(2026, 10, 9, 8)
    assert.deepEqual(periodStart(monday, 'week'), new Date(2026, 10, 9))
})

test('soma só o concluído, por período, separando corrida e entrega', () => {
    const rows = [
        row(),                                                                            // hoje, corrida, 20
        row({ agreed_price: 30, started_at: at(2026, 11, 4, 12) }),                       // hoje, corrida, 30
        row({ order_id: 'x', offered_price: 7, started_at: at(2026, 11, 4, 13) }),        // hoje, entrega, 7
        row({ started_at: at(2026, 11, 3) }),                                             // ontem (semana e mês)
        row({ started_at: at(2026, 11, 1) }),                                             // domingo 01/11: mês, não é desta semana
        row({ started_at: at(2026, 10, 30) }),                                            // mês passado: fora
        row({ status: 'cancelled' }), row({ status: 'accepted' }),                        // não rendem
        row({ offered_price: 0 }), row({ started_at: null, created_at: null }),           // sem valor / sem data
        row({ started_at: at(2026, 11, 5) }),                                             // no futuro: fora
    ]
    const s = summarize(rows, NOW)
    assert.deepEqual(s.day, { cents: 5700, count: 3, rides: 2, deliveries: 1 })
    assert.deepEqual(s.week, { cents: 7700, count: 4, rides: 3, deliveries: 1 })
    assert.deepEqual(s.month, { cents: 9700, count: 5, rides: 4, deliveries: 1 })
    assert.deepEqual(summarize([], NOW).day, { cents: 0, count: 0, rides: 0, deliveries: 0 })
})

test('os últimos concluídos, do mais novo ao mais antigo', () => {
    const rows = [row({ started_at: at(2026, 11, 1) }), row({ started_at: at(2026, 11, 4) }), row({ status: 'cancelled' }), row({ started_at: at(2026, 11, 2) })]
    const r = recentCompleted(rows, 2)
    assert.equal(r.length, 2)
    assert.equal(new Date(r[0].started_at).getDate(), 4)
    assert.equal(new Date(r[1].started_at).getDate(), 2)
})

test('dinheiro formatado em reais', () => {
    assert.equal(brlFromCents(123456).replace(/\s/g, ' '), 'R$ 1.234,56')
    assert.equal(brlFromCents(0).replace(/\s/g, ' '), 'R$ 0,00')
})
