// app/api/auth/cpf-available/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { clientIp, rateLimit } from '@/lib/rateLimit'

// Um CPF/CNPJ só pode estar em UM perfil. O cadastro (ainda sem login) pergunta aqui antes de criar a conta.
// Antes a tela filtrava `profiles` por `cpf_cnpj` direto no navegador — o que obrigava a coluna a ser legível por
// qualquer pessoa. Agora o navegador só recebe "ocupado: sim/não"; a coluna é privada.
// Limite por IP para encarecer consulta em massa (é um sim/não por documento, nunca devolve dados de ninguém).
export async function POST(req: Request) {
    const ip = clientIp(req)
    if (!rateLimit(`cpf-check:${ip}`, 20, 60_000)) {
        return NextResponse.json({ error: 'Muitas tentativas. Aguarde um minuto.' }, { status: 429 })
    }
    const body = await req.json().catch(() => ({}))
    const digits = String(body?.cpfCnpj || '').replace(/\D/g, '')
    if (digits.length !== 11 && digits.length !== 14) {
        return NextResponse.json({ error: 'Documento inválido' }, { status: 400 })
    }
    const { data, error } = await supabaseAdmin.from('profiles').select('id').eq('cpf_cnpj', digits).maybeSingle()
    if (error) return NextResponse.json({ error: 'Não foi possível verificar agora' }, { status: 500 })
    return NextResponse.json({ taken: !!data })
}
