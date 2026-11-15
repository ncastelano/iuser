// npm run test:agenda-timeline — a linha do tempo de um dia da agenda (src/lib/agendaTimeline.ts)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dayTimeline, duracao } from '../src/lib/agendaTimeline.ts'

const cfg = { is_active: true, weekly: { '1': { isOpen: true, start: '08:00', end: '18:00', lunchStart: '12:00', lunchEnd: '13:00' }, '0': { isOpen: false } } }
const seg = new Date(2026, 10, 9) // segunda
const dom = new Date(2026, 10, 8)

test('dia sem agendamento: livre da abertura ao almoço, almoço, livre até fechar', () => {
    const t = dayTimeline(cfg, seg, [])
    assert.deepEqual(t.segments.map((s) => `${s.kind} ${s.from}-${s.to}`), ['free 08:00-12:00', 'lunch 12:00-13:00', 'free 13:00-18:00'])
})
test('agendamentos com os buracos livres entre eles; sobrepostos viram um bloco', () => {
    const t = dayTimeline(cfg, seg, [{ id: 'a', time: '09:00', duration: 60 }, { id: 'b', time: '09:30', duration: 60 }, { id: 'c', time: '14:00:00', duration: 30 }])
    assert.deepEqual(t.segments.map((s) => `${s.kind} ${s.from}-${s.to}`), ['free 08:00-09:00', 'appt 09:00-10:30', 'free 10:30-12:00', 'lunch 12:00-13:00', 'free 13:00-14:00', 'appt 14:00-14:30', 'free 14:30-18:00'])
    assert.equal(t.segments[1].appts.length, 2)
})
test('dia fechado sem nada = fechado; dia fechado COM agendamento mostra o agendamento', () => {
    assert.equal(dayTimeline(cfg, dom, []).open, false)
    assert.equal(dayTimeline(cfg, dom, []).segments.length, 0)
    const t = dayTimeline(cfg, dom, [{ id: 'x', time: '10:00', duration: 90 }])
    assert.deepEqual(t.segments.map((s) => s.kind), ['appt'])
})
test('agendamento depois de fechar estica o dia', () => {
    const t = dayTimeline(cfg, seg, [{ id: 'z', time: '18:30', duration: 60 }])
    assert.equal(t.end, '19:30')
    assert.equal(t.segments.at(-1).kind, 'appt')
})
test('duração legível', () => {
    assert.equal(duracao(45), '45 min'); assert.equal(duracao(90), '1h30'); assert.equal(duracao(120), '2h')
})
