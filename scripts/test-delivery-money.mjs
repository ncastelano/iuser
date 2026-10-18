// Etapa 2.7 — o fluxo financeiro do V2 é só DECLARATÓRIO. Varre a migration e as telas para garantir que não entrou custódia, split, gateway
// nem linguagem de confirmação bancária, e que o frete do motorista continua integral. Rodar: npm run test:delivery-money
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
const mig = read('supabase/migrations/20261102000000_v2_declaratory_payments.sql')
// só o código executável (sem os comentários que explicam o que NÃO existe)
const sqlCode = mig.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
const ui = ['CustomerPayInstructions', 'StoreDeliveryPayment', 'DriverReceiptConfirm', 'DriverPayoutPix'].map((n) => read(`src/components/DeliveryPayment/${n}.tsx`)).join('\n')
const text = read('src/modules/delivery-search/domain.ts')

test('nenhuma custódia, split, gateway ou chamada Asaas na etapa financeira', () => {
    assert.doesNotMatch(sqlCode, /asaas|net\.http_post|wallet|split|transfer|withdraw|saque|commission|comiss/i)
    assert.doesNotMatch(ui, /asaas|wallet|split|transfer/i)
    assert.doesNotMatch(ui, /fetch\(|\/api\//)           // as telas só falam com as RPCs de declaração
})

test('não mexe nas tabelas de monetização', () => {
    assert.doesNotMatch(sqlCode, /driver_postpaid_charges|service_pricing|subscriptions|delivery_obligations/i)
})

test('toda declaração é registrada como declaratória e nunca como confirmação bancária', () => {
    assert.match(sqlCode, /'declaratory', true/)
    const labels = ui + text
    assert.doesNotMatch(labels, /confirmado pelo banco|pix confirmado|pagamento confirmado|banco confirmou/i)
    assert.match(text, /não recebe, não guarda e não repassa/)
})

test('o motorista recebe exatamente o frete aceito: nenhum desconto na etapa financeira', () => {
    assert.match(sqlCode, /p_amount IS DISTINCT FROM d\.frozen_freight/)
    assert.match(sqlCode, /'amount_to_pay_driver', d\.frozen_freight/)
    assert.doesNotMatch(sqlCode, /frozen_freight\s*[-*]\s|0[.,]50|platform_fee|postpaid_price/i)
})

test('clique repetido não duplica: uma declaração de cada tipo por entrega', () => {
    assert.match(sqlCode, /CREATE UNIQUE INDEX IF NOT EXISTS dpe_once_per_dispatch/)
    for (const k of ['store_declared_customer_payment', 'store_declared_driver_payment', 'driver_confirmed_receipt', 'driver_declared_not_received']) {
        assert.match(sqlCode, new RegExp(`'${k}'`))
    }
})

test('o Pix do motorista não usa profiles.pix_key (legível por todos)', () => {
    assert.doesNotMatch(sqlCode, /profiles\.pix_key|FROM public\.profiles[^;]*pix_key/i)
    assert.match(sqlCode, /driver_payout_keys/)
    assert.doesNotMatch(read('src/components/DeliveryPayment/CustomerPayInstructions.tsx'), /driver_pix|payout/i)
})
