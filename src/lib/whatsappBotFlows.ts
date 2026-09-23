// src/lib/whatsappBotFlows.ts
//
// A conversa do bot em si — função pura (recebe o estado atual, devolve o
// próximo), separada da rota do webhook pra dar pra testar sem servidor
// rodando (um script chama handleIncomingMessage direto com um cliente
// Supabase de teste). O único efeito colateral é a criação do pedido no
// passo "finalizar" — todo o resto só lê.
import type { SupabaseClient } from '@supabase/supabase-js'
import { getStoreStatusText, type BusinessHours } from '@/lib/storeHours'

export interface ConversationRow {
    id: string
    wa_phone: string
    store_id: string
    matched_profile_id: string | null
    wa_contact_name: string | null
    state: string
    context: Record<string, any>
}

export interface StoreRow {
    id: string
    name: string
    storeSlug: string
    business_hours: BusinessHours | null
}

export interface FlowResult {
    reply: string
    newState: string
    newContext: Record<string, any>
}

const ORDER_STATUS_LABEL: Record<string, string> = {
    pending: 'Aguardando confirmação da loja',
    paid: 'Pago',
    preparing: 'Em preparo',
    ready: 'Pronto',
    delivering: 'Saiu pra entrega',
    completed: 'Concluído',
    cancelled: 'Cancelado',
}

const APPT_STATUS_LABEL: Record<string, string> = {
    pending: 'Aguardando confirmação',
    confirmed: 'Confirmado',
    completed: 'Concluído',
    cancelled: 'Cancelado',
}

function menuText(storeName: string): string {
    return `Olá! Bem-vindo(a) ao atendimento automático da *${storeName}* 🤖\n\nEscolha uma opção:\n1️⃣ Ver produtos/serviços\n2️⃣ Ver horário de funcionamento\n3️⃣ Fazer um pedido\n4️⃣ Meus pedidos e agendamentos\n\n(Responda só com o número)`
}

export function normalizeDigits(s: string | null | undefined): string {
    return (s || '').replace(/\D/g, '')
}

// Gera variações plausíveis do número que a Meta manda (com código do
// país) pra bater com profiles.whatsapp — guardado sem código do país e,
// às vezes, sem o 9º dígito do celular (inconsistência conhecida do
// WhatsApp com números brasileiros: o mesmo número pode chegar das duas
// formas dependendo do aparelho de quem manda).
export function phoneCandidates(waId: string): string[] {
    const digits = normalizeDigits(waId)
    const candidates = new Set<string>()
    if (digits) candidates.add(digits)
    if (digits.startsWith('55') && digits.length >= 12) {
        const local = digits.slice(2)
        if (local) candidates.add(local)
        if (local.length === 11) candidates.add(local.slice(0, 2) + local.slice(3)) // sem o 9º dígito
        if (local.length === 10) candidates.add(local.slice(0, 2) + '9' + local.slice(2)) // com o 9º dígito
    }
    return [...candidates]
}

export async function matchProfileByWhatsApp(
    admin: SupabaseClient,
    waId: string
): Promise<{ id: string; name: string | null; profileSlug: string | null } | null> {
    const candidates = phoneCandidates(waId)
    if (candidates.length === 0) return null
    const { data } = await admin.from('profiles').select('id, name, profileSlug').in('whatsapp', candidates).limit(1)
    return data && data[0] ? (data[0] as any) : null
}

function formatProductList(products: { name: string; price: number | null }[]): string {
    return products.map((p, i) => `${i + 1}. ${p.name}${p.price != null ? ` — R$ ${Number(p.price).toFixed(2)}` : ''}`).join('\n')
}

async function loadActiveProducts(admin: SupabaseClient, storeId: string) {
    const { data } = await admin
        .from('products')
        .select('id, name, price')
        .eq('store_id', storeId)
        .eq('is_active', true)
        .eq('listing_type', 'sale') // exclui publicações e campanhas VIP, que ficam na mesma tabela
        .order('name')
        .limit(20)
    return data || []
}

