// Testes das regras puras do CLUBE DA LOJA PAGO + MÚSICA (src/modules/club/domain.ts). Rodar: npm run test:club
// (quem recusa de verdade é o banco: supabase/tests/music_club_scenarios.sql)
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { moneyText, parsePriceCents, validateClubPrice, daysLeft, renewState, periodLine, offerLine, canSubscribe, monthlyEstimateCents, CLUB_MIN_CENTS, CLUB_MAX_CENTS, CLUB_PERIOD_DAYS } from '../src/modules/club/domain.ts'

const NOW = Date.parse('2026-11-03T12:00:00Z'), DAY = 86400000
const iso = (days) => new Date(NOW + days * DAY).toISOString()
const sql = readFileSync(new URL('../supabase/migrations/20261130000034_music_club.sql', import.meta.url), 'utf8')

test('dinheiro: sem ",00" quando é redondo', () => {
    assert.equal(moneyText(1990), 'R$ 19,90'); assert.equal(moneyText(2000), 'R$ 20'); assert.equal(moneyText(300), 'R$ 3'); assert.equal(moneyText(50), 'R$ 0,50')
})
test('digitação do preço: vírgula, ponto, R$ e espaços; lixo vira null', () => {
    assert.equal(parsePriceCents('19,90'), 1990); assert.equal(parsePriceCents('19.9'), 1990); assert.equal(parsePriceCents('R$ 20'), 2000); assert.equal(parsePriceCents(' 7 '), 700); assert.equal(parsePriceCents('1.234,50'), 123450)
    for (const bad of ['', 'abc', '1,234', '-5', '5,5,5', '1,2,3', '1,234', null, undefined]) assert.equal(parsePriceCents(bad), null, String(bad))
})
test('a faixa de preço é a do banco (R$ 3 a R$ 500)', () => {
    assert.equal(CLUB_MIN_CENTS, 300); assert.equal(CLUB_MAX_CENTS, 50000); assert.equal(CLUB_PERIOD_DAYS, 30)
    assert.equal(validateClubPrice(300), null); assert.equal(validateClubPrice(50000), null)
    assert.match(validateClubPrice(299), /mínima é R\$ 3/); assert.match(validateClubPrice(50001), /máxima é R\$ 500/); assert.match(validateClubPrice(null), /Digite/)
    assert.match(sql, /p_price_cents < 300 OR p_price_cents > 50000/); assert.match(sql, /amount_cents BETWEEN 300 AND 50000/); assert.match(sql, /interval '30 days'/)
})
test('dias que faltam: arredonda para cima; vencido = 0', () => {
    assert.equal(daysLeft(iso(10), NOW), 10); assert.equal(daysLeft(iso(0.2), NOW), 1); assert.equal(daysLeft(iso(-1), NOW), 0); assert.equal(daysLeft(null, NOW), 0); assert.equal(daysLeft('x', NOW), 0)
})
test('situação do membro pago: ok, vence logo, venceu; grátis não vence', () => {
    assert.equal(renewState({ paid: true, periodEnd: iso(20) }, NOW), 'ok'); assert.equal(renewState({ paid: true, periodEnd: iso(3) }, NOW), 'soon'); assert.equal(renewState({ paid: true, periodEnd: iso(3.5) }, NOW), 'ok')
    assert.equal(renewState({ paid: true, periodEnd: iso(-0.01) }, NOW), 'expired'); assert.equal(renewState({ paid: false, periodEnd: null }, NOW), 'free'); assert.equal(renewState(null, NOW), 'free')
    assert.match(periodLine({ paid: true, periodEnd: iso(20) }, NOW), /^Ativo até \d\d\/\d\d · 20 dias$/); assert.equal(periodLine({ paid: true, periodEnd: iso(0.5) }, NOW), 'Vence amanhã')
    assert.match(periodLine({ paid: true, periodEnd: iso(2) }, NOW), /^Vence em 2 dias/); assert.equal(periodLine({ paid: true, periodEnd: iso(-3) }, NOW), 'Sua assinatura venceu'); assert.equal(periodLine({ paid: false, periodEnd: null }, NOW), 'Você é membro')
})
test('a frase da oferta e quem pode assinar', () => {
    assert.equal(offerLine({ priceCents: 1990, includesMusic: true, tracks: 12 }), 'R$ 19,90 por mês · ouça as 12 músicas da loja')
    assert.equal(offerLine({ priceCents: 1990, includesMusic: true, tracks: 1 }), 'R$ 19,90 por mês · ouça a música da loja')
    assert.equal(offerLine({ priceCents: 1990, includesMusic: false, tracks: 12 }), 'R$ 19,90 por mês'); assert.equal(offerLine({ priceCents: 1990, includesMusic: true, tracks: 0 }), 'R$ 19,90 por mês'); assert.equal(offerLine({ priceCents: null, includesMusic: true, tracks: 3 }), 'Grátis · ouça as 3 músicas da loja')
    const base = { enabled: true, isOwner: false, priceCents: 1000, canCharge: true }
    assert.equal(canSubscribe(base), true); assert.equal(canSubscribe({ ...base, isOwner: true }), false); assert.equal(canSubscribe({ ...base, priceCents: null }), false); assert.equal(canSubscribe({ ...base, canCharge: false }), false); assert.equal(canSubscribe({ ...base, enabled: false }), false)
})
test('estimativa mensal da dona: quem está pagando agora × mensalidade (e zero sem clube pago)', () => {
    assert.equal(monthlyEstimateCents(10, 1990), 19900); assert.equal(monthlyEstimateCents(0, 1990), 0); assert.equal(monthlyEstimateCents(5, null), 0); assert.equal(monthlyEstimateCents(-2, 1990), 0)
})
test('migration: o clube de música só abre ÁUDIO, só com período vigente, e a taxa é do pós-pago', () => {
    assert.match(sql, /c\.kind = 'audio'/); assert.match(sql, /NOT EXISTS \(SELECT 1 FROM public\.digital_contents c WHERE c\.product_id = p\.id AND NOT c\.is_teaser AND c\.kind <> 'audio'\)/, 'produto com arquivo que não é áudio fica de fora')
    assert.match(sql, /m\.source IN \('pix', 'asaas'\) AND m\.current_period_end > now\(\)/); assert.match(sql, /s\.vip_club_price IS NULL AND m\.source = 'free'/, 'grátis só em clube grátis')
    assert.match(sql, /is_postpaid_user\(v_owner\)/); assert.match(sql, /'club_payment_fee'/); assert.match(sql, /OLD\.status IS DISTINCT FROM 'confirmed'/, 'cobra só na transição para confirmado')
    assert.match(sql, /GREATEST\(now\(\), COALESCE/, 'renovar antes de vencer soma ao fim do período')
})
test('telas: a assinatura usa o diálogo, o painel da dona confere o Pix e a música oferece o clube', () => {
    const r = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
    assert.match(r('src/components/club/ClubPayDialog.tsx'), /startClubPayment/); assert.match(r('src/components/club/ClubPayDialog.tsx'), /reportClubPaid/)
    assert.match(r('src/components/club/ClubOwnerPanel.tsx'), /resolveClubPayment/); assert.match(r('src/components/club/ClubOwnerPanel.tsx'), /saveClubSettings/)
    assert.match(r('src/app/(main)/[ownerSlug]/StoreVipClubMember.tsx'), /ClubPayDialog/); assert.match(r('src/components/StoreDashboard/StoreClubVip.tsx'), /ClubOwnerPanel/); assert.match(r('src/components/digital/DigitalGet.tsx'), /ClubPayDialog/)
})
