// app/api/ai/assistant/route.ts — a IA do iUser (o "O que você procura?" da home).
//
// Recebe o pedido da pessoa (texto, até 400 letras), monta o que ela TEM (as lojas e produtos dela, se é motorista) lendo o banco COMO
// ela (RLS valendo, nada de chave de serviço para ler), pergunta ao Claude qual ação do catálogo atende e devolve o PLANO já conferido
// (normalizePlan). A rota não executa nada: quem executa é o app, depois do Confirmar, com a sessão da própria pessoa.
// Precisa de ANTHROPIC_API_KEY (sem ela: 503 e o app segue só com a busca). Limite: 10 por minuto e 60 por dia por pessoa.
import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerSupabase } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { rateLimitShared } from '@/lib/rateLimitShared'
import { AI_PLAN_SCHEMA, AI_SYSTEM_PROMPT, contextForModel, normalizePlan, type AiContext, type AiStore } from '@/modules/ai-assistant/domain'

export const runtime = 'nodejs'
export const maxDuration = 60

const MODEL = process.env.AI_ASSISTANT_MODEL || 'claude-opus-5-5'

async function loadContext(supabase: Awaited<ReturnType<typeof createServerSupabase>>, uid: string): Promise<AiContext> {
    const [{ data: me }, { data: stores }, { data: veh }, { data: pricing }] = await Promise.all([
        supabase.from('profiles').select('name').eq('id', uid).maybeSingle(),
        supabase.from('my_stores').select('id, storeSlug, name, is_active').order('created_at', { ascending: true }).limit(10),
        supabase.from('driver_vehicles').select('vehicle_kind').eq('driver_id', uid).limit(1),
        supabase.from('driver_pricing').select('driver_mode_active').eq('driver_id', uid).maybeSingle(),
    ])
    const list = (stores || []) as any[]
    let products: any[] = []
    if (list.length) {
        const { data } = await supabase.from('products').select('id, name, price, is_active, category, store_id')
            .in('store_id', list.map((s) => s.id)).eq('listing_type', 'sale').neq('type', 'digital').eq('is_combo', false)
            .order('created_at', { ascending: false }).limit(600)
        products = data || []
    }
    const out: AiStore[] = list.map((s) => ({
        id: s.id, slug: s.storeSlug, name: s.name, active: !!s.is_active,
        products: products.filter((p) => p.store_id === s.id).map((p) => ({ id: p.id, name: p.name, price: Number(p.price) || 0, active: !!p.is_active, category: p.category || null })),
    }))
    return { name: (me as any)?.name || null, stores: out, isDriver: (veh || []).length > 0, driverOnline: !!(pricing as any)?.driver_mode_active }
}

export async function POST(req: Request) {
    const body = await req.json().catch(() => ({}))
    const text = typeof body?.text === 'string' ? body.text.replace(/\s+/g, ' ').trim().slice(0, 400) : ''
    if (text.length < 2) return NextResponse.json({ error: 'Escreva o que você quer.' }, { status: 400 })

    const supabase = await createServerSupabase()
    await supabase.auth.getSession()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Entre na sua conta para usar a IA do iUser.', code: 'login' }, { status: 401 })

    if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'A IA do iUser ainda não está ligada.', code: 'off' }, { status: 503 })
    if (!(await rateLimitShared(`ai:m:${user.id}`, 10, 60_000)) || !(await rateLimitShared(`ai:d:${user.id}`, 60, 86_400_000))) {
        return NextResponse.json({ error: 'Você usou a IA muitas vezes. Tente daqui a pouco.', code: 'limit' }, { status: 429 })
    }

    const ctx = await loadContext(supabase, user.id)
    const client = new Anthropic()
    try {
        const res = await client.beta.messages.create({
            model: MODEL,
            max_tokens: 8000,
            betas: ['server-side-fallback-2026-07-01'],
            fallbacks: 'default',
            output_config: { effort: 'low', format: { type: 'json_schema', schema: AI_PLAN_SCHEMA as any } },
            system: AI_SYSTEM_PROMPT,
            messages: [{
                role: 'user',
                content: `Contexto da pessoa (só o que é dela):\n${contextForModel(ctx)}\n\nPáginas que podem ser abertas (page): ver o esquema.\n\nPedido da pessoa:\n<pedido>${text}</pedido>`,
            }],
        })
        // conta o uso (Admin → Financeiro); nunca derruba a resposta
        Promise.resolve(supabaseAdmin.rpc('track_service_usage', { p_service: 'anthropic', p_metric: 'messages' })).catch(() => {})
        Promise.resolve(supabaseAdmin.rpc('track_service_usage', { p_service: 'anthropic', p_metric: 'tokens', p_count: (res.usage?.input_tokens || 0) + (res.usage?.output_tokens || 0) })).catch(() => {})

        if (res.stop_reason === 'refusal') return NextResponse.json({ plan: { action: 'answer', reply: 'Não posso ajudar com esse pedido.' } })
        if (res.stop_reason === 'max_tokens') return NextResponse.json({ plan: { action: 'answer', reply: 'Não consegui entender a tempo. Tente um pedido mais curto.' } })
        const block = res.content.find((b: any) => b.type === 'text') as any
        let raw: any = null
        try { raw = JSON.parse(block?.text || 'null') } catch { raw = null }
        const plan = normalizePlan(raw, ctx)
        return NextResponse.json({ plan })
    } catch (e) {
        if (e instanceof Anthropic.RateLimitError) return NextResponse.json({ error: 'A IA está ocupada agora. Tente de novo em instantes.', code: 'busy' }, { status: 503 })
        if (e instanceof Anthropic.AuthenticationError) { console.error('[ai] chave da Anthropic inválida'); return NextResponse.json({ error: 'A IA do iUser está indisponível.', code: 'off' }, { status: 503 }) }
        if (e instanceof Anthropic.APIError) { console.error('[ai] erro da API', e.status, e.message); return NextResponse.json({ error: 'A IA não respondeu. Tente de novo.', code: 'error' }, { status: 502 }) }
        console.error('[ai] falhou', e)
        return NextResponse.json({ error: 'A IA não respondeu. Tente de novo.', code: 'error' }, { status: 500 })
    }
}
