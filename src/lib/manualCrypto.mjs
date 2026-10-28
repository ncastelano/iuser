// src/lib/manualCrypto.mjs
//
// Criptografia do MANUAL DE REGRAS (cofre do administrador). Só node:crypto, sem dependência: o servidor (src/lib/adminVault.ts) e o script que envia o texto
// ao banco (scripts/local/seed-manual.mjs) usam ESTE arquivo, então o que um cifra o outro decifra. Nada aqui roda no navegador.
//
//   - AES-256-GCM (autenticada: qualquer alteração no texto cifrado faz a leitura falhar).
//   - Duas chaves derivadas (HKDF-SHA256) de UM segredo do servidor: uma cifra o conteúdo, a outra assina a sessão do manual.
//   - O id do capítulo no banco é opaco (HMAC do nome), e entra como dado associado da cifra: um capítulo copiado para outra linha não decifra.
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto'

/** Deriva uma chave de 32 bytes do segredo, separada por finalidade */
export function deriveKey(secret, purpose) {
    if (typeof secret !== 'string' || secret.length < 32) throw new Error('segredo do manual ausente ou curto demais (mínimo 32 caracteres)')
    return Buffer.from(hkdfSync('sha256', Buffer.from(secret, 'utf8'), Buffer.from('iuser-manual-v1'), Buffer.from(purpose, 'utf8'), 32))
}

const b64u = (buf) => Buffer.from(buf).toString('base64url')
const unb64u = (s) => Buffer.from(s, 'base64url')

/** Texto (ou objeto) → "v1.<iv>.<tag>.<cifra>"; `aad` amarra o texto ao capítulo */
export function encryptText(secret, plain, aad = '') {
    const key = deriveKey(secret, 'manual-content')
    const iv = randomBytes(12)
    const c = createCipheriv('aes-256-gcm', key, iv)
    c.setAAD(Buffer.from(aad, 'utf8'))
    const ct = Buffer.concat([c.update(typeof plain === 'string' ? plain : JSON.stringify(plain), 'utf8'), c.final()])
    return `v1.${b64u(iv)}.${b64u(c.getAuthTag())}.${b64u(ct)}`
}

/** Faz o caminho de volta; falha (lança) se o texto, a chave ou o `aad` não conferem */
export function decryptText(secret, packed, aad = '') {
    const [v, iv, tag, ct] = String(packed).split('.')
    if (v !== 'v1' || !iv || !tag || !ct) throw new Error('formato inválido')
    const d = createDecipheriv('aes-256-gcm', deriveKey(secret, 'manual-content'), unb64u(iv))
    d.setAAD(Buffer.from(aad, 'utf8'))
    d.setAuthTag(unb64u(tag))
    return Buffer.concat([d.update(unb64u(ct)), d.final()]).toString('utf8')
}

/** Id opaco do capítulo no banco (16 hex) a partir do nome de uma palavra */
export function chapterKey(secret, slug) {
    return createHmac('sha256', deriveKey(secret, 'manual-chapter-id')).update(String(slug)).digest('hex').slice(0, 16)
}

/** Assina um objeto pequeno (a sessão do manual): "<corpo>.<assinatura>" */
export function signToken(secret, obj) {
    const body = b64u(JSON.stringify(obj))
    const sig = createHmac('sha256', deriveKey(secret, 'manual-session')).update(body).digest('base64url')
    return `${body}.${sig}`
}

/** Confere a assinatura e a validade; devolve o objeto ou null */
export function verifyToken(secret, token, now = Date.now()) {
    const [body, sig] = String(token || '').split('.')
    if (!body || !sig) return null
    const expect = createHmac('sha256', deriveKey(secret, 'manual-session')).update(body).digest()
    let given
    try { given = unb64u(sig) } catch { return null }
    if (given.length !== expect.length || !timingSafeEqual(given, expect)) return null
    try {
        const obj = JSON.parse(unb64u(body).toString('utf8'))
        return typeof obj.exp === 'number' && obj.exp > now ? obj : null
    } catch { return null }
}
