// Testes das regras puras do aluguel de imóveis (src/modules/rentals/domain.ts).
// Rodar: npm run test:rentals
import test from 'node:test'
import assert from 'node:assert/strict'
import { priceLabel, monthlyTotal, moveInCost, stayTotal, specsLine, approxCoord, filterListings, EMPTY_FILTERS, activeFilterCount, validateListing, trustBadge, listingSlug } from '../src/modules/rentals/domain.ts'

const apto = { price: 1800, condoFee: 250, iptuFee: 50, depositAmount: 3600, rentalKind: 'mensal', minStayDays: null }
const base = (o = {}) => ({ rentalKind: 'mensal', propertyType: 'apartamento', price: 1500, bedrooms: 2, bathrooms: 1, parking: 1, areaM2: 60, amenities: [], storeId: null, petsAllowed: false, furnished: false, neighborhood: 'Centro', city: 'Porto Velho', title: 'Apto Centro', createdAt: '2026-10-01T00:00:00Z', ...o })

test('preço: mês ou dia', () => {
    assert.match(priceLabel(apto), /R\$\s?1\.800\/mês/)
    assert.match(priceLabel({ price: 120, rentalKind: 'temporada' }), /R\$\s?120\/dia/)
})
test('quanto custa de verdade: aluguel + condomínio + IPTU; para entrar soma a caução', () => {
    assert.equal(monthlyTotal(apto), 2100)
    assert.equal(moveInCost(apto), 5700)
    assert.equal(monthlyTotal({ ...apto, rentalKind: 'temporada' }), null)
})
test('temporada: total das diárias respeita o mínimo', () => {
    const t = { price: 100, rentalKind: 'temporada', minStayDays: 3 }
    assert.equal(stayTotal(t), 300)
    assert.equal(stayTotal(t, 2), 300)
    assert.equal(stayTotal(t, 5), 500)
    assert.equal(stayTotal(apto), null)
})
test('ficha: só o que foi informado, com plural certo', () => {
    assert.equal(specsLine({ bedrooms: 1, bathrooms: 1, parking: 0, areaM2: 38.5 }), '1 quarto · 1 banheiro · 38,5 m²')
    assert.equal(specsLine({ bedrooms: 3, bathrooms: null, parking: 2, areaM2: null }), '3 quartos · 2 vagas')
})
test('posição aproximada arredonda para ~1 km', () => {
    assert.equal(approxCoord(-8.76234), -8.76)
    assert.equal(approxCoord(-63.9051), -63.91)
})
test('busca: tipo, preço, quartos, pet, mobiliado, lugar (sem acento) e ordem', () => {
    const items = [base({ id: 1, price: 1500 }), base({ id: 2, propertyType: 'casa', price: 2500, bedrooms: 3, petsAllowed: true, neighborhood: 'Olaria' }),
        base({ id: 3, rentalKind: 'temporada', price: 120, furnished: true, neighborhood: 'Embratel', createdAt: '2026-10-20T00:00:00Z' })]
    const ids = (f) => filterListings(items, { ...EMPTY_FILTERS, ...f }).map((i) => i.id)
    assert.deepEqual(ids({}), [3, 1, 2])                                  // mais novos primeiro
    assert.deepEqual(ids({ kind: 'temporada' }), [3])
    assert.deepEqual(ids({ types: ['casa'] }), [2])
    assert.deepEqual(ids({ maxPrice: 1600 }), [3, 1])
    assert.deepEqual(ids({ minBedrooms: 3 }), [2])
    assert.deepEqual(ids({ pets: true }), [2])
    assert.deepEqual(ids({ furnished: true }), [3])
    assert.deepEqual(ids({ where: 'olária' }), [2])                         // sem acento e sem maiúscula, nos dois lados
    assert.deepEqual(ids({ where: 'olaria' }), [2])
    assert.deepEqual(ids({ sort: 'menor_preco' }), [3, 1, 2])
    assert.deepEqual(ids({ sort: 'maior_preco' }), [2, 1, 3])
})
test('anúncio: o que falta aparece como erro', () => {
    const ok = { title: 'Apto 2 quartos', propertyType: 'apartamento', rentalKind: 'mensal', price: 1500, condoFee: 0, iptuFee: 0, depositAmount: 0, neighborhood: 'Centro', city: 'Porto Velho', address: 'Rua A', bedrooms: 2, minStayDays: null, maxGuests: null, photos: 3 }
    assert.deepEqual(validateListing(ok), {})
    const bad = validateListing({ ...ok, title: 'a', propertyType: '', price: null, neighborhood: '', address: '', photos: 0 })
    for (const k of ['title', 'propertyType', 'price', 'neighborhood', 'address', 'photos']) assert.ok(bad[k], `faltou erro em ${k}`)
    assert.ok(validateListing({ ...ok, photos: 13 }).photos)
    assert.ok(validateListing({ ...ok, rentalKind: 'temporada', minStayDays: 0 }).minStayDays)
})
test('selo de confiança', () => {
    assert.equal(trustBadge({ badge: 'agency' }).label, 'Imobiliária')
    assert.equal(trustBadge({ badge: 'trusted' }).label, 'Anunciante confiável')
    assert.equal(trustBadge({ badge: null }), null)
    assert.equal(trustBadge(null), null)
})

test('endereço do anúncio: sem acento, sem símbolo, com sufixo', () => {
    const slug = listingSlug('Apartamento 2 quartos — Olaria!', 'São Cristóvão', () => 0)
    assert.match(slug, /^apartamento-2-quartos-olaria-sao-cristovao-?[a-z0-9]*-aaaaa$/)
    assert.match(listingSlug('', '', () => 0.5), /^imovel-[a-z0-9]{5}$/)
})

test('busca avançada: faixa de preço, banheiros, vagas, área, comodidades e imobiliária', () => {
    const items = [
        base({ id: 1, price: 900, bathrooms: 1, parking: 0, areaM2: 30, amenities: ['Wi-Fi'] }),
        base({ id: 2, price: 1800, bathrooms: 2, parking: 2, areaM2: 90, amenities: ['Wi-Fi', 'Piscina'], storeId: 's1', createdAt: '2026-10-02T00:00:00Z' }),
        base({ id: 3, price: 3000, bathrooms: 3, parking: 1, areaM2: 140, amenities: ['Piscina'], createdAt: '2026-10-03T00:00:00Z' }),
    ]
    const ids = (f) => filterListings(items, { ...EMPTY_FILTERS, ...f, sort: 'menor_preco' }).map((i) => i.id)
    assert.deepEqual(ids({ minPrice: 1000, maxPrice: 2000 }), [2])
    assert.deepEqual(ids({ minBathrooms: 2 }), [2, 3])
    assert.deepEqual(ids({ minParking: 1 }), [2, 3])
    assert.deepEqual(ids({ minArea: 100 }), [3])
    assert.deepEqual(ids({ amenities: ['Wi-Fi', 'Piscina'] }), [2])           // precisa ter TODAS
    assert.deepEqual(ids({ amenities: ['Piscina'] }), [2, 3])
    assert.deepEqual(ids({ agencyOnly: true }), [2])
})
test('contador de filtros ligados (ordem e busca por lugar não contam)', () => {
    assert.equal(activeFilterCount(EMPTY_FILTERS), 0)
    assert.equal(activeFilterCount({ ...EMPTY_FILTERS, where: 'centro', sort: 'menor_preco' }), 0)
    assert.equal(activeFilterCount({ ...EMPTY_FILTERS, kind: 'mensal', types: ['casa'], maxPrice: 2000, pets: true, amenities: ['Wi-Fi'] }), 5)
})
