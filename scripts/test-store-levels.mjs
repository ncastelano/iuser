// Testes das regras puras dos níveis de loja (src/modules/store-levels/domain.ts). Rodar: npm run test:store-levels
import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_STORE_LEVELS as L, levelsFromRows, levelOf, nextLevel, frameSpec, borderCss, progressLabel } from '../src/modules/store-levels/domain.ts'

test('linhas do banco → escada ordenada; linha ruim é descartada; cor inválida sai', () => {
    const lv = levelsFromRows([
        { level: 2, name: 'Meio', min_points: 500, colors: ['#38bdf8', 'azul', '#3b82f6'], animated: false },
        { level: 0, name: 'Base', min_points: 0, colors: [], animated: false },
        { level: 'x', name: 'Ruim', min_points: 1 }, { level: 3, name: '', min_points: 1 }, null,
    ])
    assert.deepEqual(lv.map((l) => l.level), [0, 2])
    assert.deepEqual(lv[1].colors, ['#38bdf8', '#3b82f6'])
})
test('sem nenhuma linha boa volta a escada de fábrica (a moldura não some por erro de leitura)', () => {
    assert.equal(levelsFromRows(null), L)
    assert.equal(levelsFromRows([]), L)
    assert.equal(levelsFromRows([{ level: 99, name: 'x' }]), L)
})
test('nível pelo número: exato, o maior abaixo, e 0 para o que não faz sentido', () => {
    assert.equal(levelOf(L, 3).name, 'Estrela')
    assert.equal(levelOf(L, 7).name, 'Lenda')
    assert.equal(levelOf(L, -2).name, 'Iniciante')
    assert.equal(levelOf(L, undefined).name, 'Iniciante')
    assert.equal(levelOf(L, null).name, 'Iniciante')
    assert.equal(levelOf([], 3).name, 'Iniciante')
})
test('próximo degrau e frase de progresso', () => {
    assert.equal(nextLevel(L, 3).name, 'Lenda')
    assert.equal(nextLevel(L, 4), null)
    assert.equal(progressLabel(L, 3, 1700), 'Faltam 2.300 pontos para Lenda')
    assert.equal(progressLabel(L, 3, 3999.2), 'Faltam 1 ponto para Lenda')
    assert.equal(progressLabel(L, 4, 9000), 'Nível máximo')
})
test('moldura: nível 0 não tem; fio, degradê, anel duplo e chama animada', () => {
    assert.equal(frameSpec(L[0], 48), null)
    const f1 = frameSpec(L[1], 48)
    assert.equal(f1.background, '#22c55e'); assert.equal(f1.glow, undefined); assert.equal(f1.crown, false)
    const f2 = frameSpec(L[2], 48)
    assert.match(f2.background, /^linear-gradient\(135deg, #38bdf8, #3b82f6, #6366f1\)$/); assert.match(f2.glow, /^0 4px 12px #3b82f644$/)
    const f3 = frameSpec(L[3], 48, { bg: '#fff' })
    assert.match(f3.glow, /^0 0 0 \d+px #fff, 0 0 0 \d+px #a855f755, 0 6px 18px #ec489966$/)
    const f4 = frameSpec(L[4], 48)
    assert.equal(f4.background, null); assert.match(f4.conic, /^conic-gradient\(#f97316, #ef4444, #fbbf24, #f97316, #f97316\)$/)
    assert.equal(f4.animated, true); assert.equal(f4.crown, true)
    assert.equal(frameSpec(L[4], 32).crown, false)      // coroa só em logo de 40 px ou mais
})
test('espessura e raio acompanham o tamanho; dá para forçar', () => {
    assert.equal(frameSpec(L[1], 100).ring, 6); assert.equal(frameSpec(L[1], 100).radius, 26)
    assert.equal(frameSpec(L[1], 20).ring, 2)               // nunca fino demais
    const f = frameSpec(L[1], 100, { ring: 3, radius: 24 }); assert.equal(f.ring, 3); assert.equal(f.radius, 24)
})
test('borda de um elemento só (mapa): degradê no border-box, sem moldura no nível 0', () => {
    assert.equal(borderCss(L[0], 3), null)
    assert.deepEqual(borderCss(L[1], 3), { border: '3px solid transparent', background: 'linear-gradient(#ffffff, #ffffff) padding-box, linear-gradient(#22c55e, #22c55e) border-box' })
    assert.match(borderCss(L[2], 2, '#000').background, /padding-box, linear-gradient\(135deg, #38bdf8, #3b82f6, #6366f1\) border-box$/)
})

import { validateLevelEdit, validateLadder, validateLevelSettings, parseColorsInput } from '../src/modules/store-levels/domain.ts'
const ok = (o = {}) => ({ level: 2, name: 'Destaque', minPoints: 500, colors: ['#38bdf8'], animated: false, isActive: true, ...o })
test('edição de uma linha: nome, pontos, cores e as regras do nível 0', () => {
    assert.equal(validateLevelEdit(ok()), null)
    assert.match(validateLevelEdit(ok({ name: 'A' })), /nome/)
    assert.match(validateLevelEdit(ok({ minPoints: -1 })), /pontos mínimos/)
    assert.match(validateLevelEdit(ok({ minPoints: 1.5 })), /pontos mínimos/)
    assert.match(validateLevelEdit(ok({ colors: ['azul'] })), /cor/)
    assert.match(validateLevelEdit(ok({ colors: Array(7).fill('#fff') })), /6 cores/)
    assert.match(validateLevelEdit(ok({ colors: [] })), /ao menos uma cor/)
    assert.equal(validateLevelEdit(ok({ colors: [], isActive: false })), null)        // desligado não precisa de cor
    assert.equal(validateLevelEdit(ok({ level: 0, minPoints: 0, colors: [] })), null)
    assert.match(validateLevelEdit(ok({ level: 0, minPoints: 10, colors: [] })), /nível 0 começa em 0/)
    assert.match(validateLevelEdit(ok({ level: 0, minPoints: 0, colors: [], isActive: false })), /não pode ser desligado/)
})
test('a escada inteira tem de subir; o nível 0 existe e está ligado', () => {
    const base = [ok({ level: 0, name: 'Base', minPoints: 0, colors: [] }), ok({ level: 1, name: 'A', minPoints: 100 }), ok({ level: 2, name: 'B', minPoints: 500 })]
    assert.equal(validateLadder(base), null)
    assert.match(validateLadder([base[0], base[1], { ...base[2], minPoints: 100 }]), /B precisa de mais pontos que A/)
    assert.match(validateLadder([{ ...base[0], isActive: false }, base[1]]), /nível 0/)
    assert.equal(validateLadder([base[0], { ...base[1], isActive: false }, base[2]]), null)    // nível desligado fica fora da conta
})
test('dias para descer e campo de cores', () => {
    assert.equal(validateLevelSettings({ dropAfterDays: 7 }), null)
    assert.match(validateLevelSettings({ dropAfterDays: 0 }), /1 a 90/)
    assert.match(validateLevelSettings({ dropAfterDays: 91 }), /1 a 90/)
    assert.deepEqual(parseColorsInput(' #f97316, #ef4444 ;  #fff '), ['#f97316', '#ef4444', '#fff'])
    assert.deepEqual(parseColorsInput(''), [])
})
