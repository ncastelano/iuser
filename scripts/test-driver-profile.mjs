// Testes do valor do botão "Solicitar corrida" do perfil do motorista (src/modules/driver-profile). Rodar: npm run test:driver-profile
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseQuote, quoteModeClientLabel, quoteExamples, quotePrice, quoteRule, quoteTimeRate } from '../src/modules/driver-profile/domain.ts'

const shape = { baseFee: 10, baseDistanceKm: 2, pricePerKmAfterBase: 3 }

test('os modos do app são os do CHECK do banco', () => {
    const sql = readFileSync(new URL('../supabase/migrations/20261130000072_driver_profile_quote.sql', import.meta.url), 'utf8')
    assert.match(sql, /profile_quote IN \('platform', 'km', 'time'\)/)
})

test('modo desconhecido vira Tarifa iUser; posição só se vier completa; o modo decide a tarifa usada', () => {
    assert.equal(parseQuote({ mode: 'outro' }).mode, 'platform')
    assert.equal(parseQuote({ mode: 'outro', pricing_mode: 'custom' }).row.pricing_mode, 'platform')   // Tarifa iUser mesmo tendo a própria
    assert.equal(parseQuote({ mode: 'km' }).row.pricing_mode, 'custom')
    assert.equal(parseQuote({ mode: 'km', live: { lat: 1 } }).live, null)
    assert.deepEqual(parseQuote({ mode: 'time', live: { lat: -8.76, lng: -63.9, at: 'x' } }).live, { lat: -8.76, lng: -63.9, at: 'x' })
    assert.equal(parseQuote(null), null)
})

test('por km (Tarifa iUser ou a própria): base + km acima do incluído + extras', () => {
    const q = parseQuote({ mode: 'km' })
    assert.equal(quotePrice(q, shape, { km: 5, minutes: null }, 40), 19)
    assert.equal(quotePrice(q, shape, { km: 1, minutes: null }, 40), 10)
    assert.equal(quotePrice(q, shape, { km: 5, minutes: null }, 40, 4), 23)
    assert.equal(quotePrice(q, shape, { km: null, minutes: 10 }, 40), null)
    assert.equal(quoteRule(q, shape, 40), 'R$ 10,00 até 2 km + R$ 3,00 por km')
    assert.deepEqual(quoteExamples(q, shape, 40), [{ label: '3 km', price: 13 }, { label: '5 km', price: 19 }, { label: '10 km', price: 34 }])
})

test('por tempo: o valor por minuto, nunca abaixo do padrão por hora', () => {
    const own = parseQuote({ mode: 'time', price_per_minute: 1.5 })
    assert.equal(quotePrice(own, shape, { km: 9, minutes: 20 }, 40), 30)
    assert.equal(quoteTimeRate(parseQuote({ mode: 'time', price_per_minute: 0.1 }), 40), 0.6667)   // R$ 40/h ÷ 60
    const none = parseQuote({ mode: 'time' })
    assert.equal(quotePrice(none, shape, { km: null, minutes: 30 }, 40), 20)
    assert.equal(quotePrice(none, shape, { km: 5, minutes: null }, 40), null)
    assert.deepEqual(quoteExamples(own, shape, 40).map((e) => e.label), ['10 min', '20 min', '30 min'])
})

test('tempo até quem vê a página: só com as duas posições', async () => {
    const { etaFromViewer, etaText } = await import('../src/modules/driver-profile/domain.ts')
    assert.equal(etaFromViewer(null, { lat: -8.76, lng: -63.9 }), null)
    assert.equal(etaFromViewer({ lat: -8.76, lng: -63.9 }, null), null)
    const e = etaFromViewer({ lat: -8.7612, lng: -63.9004 }, { lat: -8.7400, lng: -63.8750 })   // ~3,6 km em linha reta
    assert.ok(e.km > 4 && e.km < 6, `km ${e.km}`)
    assert.ok(e.minutes >= 8 && e.minutes <= 12, `min ${e.minutes}`)
    assert.match(etaText(e), /^Cerca de \d+ min de você · \d/)
    assert.equal(etaText({ km: 0.4, minutes: 1 }), 'Pertinho de você · 0,4 km')
    assert.equal(etaText({ km: 50, minutes: 100 }), 'Cerca de 1 h 40 min de você · 50 km')
    assert.equal(etaFromViewer({ lat: -8.76, lng: -63.9 }, { lat: -23.5, lng: -46.6 }), null)   // outra cidade
})

test('quem pede vê o nome do jeito de cobrar sem o "Minha" do motorista', () => {
    assert.equal(quoteModeClientLabel('km'), 'Tarifa por km')
    assert.equal(quoteModeClientLabel('time'), 'Tarifa por tempo')
    assert.equal(quoteModeClientLabel('platform'), 'Tarifa iUser')
})
