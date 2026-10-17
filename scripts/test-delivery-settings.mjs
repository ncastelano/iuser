// Testes das regras puras das configurações da entrega (src/modules/delivery-settings/domain.ts).
// Rodar: npm run test:delivery-settings
import test from 'node:test'
import assert from 'node:assert/strict'
import { validateDeliverySettings, FIELDS, GROUPS, formatSettingValue } from '../src/modules/delivery-settings/domain.ts'

const base = {
    min_freight: 5, max_freight: 60, freight_rounding_step: 0.5, freight_rounding_mode: 'NEAREST', platform_fee_percent: 0,
    initial_radius_km: 5, max_radius_km: 25, radius_step_km: 3, retry_interval_minutes: 5, offer_duration_seconds: 120, max_rounds: 5, max_search_minutes: 30,
    auto_increase_enabled: true, increase_kind: 'fixed', increase_value: 2, max_price_adjustments: 3, price_adjust_interval_minutes: 5,
    auto_increase_cap_amount: null, auto_increase_cap_percent: 20,
    customer_authorization_timeout_minutes: 10, search_strategy: 'RAIO_E_PRECO_SIMULTANEAMENTE',
    reservation_timeout_minutes: 5, reservation_expiry_action: 'RELEASE_AND_SEARCH_AGAIN',
    driver_counter_enabled: true, driver_counter_max_amount: null, driver_counter_max_percent_over_offer: 50, driver_counter_max_per_ride: 3,
    cancel_customer_during_search: true, cancel_customer_during_reservation: true, cancel_driver_after_reservation: true,
    cancel_after_receipt_policy: 'ADMIN_REVIEW', cancel_reason_required: true, admin_review_after_payment: true, admin_review_after_pickup: true, admin_review_payment_dispute: true,
    block_driver_open_obligation: false, obligation_block_min_amount: 0, obligation_unblock_on_settlement: true, obligation_unblock_needs_admin: false,
    new_delivery_flow_enabled: false,
}
const bad = (patch) => validateDeliverySettings({ ...base, ...patch })

test('configuração padrão é válida e cobre todos os campos', () => {
    const r = validateDeliverySettings(base)
    assert.equal(r.ok, true)
    assert.equal(Object.keys(base).length, FIELDS.length)
    assert.ok(FIELDS.every((f) => GROUPS.some((g) => g.id === f.group)))
})

test('raio máximo menor que o inicial é recusado', () => {
    const r = bad({ max_radius_km: 3 })
    assert.equal(r.ok, false)
    assert.match(r.errors.max_radius_km, /raio máximo/i)
})

test('negativos, zeros e absurdos são recusados', () => {
    assert.equal(bad({ min_freight: -1 }).ok, false)
    assert.equal(bad({ increase_value: -2 }).ok, false)
    assert.equal(bad({ reservation_timeout_minutes: 0 }).errors.reservation_timeout_minutes !== undefined, true)
    assert.equal(bad({ max_rounds: 0 }).errors.max_rounds !== undefined, true)
    assert.equal(bad({ radius_step_km: 0 }).errors.radius_step_km !== undefined, true)
    assert.equal(bad({ auto_increase_cap_percent: 900 }).errors.auto_increase_cap_percent !== undefined, true)
    assert.equal(bad({ retry_interval_minutes: 'abc' }).ok, false)
    assert.equal(bad({ max_rounds: 2.5 }).errors.max_rounds !== undefined, true)
})

test('teto automático em R$ maior que o teto absoluto é recusado', () => {
    const r = bad({ auto_increase_cap_amount: 80 })
    assert.equal(r.ok, false)
    assert.match(r.errors.auto_increase_cap_amount, /teto do frete/i)
    assert.equal(bad({ auto_increase_cap_amount: 40 }).ok, true)
})

test('estratégia inexistente é recusada, as três oficiais passam', () => {
    assert.equal(bad({ search_strategy: 'INVENTADA' }).ok, false)
    for (const s of ['EXPANDIR_RAIO_PRIMEIRO', 'AUMENTAR_PRECO_PRIMEIRO', 'RAIO_E_PRECO_SIMULTANEAMENTE']) assert.equal(bad({ search_strategy: s }).ok, true)
})

test('coerência entre tempos', () => {
    assert.equal(bad({ offer_duration_seconds: 400 }).errors.offer_duration_seconds !== undefined, true)   // > rodada de 5 min
    assert.equal(bad({ max_search_minutes: 3 }).errors.max_search_minutes !== undefined, true)               // < rodada
    assert.equal(bad({ max_freight: 3 }).errors.max_freight !== undefined, true)                              // < mínimo
})

test('aumento: percentual ≤ 100, e com aumento automático ligado exige reajuste', () => {
    assert.equal(bad({ increase_kind: 'percent', increase_value: 150 }).errors.increase_value !== undefined, true)
    assert.equal(bad({ increase_kind: 'percent', increase_value: 15 }).ok, true)
    assert.equal(bad({ auto_increase_enabled: true, max_price_adjustments: 0 }).errors.max_price_adjustments !== undefined, true)
    assert.equal(bad({ auto_increase_enabled: false, max_price_adjustments: 0 }).ok, true)
})

test('contraproposta acima do teto é recusada', () => {
    assert.equal(bad({ driver_counter_max_amount: 100 }).errors.driver_counter_max_amount !== undefined, true)
    assert.equal(bad({ driver_counter_max_amount: 30 }).ok, true)
    assert.equal(bad({ driver_counter_max_per_ride: 0 }).ok, false)
})

test('o novo fluxo não pode ser ligado nesta etapa', () => {
    const r = bad({ new_delivery_flow_enabled: true })
    assert.equal(r.ok, false)
    assert.match(r.errors.new_delivery_flow_enabled, /não pode ser ligado/i)
})

test('campos opcionais vazios viram null; vírgula decimal é aceita; arredondamento aceita texto', () => {
    const r = bad({ auto_increase_cap_amount: '', driver_counter_max_amount: '', min_freight: '5,5', freight_rounding_step: '0.10' })
    assert.equal(r.ok, true)
    assert.equal(r.values.auto_increase_cap_amount, null)
    assert.equal(r.values.min_freight, 5.5)
    assert.equal(r.values.freight_rounding_step, 0.1)
})

test('textos do histórico usam linguagem humana', () => {
    assert.equal(formatSettingValue('max_freight', 60), 'R$ 60,00')
    assert.equal(formatSettingValue('max_radius_km', 25), '25 km')
    assert.equal(formatSettingValue('auto_increase_enabled', true), 'ligado')
    assert.equal(formatSettingValue('auto_increase_cap_amount', null), 'sem limite')
    assert.match(formatSettingValue('search_strategy', 'EXPANDIR_RAIO_PRIMEIRO'), /distância primeiro/)
})