export async function handleIncomingMessage(
    admin: SupabaseClient,
    convo: ConversationRow,
    store: StoreRow,
    text: string
): Promise<FlowResult> {
    const trimmed = text.trim()
    const lower = trimmed.toLowerCase()

    if (lower === 'menu' || lower === 'oi' || lower === 'olá' || lower === 'ola') {
        return { reply: menuText(store.name), newState: 'menu', newContext: {} }
    }
    if (lower === 'cancelar' && convo.state !== 'menu') {
        return { reply: 'Ok, cancelado.\n\n' + menuText(store.name), newState: 'menu', newContext: {} }
    }

    // ===== MENU =====
    if (convo.state === 'menu') {
        if (trimmed === '1') {
            const products = await loadActiveProducts(admin, store.id)
            if (products.length === 0) {
                return { reply: 'Essa loja ainda não tem produtos cadastrados.\n\n' + menuText(store.name), newState: 'menu', newContext: {} }
            }
            return {
                reply: `*Produtos/serviços de ${store.name}:*\n\n${formatProductList(products)}\n\nDigite *3* no menu pra fazer um pedido, ou *menu* pra voltar.`,
                newState: 'menu',
                newContext: {},
            }
        }
        if (trimmed === '2') {
            const statusText = getStoreStatusText(store.business_hours)
            return { reply: `*Horário de ${store.name}:*\n${statusText}\n\nDigite *menu* pra voltar.`, newState: 'menu', newContext: {} }
        }
        if (trimmed === '3') {
            const products = await loadActiveProducts(admin, store.id)
            if (products.length === 0) {
                return { reply: 'Essa loja ainda não tem produtos disponíveis pra pedido no momento.\n\n' + menuText(store.name), newState: 'menu', newContext: {} }
            }
            return {
                reply: `*Escolha o item pelo número:*\n\n${formatProductList(products)}\n\n(Digite *cancelar* pra voltar ao menu)`,
                newState: 'ordering_pick_item',
                newContext: { products: products.map((p: any) => ({ id: p.id, name: p.name, price: p.price })), items: [] },
            }
        }
        if (trimmed === '4') {
            if (!convo.matched_profile_id) {
                return {
                    reply:
                        'Não encontrei uma conta iUser com esse número de WhatsApp. Pra ver seus pedidos e agendamentos por aqui, cadastre esse número no seu perfil do iUser.\n\n' +
                        menuText(store.name),
                    newState: 'menu',
                    newContext: {},
                }
            }
            const [{ data: orders }, { data: appts }] = await Promise.all([
                admin
                    .from('orders')
                    .select('id, status, total_amount, created_at')
                    .eq('store_id', store.id)
                    .eq('buyer_id', convo.matched_profile_id)
                    .order('created_at', { ascending: false })
                    .limit(5),
                admin
                    .from('appointments')
                    .select('id, status, date, time, service_name')
                    .eq('store_id', store.id)
                    .eq('customer_id', convo.matched_profile_id)
                    .order('date', { ascending: false })
                    .limit(5),
            ])
            const orderLines = (orders || []).map(
                (o: any) => `📦 Pedido #${String(o.id).slice(0, 8)} — ${ORDER_STATUS_LABEL[o.status] || o.status} — R$ ${Number(o.total_amount).toFixed(2)}`
            )
            const apptLines = (appts || []).map(
                (a: any) => `📅 ${a.service_name || 'Agendamento'} — ${a.date} ${a.time || ''} — ${APPT_STATUS_LABEL[a.status] || a.status}`
            )
            const lines = [...orderLines, ...apptLines]
            const body = lines.length > 0 ? lines.join('\n') : 'Você ainda não tem pedidos ou agendamentos nessa loja.'
            return { reply: `*Seus pedidos e agendamentos em ${store.name}:*\n\n${body}\n\nDigite *menu* pra voltar.`, newState: 'menu', newContext: {} }
        }
        return { reply: 'Não entendi. ' + menuText(store.name), newState: 'menu', newContext: {} }
    }

    // ===== FAZER PEDIDO: escolher item (ou finalizar) =====
    if (convo.state === 'ordering_pick_item') {
        const items: { id: string; name: string; price: number | null; quantity: number }[] = convo.context.items || []
        const products: { id: string; name: string; price: number | null }[] = convo.context.products || []

        if (lower === 'finalizar') {
            if (items.length === 0) {
                return { reply: 'Você ainda não adicionou nenhum item. Escolha um da lista, ou digite *cancelar*.', newState: 'ordering_pick_item', newContext: convo.context }
            }
            const total = items.reduce((sum, it) => sum + (Number(it.price) || 0) * it.quantity, 0)

            let buyerName = convo.wa_contact_name || 'Cliente WhatsApp'
            let buyerSlug: string = convo.wa_phone
            if (convo.matched_profile_id) {
                const { data: profile } = await admin.from('profiles').select('name, profileSlug').eq('id', convo.matched_profile_id).maybeSingle()
                if (profile?.name) buyerName = profile.name
                if (profile?.profileSlug) buyerSlug = profile.profileSlug
            }

            const { data: order, error: orderError } = await admin
                .from('orders')
                .insert({
                    store_id: store.id,
                    buyer_id: convo.matched_profile_id,
                    buyer_name: buyerName,
                    buyer_profile_slug: buyerSlug,
                    total_amount: total,
                    delivery_fee: 0,
                    delivery_option: 'retirada',
                    payment_method: 'combinar',
                    status: 'pending',
                    channel: 'whatsapp_bot',
                    checkout_id: crypto.randomUUID(),
                })
                .select('id')
                .single()

            if (orderError || !order) {
                return { reply: 'Ops, deu um erro ao registrar seu pedido. Tente de novo em instantes.\n\n' + menuText(store.name), newState: 'menu', newContext: {} }
            }

            const orderItems = items.map((it) => ({
                order_id: order.id,
                product_id: it.id,
                product_name: it.name,
                quantity: it.quantity,
                unit_price: it.price,
                total_price: (Number(it.price) || 0) * it.quantity,
            }))
            const { error: itemsError } = await admin.from('order_items').insert(orderItems)
            if (itemsError) {
                await admin.from('orders').delete().eq('id', order.id)
                return { reply: 'Ops, deu um erro ao salvar os itens do pedido. Tente de novo.\n\n' + menuText(store.name), newState: 'menu', newContext: {} }
            }

            const summary = items.map((it) => `${it.quantity}x ${it.name}`).join(', ')
            return {
                reply: `✅ Pedido registrado! #${String(order.id).slice(0, 8)}\n${summary}\n*Total: R$ ${total.toFixed(2)}*\n\nA loja vai confirmar por aqui. Combine a forma de pagamento e retirada com ela.\n\nDigite *menu* pra voltar.`,
                newState: 'menu',
                newContext: {},
            }
        }

        const idx = parseInt(trimmed, 10) - 1
        if (isNaN(idx) || idx < 0 || idx >= products.length) {
            return {
                reply: `Número inválido. Escolha um dos itens da lista${items.length > 0 ? ', digite *finalizar* pra confirmar' : ''}, ou *cancelar*.`,
                newState: 'ordering_pick_item',
                newContext: convo.context,
            }
        }
        return {
            reply: `Quantas unidades de *${products[idx].name}* você quer?`,
            newState: 'ordering_quantity',
            newContext: { ...convo.context, pendingProductIdx: idx },
        }
    }

    // ===== FAZER PEDIDO: quantidade =====
    if (convo.state === 'ordering_quantity') {
        const qty = parseInt(trimmed, 10)
        if (isNaN(qty) || qty <= 0) {
            return { reply: 'Digite uma quantidade válida (só número).', newState: 'ordering_quantity', newContext: convo.context }
        }
        const products: { id: string; name: string; price: number | null }[] = convo.context.products || []
        const product = products[convo.context.pendingProductIdx]
        const items = [...(convo.context.items || []), { id: product.id, name: product.name, price: product.price, quantity: qty }]
        return {
            reply: `Adicionado: ${qty}x ${product.name}.\n\nQuer adicionar mais algum item? Digite o número dele, ou *finalizar* pra confirmar o pedido.\n\n${formatProductList(products)}`,
            newState: 'ordering_pick_item',
            newContext: { ...convo.context, items },
        }
    }

    return { reply: 'Não entendi. ' + menuText(store.name), newState: 'menu', newContext: {} }
}
