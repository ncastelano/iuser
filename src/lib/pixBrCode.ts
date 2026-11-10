// O "Pix copia e cola" (BR Code estático do Banco Central, padrão EMV) para a chave Pix da loja — usado pela Venda no balcão (3.0)
// para o cliente pagar na hora. Puro e testado (npm run test:pix-brcode). Não passa por nenhum serviço de fora: o texto e o QR são
// montados no aparelho. O iUser NÃO confirma o pagamento: a loja confere na conta dela e toca "cliente pagou".

const tlv = (id: string, v: string) => `${id}${String(v.length).padStart(2, '0')}${v}`

/** CRC16-CCITT (polinômio 0x1021, início 0xFFFF), como pede o BR Code */
export function crc16(s: string): string {
    let crc = 0xffff
    for (const ch of new TextEncoder().encode(s)) {
        crc ^= ch << 8
        for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
    }
    return crc.toString(16).toUpperCase().padStart(4, '0')
}

/** tira acento e o que o BR Code não aceita, e corta no tamanho */
const limpa = (s: string, n: number) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 .\-]/g, '').trim().slice(0, n) || 'LOJA'

export function pixBrCode({ key, name, city, amount, txid = '***' }: { key: string; name: string; city: string; amount?: number; txid?: string }): string {
    const gui = tlv('00', 'br.gov.bcb.pix') + tlv('01', key.trim())
    let p = tlv('00', '01') + tlv('26', gui) + tlv('52', '0000') + tlv('53', '986')
    if (amount && amount > 0) p += tlv('54', amount.toFixed(2))
    p += tlv('58', 'BR') + tlv('59', limpa(name, 25)) + tlv('60', limpa(city, 15)) + tlv('62', tlv('05', txid.replace(/[^A-Za-z0-9*]/g, '').slice(0, 25) || '***'))
    p += '6304'
    return p + crc16(p)
}
