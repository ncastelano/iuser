// Horários da loja (src/lib/storeSlots.ts). Rodar: npm run test:store-slots
import test from 'node:test'
import assert from 'node:assert/strict'
import { daySlots, freeCount, dateKey, DEFAULT_OPENING } from '../src/lib/storeSlots.ts'

const cfg = { ...DEFAULT_OPENING, slot_interval: 60 }
const monday = new Date(2026, 9, 26) // segunda, 26/10/2026
const longAgo = new Date(2026, 0, 1)

test('dia aberto: horários de 1 em 1 h, sem o almoço', () => {
    const times = daySlots(cfg, monday, 60, [], longAgo).map((s) => s.time)
    assert.deepEqual(times, ['08:00', '09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00', '17:00'])
})

test('dia fechado (sábado) e dia bloqueado não têm horário', () => {
    assert.deepEqual(daySlots(cfg, new Date(2026, 9, 24), 60, [], longAgo), [])
    assert.deepEqual(daySlots({ ...cfg, blocked_dates: ['2026-10-26'] }, monday, 60, [], longAgo), [])
    assert.deepEqual(daySlots({ ...cfg, is_active: false }, monday, 60, [], longAgo), [])
})

test('ocupado por sobreposição, respeitando a duração do serviço', () => {
    const busy = [{ date: '2026-10-26', time: '09:00:00', duration: 60 }]
    const s60 = daySlots(cfg, monday, 60, busy, longAgo)
    assert.equal(s60.find((s) => s.time === '09:00').status, 'occupied')
    assert.equal(s60.find((s) => s.time === '08:00').status, 'free')
    assert.equal(s60.find((s) => s.time === '10:00').status, 'free')
    // um serviço de 90 min começando às 08:00 invade as 09:00 ocupadas
    const s90 = daySlots({ ...cfg, slot_interval: 30 }, monday, 90, busy, longAgo)
    assert.equal(s90.find((s) => s.time === '08:00').status, 'occupied')
    assert.equal(s90.find((s) => s.time === '07:30'), undefined)
})

test('hoje só depois de agora; conta as vagas livres', () => {
    const now = new Date(2026, 9, 26, 10, 30)
    const times = daySlots(cfg, monday, 60, [], now).map((s) => s.time)
    assert.deepEqual(times, ['11:00', '13:00', '14:00', '15:00', '16:00', '17:00'])
    assert.equal(freeCount(daySlots(cfg, monday, 60, [{ date: '2026-10-26', time: '13:00', duration: 60 }], now)), 5)
})

test('dateKey usa o dia do aparelho', () => {
    assert.equal(dateKey(new Date(2026, 9, 5, 23, 30)), '2026-10-05')
})

test('meu compromisso aparece no horário (com título e lugar) em vez de só ocupado', () => {
    const mine = [{ date: '2026-10-26', time: '10:00:00', duration: 60, title: 'Reunião', place: 'com @ana' }]
    const s = daySlots(cfg, monday, 60, [], longAgo, mine)
    const ten = s.find((x) => x.time === '10:00')
    assert.equal(ten.status, 'mine')
    assert.deepEqual(ten.mine, { title: 'Reunião', place: 'com @ana', from: '10:00', to: '11:00' })
    assert.equal(s.find((x) => x.time === '09:00').status, 'free')   // 09-10 só encosta: livre
    assert.equal(s.find((x) => x.time === '11:00').status, 'free')   // 11-12 encosta no fim: livre
    // o meu compromisso vence a loja ocupada, e não conta como vaga
    const both = daySlots(cfg, monday, 60, [{ date: '2026-10-26', time: '10:00:00', duration: 60 }], longAgo, mine)
    assert.equal(both.find((x) => x.time === '10:00').status, 'mine')
    assert.equal(freeCount(s), 8)
})
