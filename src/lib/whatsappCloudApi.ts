// src/lib/whatsappCloudApi.ts
//
// Cliente fino da WhatsApp Business Platform (Meta Cloud API). Cada loja
// tem o próprio número (phoneNumberId) dentro da mesma conta/app — o
// token de acesso é um só (do app), mas o número usado pra enviar muda
// por chamada, então phoneNumberId é sempre parâmetro, nunca fixo aqui.

const GRAPH_API_VERSION = 'v21.0'
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN
const WHATSAPP_APP_SECRET = process.env.WHATSAPP_APP_SECRET

export class WhatsAppNotConfiguredError extends Error {
    constructor() {
        super('WHATSAPP_ACCESS_TOKEN não configurado — o bot de WhatsApp ainda não foi ativado no ambiente.')
        this.name = 'WhatsAppNotConfiguredError'
    }
}

// A Meta manda o "from" de contatos brasileiros sem o 9º dígito (ex:
// 556999693632), mas pra ENVIAR de volta ela espera o número completo
// com o 9 (5569999693632) — sem isso a API recusa com "(#131030)
// Recipient phone number not in allowed list" em números de teste.
function withNinthDigit(waId: string): string {
    const digits = waId.replace(/\D/g, '')
    if (digits.startsWith('55') && digits.length === 12) {
        const ddd = digits.slice(2, 4)
        const local = digits.slice(4)
        if (local.length === 8) return `55${ddd}9${local}`
    }
    return digits
}

// Manda uma mensagem de texto livre pelo número (phoneNumberId) de uma
// loja específica. Assume que está dentro da janela de 24h de "serviço"
// (resposta a quem escreveu primeiro) — é assim que o fluxo inteiro do
// bot é desenhado, então nunca deveria gerar cobrança.
export async function sendWhatsAppText(phoneNumberId: string, to: string, body: string): Promise<void> {
    if (!WHATSAPP_ACCESS_TOKEN) throw new WhatsAppNotConfiguredError()

    const res = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        },
        body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: withNinthDigit(to),
            type: 'text',
            text: { body, preview_url: false },
        }),
    })

    if (!res.ok) {
        const errText = await res.text().catch(() => '')
        throw new Error(`Erro ao enviar mensagem WhatsApp (${res.status}): ${errText}`)
    }
}

// Confere a assinatura HMAC-SHA256 que a Meta manda em todo webhook
// (header X-Hub-Signature-256, formato "sha256=<hex>") — sem isso,
// qualquer um poderia mandar POST pro endpoint fingindo ser a Meta.
// Comparação em tempo constante pra não vazar o segredo por timing.
export async function verifyWebhookSignature(rawBody: string, signatureHeader: string | null): Promise<boolean> {
    if (!WHATSAPP_APP_SECRET || !signatureHeader) return false
    const prefix = 'sha256='
    if (!signatureHeader.startsWith(prefix)) return false
    const providedHex = signatureHeader.slice(prefix.length)

    const crypto = await import('node:crypto')
    const expected = crypto.createHmac('sha256', WHATSAPP_APP_SECRET).update(rawBody, 'utf8').digest('hex')

    const a = Buffer.from(providedHex, 'hex')
    const b = Buffer.from(expected, 'hex')
    if (a.length !== b.length) return false
    return crypto.timingSafeEqual(a, b)
}
