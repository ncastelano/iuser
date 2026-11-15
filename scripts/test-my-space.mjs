// Testes das regras puras do "MEU ESPAÇO" (src/modules/uploads/limits.ts). Rodar: npm run test:my-space
// (quem recusa de verdade é o banco: supabase/tests/digital_limits_scenarios.sql)
import test from 'node:test'
import assert from 'node:assert/strict'
import { limitFromRow, ruleText, percentUsed, spaceTone, roomLeftBytes, checkFitsLimit, gbText } from '../src/modules/uploads/limits.ts'

const MB = 1024 * 1024
const row = { kind: 'digital_music', label: 'Música (produto digital)', bucket: 'digital-music', provider: 'supabase', enabled: true, max_bytes: 25 * MB, per_hour_files: 20, per_day_bytes: 200 * MB, per_user_bytes: 500 * MB, used_bytes: 100 * MB, used_files: 12, used_day_bytes: 150 * MB }
const l = limitFromRow(row)

test('a linha do banco vira o objeto do app (números de verdade, nulos preservados)', () => {
    assert.equal(l.maxBytes, 25 * MB)
    assert.equal(l.usedBytes, 100 * MB)
    assert.equal(l.perHourFiles, 20)
    const bare = limitFromRow({ ...row, per_hour_files: null, per_day_bytes: null, per_user_bytes: null, used_bytes: '0', used_files: null, used_day_bytes: undefined })
    assert.equal(bare.perHourFiles, null); assert.equal(bare.perDayBytes, null); assert.equal(bare.perUserBytes, null)
    assert.equal(bare.usedFiles, 0); assert.equal(bare.usedDayBytes, 0)
})
test('as regras em português', () => {
    assert.equal(ruleText(l), 'até 25 MB por arquivo · 20 por hora · 200 MB por dia · 500 MB no total')
    assert.equal(ruleText({ maxBytes: 5 * MB, perHourFiles: null, perDayBytes: null, perUserBytes: null }), 'até 5 MB por arquivo')
})
test('porcentagem e cor da barra', () => {
    assert.equal(percentUsed(100 * MB, 500 * MB), 20)
    assert.equal(percentUsed(0, 500 * MB), 0)
    assert.equal(percentUsed(10, null), 0)
    assert.equal(percentUsed(900 * MB, 500 * MB), 100)   // nunca passa de 100
    assert.equal(spaceTone(79), 'ok'); assert.equal(spaceTone(80), 'warn'); assert.equal(spaceTone(99), 'warn'); assert.equal(spaceTone(100), 'full')
})
test('quanto ainda cabe: o menor entre o total, o dia e o tamanho do arquivo', () => {
    assert.equal(roomLeftBytes(l), 25 * MB)                              // sobra muito: vale o limite do arquivo
    assert.equal(roomLeftBytes({ ...l, usedDayBytes: 190 * MB }), 10 * MB)   // o dia está quase cheio
    assert.equal(roomLeftBytes({ ...l, usedBytes: 495 * MB }), 5 * MB)       // o total está quase cheio
    assert.equal(roomLeftBytes({ ...l, usedBytes: 500 * MB }), 0)
})
test('antes de enviar: a mensagem certa para cada limite (ou nada)', () => {
    assert.equal(checkFitsLimit(l, 10 * MB), null)
    assert.equal(checkFitsLimit(null, 10 * MB), null)                       // sem os limites, o servidor decide
    assert.match(checkFitsLimit(l, 30 * MB, 'áudio'), /30 MB.*25 MB por arquivo/)
    assert.match(checkFitsLimit({ ...l, usedBytes: 495 * MB }, 10 * MB), /espaço .* cheio/)
    assert.match(checkFitsLimit({ ...l, usedDayBytes: 195 * MB }, 10 * MB), /hoje/)
    assert.match(checkFitsLimit({ ...l, enabled: false }, 1), /desligado/)
})
test('GB para a banda', () => {
    assert.equal(gbText(3 * 1024 * MB), '3,0 GB')
    assert.equal(gbText(512 * MB), '512 MB')
})
