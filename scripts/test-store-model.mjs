// Modelos de loja (src/lib/storeModel.ts). Rodar: npm run test:store-model
import test from 'node:test'
import assert from 'node:assert/strict'
import { parseStoreModel, pageActions, suggestModelForCategory, isCreatorModel, creatorPage, STORE_MODELS } from '../src/lib/storeModel.ts'

test('parse: valor desconhecido vira mista', () => {
    assert.equal(parseStoreModel('products'), 'products')
    assert.equal(parseStoreModel('x'), 'mixed')
    assert.equal(parseStoreModel(null), 'mixed')
})

test('loja de produtos: só Comprar; atendimento: só Agendar (com produtos, Produtos fica discreto); mista: os dois', () => {
    assert.deepEqual(pageActions('products', true, true), { buy: true, schedule: false, productsSecondary: false, servicesFirst: false, serviceRows: false })
    assert.deepEqual(pageActions('services', true, true), { buy: false, schedule: true, productsSecondary: true, servicesFirst: true, serviceRows: true })
    assert.deepEqual(pageActions('services', true, false), { buy: false, schedule: true, productsSecondary: false, servicesFirst: true, serviceRows: true })
    assert.deepEqual(pageActions('mixed', true, true), { buy: true, schedule: true, productsSecondary: false, servicesFirst: false, serviceRows: true })
})

test('sem agenda ligada, a loja de atendimento ainda oferece Comprar (se não, ficaria sem botão central)', () => {
    assert.equal(pageActions('services', false, true).buy, true)
    assert.equal(pageActions('services', false, true).schedule, false)
    assert.equal(pageActions('mixed', false, true).schedule, false)
})

test('sugestão pela categoria', () => {
    assert.equal(suggestModelForCategory('servicos'), 'services')
    assert.equal(suggestModelForCategory('alimentacao'), 'products')
    assert.equal(suggestModelForCategory('transporte'), 'mixed')
})

test('modelos de criador: Studio (música e vídeo), Conteúdo (audiolivros e podcasts), Editora (livros)', () => {
    for (const m of ['studio', 'content', 'publisher']) {
        assert.equal(parseStoreModel(m), m)
        assert.equal(isCreatorModel(m), true)
        const a = pageActions(m, true, true)
        assert.equal(a.buy, false, m)          // sem botão de comprar no topo
        assert.equal(a.schedule, false, m)     // nem de agendar
    }
    assert.equal(isCreatorModel('mixed'), false)
    assert.equal(creatorPage('studio').tab, 'Músicas e vídeos')
    assert.equal(creatorPage('studio').hero, true)
    assert.ok(creatorPage('studio').heroKinds.includes('filme'))
    assert.equal(creatorPage('content').tab, 'Audiolivros e podcasts')
    assert.deepEqual(creatorPage('content').heroKinds, ['audiolivro', 'podcast'])
    assert.equal(creatorPage('publisher').tab, 'Livros')
    assert.equal(creatorPage('publisher').hero, false)
    assert.equal(STORE_MODELS.length, 6)
})

test('o banco aceita exatamente os modelos que o código conhece', async () => {
    const { readFileSync } = await import('node:fs')
    const mig = readFileSync('supabase/migrations/20261130000060_creator_store_models.sql', 'utf8')
    for (const m of STORE_MODELS) assert.ok(mig.includes(`'${m.id}'`), m.id)
})
