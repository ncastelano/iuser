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

export type PixKeyType = 'cpf' | 'cnpj' | 'email' | 'phone' | 'random'

/** a chave no formato que o Pix exige dentro do QR: CPF/CNPJ só números, telefone "+55DDDNÚMERO", e-mail e aleatória em minúsculas.
 *  Sem o tipo, adivinha pelo jeito da chave (e-mail tem @; 11 dígitos com pontos = CPF; 14 = CNPJ; com parênteses/+ = telefone). */
export function normalizePixKey(key: string, type?: string | null): string {
    const k = key.trim()
    const dig = k.replace(/\D/g, '')
    const t = type || (k.includes('@') ? 'email' : /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(k) ? 'random' : /[()+]/.test(k) || (dig.length === 13 && dig.startsWith('55')) ? 'phone' : dig.length === 14 ? 'cnpj' : dig.length === 11 && /[.-]/.test(k) ? 'cpf' : '')
    if (t === 'cpf' || t === 'cnpj') return dig
    if (t === 'phone') return dig.length >= 12 && dig.startsWith('55') ? `+${dig}` : `+55${dig}`
    if (t === 'email' || t === 'random') return k.toLowerCase()
    return k
}

export function pixBrCode({ key, keyType, name, city, amount, txid = '***' }: { key: string; keyType?: string | null; name: string; city: string; amount?: number; txid?: string }): string {
    const gui = tlv('00', 'br.gov.bcb.pix') + tlv('01', normalizePixKey(key, keyType))
    let p = tlv('00', '01') + tlv('26', gui) + tlv('52', '0000') + tlv('53', '986')
    if (amount && amount > 0) p += tlv('54', amount.toFixed(2))
    p += tlv('58', 'BR') + tlv('59', limpa(name, 25)) + tlv('60', limpa(city, 15)) + tlv('62', tlv('05', txid.replace(/[^A-Za-z0-9*]/g, '').slice(0, 25) || '***'))
    p += '6304'
    return p + crc16(p)
}
