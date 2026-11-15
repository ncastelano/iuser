// Testes das regras puras das missões da loja (src/modules/missions/domain.ts). Rodar: npm run test:missions
import test from 'node:test'
import assert from 'node:assert/strict'
import { missionsFromRow, splitMissions, todayRatio, outdoorLine, streakLabel, missionPath, levelLine } from '../src/modules/missions/domain.ts'

const row = {
    missions: [
        { code: 'pedido', kind: 'daily', title: 'Responder um pedido', hint: 'x', points: 5, dest: null, done: true },
        { code: 'publicacao', kind: 'daily', title: 'Fazer uma publicação', hint: null, points: 5, dest: 'publicacao', done: false },
        { code: 'logo', kind: 'once', title: 'Logo da loja', hint: 'y', points: 10, dest: 'dados', done: true },
        { code: 'pix', kind: 'once', title: 'Chave Pix', hint: 'z', points: 10, dest: 'pagamento', done: false },
    ],
    today: { points: 5, total: 10 }, week_points: 21, streak_days: 4,
    outdoor: { active: true, weight: 0.5, mission_units: 80, points_from_missions: 40, store_points: 812.5, rank: 3, stores: 23 },
}

test('resposta do banco → objeto tipado', () => {
    const m = missionsFromRow(row)
    assert.equal(m.missions.length, 4)
    assert.equal(m.todayPoints, 5); assert.equal(m.todayTotal, 10); assert.equal(m.weekPoints, 21); assert.equal(m.streakDays, 4)
    assert.deepEqual(m.outdoor, { active: true, weight: 0.5, missionUnits: 80, pointsFromMissions: 40, storePoints: 812.5, rank: 3, stores: 23 })
    assert.equal(m.missions[1].dest, 'publicacao'); assert.equal(m.missions[0].done, true)
})
test('formato inesperado → null (a tela esconde o quadro, não mostra zero)', () => {
    assert.equal(missionsFromRow(null), null)
    assert.equal(missionsFromRow({}), null)
    assert.equal(missionsFromRow({ missions: 'x', today: {}, outdoor: {} }), null)
    assert.equal(missionsFromRow({ missions: [], today: { points: 0, total: 0 } }), null)
})
test('missão com tipo ou campos inválidos é descartada; números ruins viram 0', () => {
    const m = missionsFromRow({ ...row, missions: [{ code: 'a', kind: 'weekly', title: 'x', points: 1 }, { kind: 'daily', title: 'sem código' }, row.missions[0]], today: { points: 'abc', total: -3 }, week_points: null, streak_days: undefined })
    assert.equal(m.missions.length, 1)
    assert.equal(m.todayPoints, 0); assert.equal(m.todayTotal, 0); assert.equal(m.weekPoints, 0); assert.equal(m.streakDays, 0)
})
test('separa missões do dia e cadastro; conta o que falta', () => {
    const s = splitMissions(missionsFromRow(row))
    assert.equal(s.daily.length, 2); assert.equal(s.cadastro.length, 2)
    assert.equal(s.cadastroFeito, 1); assert.deepEqual(s.cadastroPendente.map((x) => x.code), ['pix'])
})
test('barra do dia: 0 a 1, sem dividir por zero', () => {
    assert.equal(todayRatio(missionsFromRow(row)), 0.5)
    assert.equal(todayRatio({ ...missionsFromRow(row), todayTotal: 0 }), 0)
    assert.equal(todayRatio({ ...missionsFromRow(row), todayPoints: 99 }), 1)
})
test('linha do Outdoor: pontos das missões e posição; desligado diz isso', () => {
    const o = missionsFromRow(row).outdoor
    assert.equal(outdoorLine(o), 'Missões somam 40 pontos na loja · 3º entre 23 lojas no Outdoor')
    assert.equal(outdoorLine({ ...o, pointsFromMissions: 1 }), 'Missões somam 1 ponto na loja · 3º entre 23 lojas no Outdoor')
    assert.equal(outdoorLine({ ...o, stores: 0 }), 'Missões somam 40 pontos na loja')
    assert.equal(outdoorLine({ ...o, active: false }), 'As missões estão fora do Outdoor por enquanto')
})
test('sequência e destino', () => {
    assert.equal(streakLabel(0), 'sem sequência ainda'); assert.equal(streakLabel(1), '1 dia seguido'); assert.equal(streakLabel(4), '4 dias seguidos')
    assert.equal(missionPath('pizzaria forno', 'dados'), '/editar-loja/pizzaria%20forno')
})
test('nível da loja: lido da resposta; frase com o que falta; some desligado ou sem dado', () => {
    assert.equal(missionsFromRow(row).level, null)       // banco sem a migration dos níveis: sem bloco level
    const m = missionsFromRow({ ...row, level: { enabled: true, level: 3, name: 'Estrela', next_name: 'Lenda', next_min: 4000, points: 1700 } })
    assert.deepEqual(m.level, { enabled: true, level: 3, name: 'Estrela', nextName: 'Lenda', nextMin: 4000, points: 1700 })
    assert.equal(levelLine(m.level), 'Nível 3 · Estrela · faltam 2.300 pontos para Lenda')
    assert.equal(levelLine({ ...m.level, points: 3999 }), 'Nível 3 · Estrela · faltam 1 ponto para Lenda')
    assert.equal(levelLine({ ...m.level, points: 4100 }), 'Nível 3 · Estrela · subindo para Lenda')
    assert.equal(levelLine({ ...m.level, nextName: null }), 'Nível 3 · Estrela · nível máximo')
    assert.equal(levelLine({ ...m.level, enabled: false }), null)
    assert.equal(levelLine(null), null)
})
