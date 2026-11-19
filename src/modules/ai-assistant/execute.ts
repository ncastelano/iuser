// src/modules/ai-assistant/execute.ts — o lado do APP da IA do iUser (navegador).
//
// askAi: manda o pedido à rota /api/ai/assistant e recebe o PLANO (já conferido no servidor contra o que a pessoa tem).
// runPlan: executa o plano DEPOIS do Confirmar, com a sessão da própria pessoa — as mesmas gravações das telas de sempre
// (o banco confere tudo: dono da loja, guardas, declaração do motorista, taxa do Pós-pago).
import { supabase } from '@/lib/supabase/client'
import { generateUniqueGlobalSlug } from '@/lib/slugUtils'
import { fetchPlaceSuggestions, newSearchSession, retrievePlace } from '@/lib/placeSearch'
import { announceDriverMode } from '@/lib/driverMode'
import { sendFirstDriverPosition } from '@/lib/driverLocationSync'
import { ensureLegal } from '@/components/legal/LegalHost'
import { brl, type AiPlan } from './domain'

export async function askAi(text: string): Promise<{ plan?: AiPlan; error?: string; code?: string }> {
    try {
        const res = await fetch('/api/ai/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) return { error: data?.error || 'A IA não respondeu. Tente de novo.', code: data?.code }
        return { plan: data.plan as AiPlan }
    } catch {
        return { error: 'Sem conexão. Tente de novo.', code: 'network' }
    }
}

export interface RunResult { ok: boolean; message: string; link?: { label: string; path: string } }
interface Deps { go: (path: string) => void; search: (text: string) => void; near?: { lat: number; lng: number } | null }

// começo de "hoje" no fuso de Porto Velho (UTC−4, sem horário de verão)
function startOfTodayPVH(): string {
    const now = new Date(Date.now() - 4 * 3600_000)
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 4)).toISOString()
}

const fail = (e: any, fallback: string): RunResult => {
    const hint = e?.hint || ''
    if (hint === 'moderation_hidden') return { ok: false, message: 'O iUser ocultou isto após denúncias. Fale com o suporte para revisar.' }
    return { ok: false, message: e?.message ? `${fallback} (${e.message})` : fallback }
}

export async function runPlan(plan: AiPlan, deps: Deps): Promise<RunResult> {
    switch (plan.action) {
        case 'answer': return { ok: true, message: plan.reply }
        case 'search': deps.search(plan.text); return { ok: true, message: `Procurando "${plan.text}"` }
        case 'go': deps.go(plan.path); return { ok: true, message: plan.reply }
        case 'service': deps.go(`/solicitar-servico?tipo=${encodeURIComponent(plan.serviceType)}`); return { ok: true, message: plan.reply }
        case 'store_orders': deps.go(`/painel-loja/${plan.store.slug}/pedidos`); return { ok: true, message: plan.reply }
        case 'ride': {
            // acha o destino no mapa (a mesma busca de lugares do app) e abre o pedido com a chegada preenchida; a pessoa confirma lá
            try {
                const session = newSearchSession()
                const sg = (await fetchPlaceSuggestions(plan.text, deps.near || null, session))[0]
                const place = sg ? await retrievePlace(sg, session) : null
                if (place) {
                    deps.go(`/pedir-motorista?tipo=pessoa&destino=${encodeURIComponent(place.label)}&lat=${place.lat}&lng=${place.lng}`)
                    return { ok: true, message: `Abrindo o pedido de motorista para ${place.label}` }
                }
            } catch { /* cai no pedido sem destino */ }
            deps.go('/pedir-motorista?tipo=pessoa')
            return { ok: true, message: `Não achei "${plan.text}" no mapa. Escolha a chegada no pedido.` }
        }
        case 'store_open': {
            const { error } = await supabase.from('stores').update({ is_active: plan.active }).eq('id', plan.store.id)
            if (error) return fail(error, 'Não deu para mudar a loja')
            return { ok: true, message: plan.active ? `${plan.store.name} está no ar.` : `${plan.store.name} foi pausada.`, link: { label: 'Ver a loja', path: `/${plan.store.slug}` } }
        }
        case 'product_create': {
            try {
                const slug = await generateUniqueGlobalSlug(plan.name)
                const { data, error } = await supabase.from('products').insert({
                    name: plan.name, slug, description: plan.description, price: plan.price, category: plan.category,
                    type: 'physical', price_type: 'fixed', listing_type: 'sale', image_url: null, store_id: plan.store.id,
                    has_addons: false, delivery_units: 1, digital_kind: null,
                }).select('slug').single()
                if (error) throw error
                return { ok: true, message: `${plan.name} cadastrado por ${brl(plan.price)}.`, link: { label: 'Pôr uma foto', path: `/${plan.store.slug}/${data.slug}/editar` } }
            } catch (e) { return fail(e, 'Não deu para cadastrar o produto') }
        }
        case 'product_price': {
            const { error } = await supabase.from('products').update({ price: plan.price }).eq('id', plan.product.id).eq('store_id', plan.store.id)
            if (error) return fail(error, 'Não deu para mudar o preço')
            return { ok: true, message: `${plan.product.name} agora custa ${brl(plan.price)}.` }
        }
        case 'product_active': {
            const { error } = await supabase.from('products').update({ is_active: plan.active }).eq('id', plan.product.id).eq('store_id', plan.store.id)
            if (error) return fail(error, 'Não deu para mudar o produto')
            return { ok: true, message: plan.active ? `${plan.product.name} está no ar.` : `${plan.product.name} saiu do ar.` }
        }
        case 'store_sales': {
            const { data, error } = await supabase.from('orders').select('total_amount')
                .eq('store_id', plan.store.id).eq('status', 'paid').gte('created_at', startOfTodayPVH()).limit(1000)
            if (error) return fail(error, 'Não deu para ver as vendas')
            const n = (data || []).length
            const total = (data || []).reduce((s, o: any) => s + (Number(o.total_amount) || 0), 0)
            return {
                ok: true,
                message: n === 0 ? `${plan.store.name} ainda não teve venda paga hoje.` : `Hoje ${plan.store.name} vendeu ${brl(total)} em ${n} ${n === 1 ? 'pedido pago' : 'pedidos pagos'}.`,
                link: { label: 'Abrir o painel', path: `/painel-loja/${plan.store.slug}` },
            }
        }
        case 'driver_online': {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return { ok: false, message: 'Entre na sua conta.' }
            if (plan.active && !(await ensureLegal('driver_requirements'))) return { ok: false, message: 'Para ficar online, aceite a declaração do motorista.' }
            const { error } = await supabase.from('driver_pricing').update({ driver_mode_active: plan.active, live_location_sync: plan.active }).eq('driver_id', user.id)
            if (error) return fail(error, 'Não deu para mudar o modo motorista')
            announceDriverMode(plan.active)
            if (plan.active) sendFirstDriverPosition(user.id)
            return { ok: true, message: plan.active ? 'Você está online. As corridas e entregas vão aparecer.' : 'Você está offline.', link: plan.active ? { label: 'Ver corridas', path: '/canal-do-motorista' } : undefined }
        }
    }
}
