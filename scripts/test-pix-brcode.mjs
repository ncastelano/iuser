// npm run test:pix-brcode — o Pix copia e cola da Venda no balcão (src/lib/pixBrCode.ts)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { crc16, pixBrCode } from '../src/lib/pixBrCode.ts'

test('CRC16-CCITT confere com o valor de referência ("123456789" = 29B1)', () => {
    assert.equal(crc16('123456789'), '29B1')
})
test('monta o BR Code com chave, valor, nome e cidade, e o CRC no fim bate', () => {
    const c = pixBrCode({ key: 'loja@exemplo.com', name: 'Pizzaria Forno de Ouro', city: 'Porto Velho', amount: 59.9 })
    assert.match(c, /^000201/)
    assert.ok(c.includes('0014br.gov.bcb.pix0116loja@exemplo.com'))
    assert.ok(c.includes('540559.90'))
    assert.ok(c.includes('5802BR'))
    assert.equal(c.slice(-4), crc16(c.slice(0, -4)))
})
test('sem valor não leva o campo 54; nome com acento e grande é limpo e cortado', () => {
    const c = pixBrCode({ key: '+5569999999999', name: 'Padaria São João da Esquina Feliz Ltda', city: 'Ji-Paraná' })
    assert.ok(!c.includes('5405'))
    assert.ok(c.includes('5925Padaria Sao Joao da Esqui'))
    assert.ok(c.includes('6009Ji-Parana'))
})
