// Cobertura do caminho V2 nos pontos de criação de pedido da loja (Etapa 2.4.1). Garante, por varredura do código, que:
//  - todo arquivo que chama createStoreOrder() consulta o servidor para saber V1/V2 e usa a revisão compartilhada;
//  - nenhum caminho calcula o frete V2 no navegador nem define frete/total/versão;
//  - a regra "V2 = entrega + combinar" fica num lugar só (createStoreOrder.ts).
// Rodar: npm run test:checkout-v2
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..', 'src')
function walk(dir, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name)
        if (e.isDirectory()) walk(p, out)
        else if (/\.(ts|tsx)$/.test(e.name)) out.push(p)
    }
    return out
}
const files = walk(root)
const read = (f) => fs.readFileSync(f, 'utf8')
const callers = files.filter((f) => /\bcreateStoreOrder\(/.test(read(f)) && !f.endsWith('lib/createStoreOrder.ts'))

test('existem exatamente os três pontos de criação de pedido da loja', () => {
    const names = callers.map((f) => path.basename(f)).sort()
    assert.deepEqual(names, ['CarrinhoScreen.tsx', 'CatalogoClientPage.tsx', 'useStoreCheckout.ts'])
})

test('todo ponto de criação consulta o servidor (useCheckoutFlow) e usa a revisão compartilhada', () => {
    for (const f of callers) {
        const src = read(f)
        assert.match(src, /useCheckoutFlows?\(/, `${path.basename(f)} precisa consultar get_checkout_flow`)
        assert.match(src, /estimateId/, `${path.basename(f)} precisa enviar o estimateId`)
        assert.match(src, /isEstimateRejection/, `${path.basename(f)} precisa tratar a recusa da estimativa`)
    }
    // a revisão (V2CheckoutReview) é renderizada nas telas; o hook da página de produto a entrega para ProductClientPage
    for (const name of ['CarrinhoScreen.tsx', 'CatalogoClientPage.tsx', 'ProductClientPage.tsx']) {
        const f = files.find((x) => x.endsWith(name))
        assert.match(read(f), /<V2CheckoutReview/, `${name} precisa renderizar V2CheckoutReview`)
    }
})

test('nenhum ponto define frete, total ou versão do fluxo', () => {
    for (const f of callers.concat(files.filter((x) => x.endsWith('lib/createStoreOrder.ts')))) {
        const src = read(f)
        assert.doesNotMatch(src, /p_flow_version|flow_version\s*:|p_delivery_fee|p_total_amount|p_estimated_freight/, path.basename(f))
    }
    const rpc = read(files.find((x) => x.endsWith('lib/createStoreOrder.ts')))
    assert.match(rpc, /p_estimate_id/)
})

test('regra "V2 = entrega + combinar" mora só em createStoreOrder', () => {
    const rpc = read(files.find((x) => x.endsWith('lib/createStoreOrder.ts')))
    assert.match(rpc, /isV2 \? 'entrega'/)
    assert.match(rpc, /isV2 \? 'combinar'/)
    for (const f of callers) assert.doesNotMatch(read(f), /p_payment_method|p_delivery_option/, `${path.basename(f)} não monta a RPC à mão`)
})

test('em V2 o frete exibido não é calculado no navegador', () => {
    // cada caminho devolve "calculando" (sem valor) para a entrega V2, antes da conta local do V1
    const expected = {
        'CarrinhoScreen.tsx': /if \(isV2Flow\(slug\)\) return \{ fee: 0, isCalculating: true \}/,
        'CatalogoClientPage.tsx': /if \(isV2Delivery\) return \{ fee: 0, isCalculating: true \}/,
        'useStoreCheckout.ts': /if \(isV2Delivery\) return \{ fee: 0, isCalculating: true \}/,
    }
    for (const [name, re] of Object.entries(expected)) {
        const src = read(files.find((x) => x.endsWith(name)))
        const m = re.exec(src)
        assert.ok(m, `${name}: ramo V2 do frete não encontrado`)
        const after = src.slice(m.index)
        assert.ok(after.search(/dtype === 'fixed'|info\.delivery_type === 'fixed'/) > 0, `${name}: a conta local do V1 deve vir depois do ramo V2`)
    }
})

test('a revisão invalida por destino e por validade, e só exige o estimateId no envio', () => {
    const src = read(files.find((x) => x.endsWith('V2CheckoutReview.tsx')))
    assert.match(src, /estimateKey\(address, lat, lng\)/)
    assert.match(src, /isEstimateUsable\(/)
    assert.match(src, /ESTIMATE_EXPIRED_NOTICE/)
    assert.match(src, /onSubmit\(fresh\.estimateId\)/)
    assert.doesNotMatch(src, /estimatedFreight\s*[=:].*onSubmit/)
})
