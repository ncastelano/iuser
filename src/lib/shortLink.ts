// src/lib/shortLink.ts
//
// Encurtador de links do próprio iuser: iuser.com.br/s/<code> redireciona
// pra uma URL guardada em public.short_links. Recebe o client Supabase
// como parâmetro (mesmo padrão de whatsappBotFlows.ts) em vez de importar
// um fixo, pra dar pra usar tanto com o service role (bot) quanto num
// script de teste.
import type { SupabaseClient } from '@supabase/supabase-js'

// Sem 0/O/1/I/l — dígitos e letras fáceis de confundir de vista, o link
// pode acabar sendo digitado à mão.
const ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://www.iuser.com.br'

function randomCode(length = 7): string {
    let code = ''
    for (let i = 0; i < length; i++) code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
    return code
}

// Cria um link curto pra targetUrl. Tenta algumas vezes em caso de
// colisão de código (extremamente improvável com 7 caracteres) — se não
// conseguir, devolve a URL original sem encurtar em vez de falhar.
export async function createShortLink(admin: SupabaseClient, targetUrl: string): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
        const code = randomCode()
        const { error } = await admin.from('short_links').insert({ code, target_url: targetUrl })
        if (!error) return `${APP_URL}/s/${code}`
    }
    return targetUrl
}
