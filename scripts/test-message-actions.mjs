// Testes das regras das ações de mensagem (src/modules/chat/messageActions.ts). Rodar: npm run test:message-actions
// As janelas (15 min para editar, 48 h para apagar para todos) são conferidas também no banco:
// supabase/migrations/20261130000141_chat_message_actions.sql.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { EDIT_WINDOW_MS, DELETE_ALL_WINDOW_MS, REACTION_EMOJIS, canEdit, canDeleteForAll, quotePreview, tickOf, reactionChips, matchesSearch } from '../src/modules/chat/messageActions.ts'

const sql = readFileSync(new URL('../supabase/migrations/20261130000141_chat_message_actions.sql', import.meta.url), 'utf8')
const NOW = Date.parse('2026-11-27T12:00:00Z')
const at = (minAgo) => new Date(NOW - minAgo * 60 * 1000).toISOString()
const base = { id: 'm1', sender_id: 'eu', kind: 'text', content: 'oi', created_at: at(1) }

test('as janelas são as MESMAS do banco', () => {
    assert.equal(EDIT_WINDOW_MS, 15 * 60 * 1000)
    assert.equal(DELETE_ALL_WINDOW_MS, 48 * 3600 * 1000)
    assert.match(sql, /now\(\) - interval '15 minutes'/)
    assert.match(sql, /now\(\) - interval '48 hours'/)
})

test('as reações são as MESMAS do banco', () => {
    for (const e of REACTION_EMOJIS) assert.match(sql, new RegExp(e.replace(/[\\/]/g, '\\$&')))
    assert.equal(REACTION_EMOJIS.length, 6)
})

test('editar: só texto próprio, até 15 min, sem cartão nem apagada', () => {
    assert.equal(canEdit(base, 'eu', NOW), true)
    assert.equal(canEdit({ ...base, created_at: at(16) }, 'eu', NOW), false)
    assert.equal(canEdit({ ...base, sender_id: 'outra' }, 'eu', NOW), false)
    assert.equal(canEdit({ ...base, kind: 'photo' }, 'eu', NOW), false)
    assert.equal(canEdit({ ...base, ref_product_id: 'p' }, 'eu', NOW), false)
    assert.equal(canEdit({ ...base, deleted_at: at(0) }, 'eu', NOW), false)
})

test('apagar para todos: só de quem enviou, até 48 h', () => {
    assert.equal(canDeleteForAll(base, 'eu', NOW), true)
    assert.equal(canDeleteForAll({ ...base, created_at: at(60 * 49) }, 'eu', NOW), false)
    assert.equal(canDeleteForAll({ ...base, sender_id: 'outra' }, 'eu', NOW), false)
    assert.equal(canDeleteForAll({ ...base, deleted_at: at(0) }, 'eu', NOW), false)
})

test('a citação mostra o tipo da mídia e não o conteúdo apagado', () => {
    assert.equal(quotePreview({ kind: 'photo', content: '' }), 'Foto')
    assert.equal(quotePreview({ kind: 'video', content: '' }), 'Vídeo')
    assert.equal(quotePreview({ kind: 'audio', content: '' }), 'Áudio')
    assert.equal(quotePreview({ kind: 'location', content: '' }), 'Localização ao vivo')
    assert.equal(quotePreview({ kind: 'text', content: '', deleted_at: at(0) }), 'Mensagem apagada')
    assert.equal(quotePreview({ kind: 'text', content: 'a'.repeat(200) }).length, 90)
})

test('visto: ✓ enviada, ✓✓ quando a outra pessoa leu depois da mensagem', () => {
    assert.equal(tickOf(base, 'eu', null), 'sent')
    assert.equal(tickOf(base, 'eu', at(5)), 'sent') // leu antes da mensagem
    assert.equal(tickOf(base, 'eu', at(0)), 'read') // leu depois
    assert.equal(tickOf({ ...base, sender_id: 'outra' }, 'eu', at(0)), 'none') // não é minha
    assert.equal(tickOf({ ...base, deleted_at: at(0) }, 'eu', at(0)), 'none')
})

test('reações: uma linha por emoji, a mais usada primeiro, marca as minhas', () => {
    const rows = [
        { message_id: 'm1', profile_id: 'eu', emoji: '👍' },
        { message_id: 'm1', profile_id: 'ana', emoji: '❤️' },
        { message_id: 'm1', profile_id: 'bia', emoji: '❤️' },
    ]
    assert.deepEqual(reactionChips(rows, 'eu'), [
        { emoji: '❤️', count: 2, mine: false },
        { emoji: '👍', count: 1, mine: true },
    ])
    assert.deepEqual(reactionChips([], 'eu'), [])
})

test('busca na conversa ignora acento e maiúscula e não acha mensagem apagada', () => {
    assert.equal(matchesSearch({ ...base, content: 'Vou chegar às 10' }, 'as 10'), true)
    assert.equal(matchesSearch({ ...base, content: 'Pão de queijo' }, 'PAO'), true)
    assert.equal(matchesSearch({ ...base, content: 'oi' }, ''), false)
    assert.equal(matchesSearch({ ...base, content: 'oi', deleted_at: at(0) }, 'oi'), false)
})
