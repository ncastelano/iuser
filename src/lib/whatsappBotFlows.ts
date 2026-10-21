// src/lib/whatsappBotFlows.ts
//
// A conversa do bot em si — função pura (recebe o estado atual, devolve o
// próximo), separada da rota do webhook pra dar pra testar sem servidor
// rodando (um script chama handleIncomingMessage direto com um cliente
// Supabase de teste). Só lê do banco — "finalizar" não cria o pedido por
// aqui, manda pro carrinho do site (com os itens já adicionados) pra
// terminar lá, onde endereço/pagamento/login já existem prontos.
import type { SupabaseClient } from '@supabase/supabase-js'
import { getStoreStatusText, type BusinessHours } from '@/lib/storeHours'
import { createShortLink } from '@/lib/shortLink'

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

// Cada coisa é uma coisa: produtos (ver / pedir), serviços (ver / agendar), horário e o que a pessoa já fez na loja.
function menuText(storeName: string): string {
    return `Olá! Bem-vindo(a) ao atendimento automático da *${storeName}* 🤖\n\nEscolha uma opção:\n*Produtos*\n1️⃣ Ver produtos\n2️⃣ Fazer um pedido\n3️⃣ Meus pedidos\n\n*Serviços*\n4️⃣ Ver serviços\n5️⃣ Fazer um agendamento\n6️⃣ Meus agendamentos\n\n*Outros*\n7️⃣ Ver horário de funcionamento\n\n(Responda só com o número)`
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

function formatProductList(products: { name: string; price: number | null; duration_minutes?: number | null }[]): string {
    return products
        .map((p, i) => `${i + 1}. ${p.name}${p.price != null && Number(p.price) > 0 ? ` — R$ ${Number(p.price).toFixed(2)}` : ''}${p.duration_minutes ? ` · ${p.duration_minutes} min` : ''}`)
        .join('\n')
}

// Produtos e serviços moram na mesma tabela (type = 'service' é serviço): cada lista traz só o seu tipo.
async function loadActiveProducts(admin: SupabaseClient, storeId: string, kind: 'goods' | 'services' = 'goods') {
    let q = admin
        .from('products')
        .select('id, name, price, image_url, slug, duration_minutes')
        .eq('store_id', storeId)
        .eq('is_active', true)
        .eq('listing_type', 'sale') // exclui publicações e campanhas VIP, que ficam na mesma tabela
    q = kind === 'services' ? q.eq('type', 'service') : q.neq('type', 'service')
    const { data } = await q.order('name').limit(20)
    return data || []
}

// Link para a pessoa agendar na página da loja (a janela de agendar abre sozinha, já com o serviço escolhido).
async function buildScheduleUrl(admin: SupabaseClient, store: StoreRow, productId?: string): Promise<string> {
    const url = new URL(`/${store.storeSlug}`, APP_URL)
    url.searchParams.set('agendar', productId || '1')
    return createShortLink(admin, url.toString())
}

// Storage do Supabase é público — dá pra montar a URL direto do nome do
// arquivo sem precisar do client JS (esse módulo roda só no servidor).
function publicStorageUrl(bucket: string, path: string | null | undefined): string | null {
    if (!path) return null
    if (path.startsWith('http://') || path.startsWith('https://')) return path
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!base) return null
    return `${base}/storage/v1/object/public/${bucket}/${path}`
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://www.iuser.com.br'

// Em vez de criar o pedido direto por aqui (sem endereço, sem forma de
// pagamento de verdade), manda a pessoa pro catálogo da própria loja com
// os itens já adicionados — o checkout de lá já tem entrega/pagamento/
// login prontos. A URL com o pedido inteiro na query string fica enorme,
// por isso passa pelo encurtador antes de virar link de verdade no
// WhatsApp.
async function buildCartUrl(
    admin: SupabaseClient,
    store: StoreRow,
    items: { id: string; name: string; price: number | null; image_url?: string | null; slug?: string; quantity: number }[]
): Promise<string> {
    const payload = {
        items: items.map((it) => ({
            id: it.id,
            name: it.name,
            price: Number(it.price) || 0,
            image_url: publicStorageUrl('product-images', it.image_url),
            slug: it.slug,
            quantity: it.quantity,
        })),
    }
    const url = new URL(`/${store.storeSlug}/catalogo`, APP_URL)
    url.searchParams.set('addCart', JSON.stringify(payload))
    return createShortLink(admin, url.toString())
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
            const products = await loadActiveProducts(admin, store.id, 'goods')
            if (products.length === 0) {
                return { reply: 'Essa loja ainda não tem produtos cadastrados.\n\n' + menuText(store.name), newState: 'menu', newContext: {} }
            }
            return {
                reply: `*Produtos de ${store.name}:*\n\n${formatProductList(products)}\n\nDigite *2* no menu pra fazer um pedido, ou *menu* pra voltar.`,
                newState: 'menu',
                newContext: {},
            }
        }
        if (trimmed === '2') {
            const products = await loadActiveProducts(admin, store.id, 'goods')
            if (products.length === 0) {
                return { reply: 'Essa loja ainda não tem produtos disponíveis pra pedido no momento.\n\n' + menuText(store.name), newState: 'menu', newContext: {} }
            }
            return {
                reply: `*Escolha o item pelo número:*\n\n${formatProductList(products)}\n\n(Digite *cancelar* pra voltar ao menu)`,
                newState: 'ordering_pick_item',
                newContext: {
                    products: products.map((p: any) => ({ id: p.id, name: p.name, price: p.price, image_url: p.image_url, slug: p.slug })),
                    items: [],
                },
            }
        }
        if (trimmed === '4') {
            const services = await loadActiveProducts(admin, store.id, 'services')
            if (services.length === 0) {
                return { reply: 'Essa loja ainda não tem serviços cadastrados.\n\n' + menuText(store.name), newState: 'menu', newContext: {} }
            }
            return {
                reply: `*Serviços de ${store.name}:*\n\n${formatProductList(services)}\n\nDigite *5* no menu pra fazer um agendamento, ou *menu* pra voltar.`,
                newState: 'menu',
                newContext: {},
            }
        }
        if (trimmed === '5') {
            const { data: st } = await admin.from('stores').select('allow_scheduling').eq('id', store.id).maybeSingle()
            if (!(st as { allow_scheduling?: boolean } | null)?.allow_scheduling) {
                return { reply: 'Essa loja ainda não recebe agendamentos pelo iUser.\n\n' + menuText(store.name), newState: 'menu', newContext: {} }
            }
            const services = await loadActiveProducts(admin, store.id, 'services')
            if (services.length === 0) {
                // agenda ligada mas sem serviço na lista: leva direto à janela de agendar da loja
                const link = await buildScheduleUrl(admin, store)
                return { reply: `Abra o link pra escolher dia e horário:\n${link}\n\nDigite *menu* pra voltar.`, newState: 'menu', newContext: {} }
            }
            return {
                reply: `*Qual serviço você quer agendar?* Escolha pelo número:\n\n${formatProductList(services)}\n\nOu digite *0* pra escolher na página.\n(Digite *cancelar* pra voltar ao menu)`,
                newState: 'scheduling_pick_service',
                newContext: { services: services.map((p: any) => ({ id: p.id, name: p.name })) },
            }
        }
        if (trimmed === '7') {
            const statusText = getStoreStatusText(store.business_hours)
            return { reply: `*Horário de ${store.name}:*\n${statusText}\n\nDigite *menu* pra voltar.`, newState: 'menu', newContext: {} }
        }
        // 3 = Meus pedidos, 6 = Meus agendamentos: cada coisa é uma coisa
        if (trimmed === '3' || trimmed === '6') {
            const wantOrders = trimmed === '3'
            if (!convo.matched_profile_id) {
                return {
                    reply:
                        `Não encontrei uma conta iUser com esse número de WhatsApp. Pra ver seus ${wantOrders ? 'pedidos' : 'agendamentos'} por aqui, cadastre esse número no seu perfil do iUser.\n\n` +
                        menuText(store.name),
                    newState: 'menu',
                    newContext: {},
                }
            }
            if (wantOrders) {
                const { data: orders } = await admin
                    .from('orders')
                    .select('id, status, total_amount, created_at')
                    .eq('store_id', store.id)
                    .eq('buyer_id', convo.matched_profile_id)
                    .order('created_at', { ascending: false })
                    .limit(5)
                const lines = (orders || []).map(
                    (o: any) => `📦 Pedido #${String(o.id).slice(0, 8)} — ${ORDER_STATUS_LABEL[o.status] || o.status} — R$ ${Number(o.total_amount).toFixed(2)}`
                )
                const body = lines.length > 0 ? lines.join('\n') : 'Você ainda não fez pedidos nessa loja.'
                return { reply: `*Seus pedidos em ${store.name}:*\n\n${body}\n\nDigite *menu* pra voltar.`, newState: 'menu', newContext: {} }
            }
            const { data: appts } = await admin
                .from('appointments')
                .select('id, status, date, time, service_name')
                .eq('store_id', store.id)
                .eq('customer_id', convo.matched_profile_id)
                .order('date', { ascending: false })
                .limit(5)
            const lines = (appts || []).map(
                (a: any) => `📅 ${a.service_name || 'Agendamento'} — ${a.date} ${a.time || ''} — ${APPT_STATUS_LABEL[a.status] || a.status}`
            )
            const body = lines.length > 0 ? lines.join('\n') : 'Você ainda não tem agendamentos nessa loja.'
            return { reply: `*Seus agendamentos em ${store.name}:*\n\n${body}\n\nDigite *menu* pra voltar.`, newState: 'menu', newContext: {} }
        }
        return { reply: 'Não entendi. ' + menuText(store.name), newState: 'menu', newContext: {} }
    }

    // ===== FAZER AGENDAMENTO: escolher o serviço (o link abre a janela de agendar da loja já com ele) =====
    if (convo.state === 'scheduling_pick_service') {
        const services: { id: string; name: string }[] = convo.context.services || []
        const n = parseInt(trimmed, 10)
        if (trimmed === '0') {
            const link = await buildScheduleUrl(admin, store)
            return { reply: `Abra o link pra escolher o serviço, o dia e o horário:\n${link}\n\nDigite *menu* pra voltar.`, newState: 'menu', newContext: {} }
        }
        if (isNaN(n) || n < 1 || n > services.length) {
            return { reply: 'Número inválido. Escolha um dos serviços da lista, *0* pra escolher na página, ou *cancelar*.', newState: 'scheduling_pick_service', newContext: convo.context }
        }
        const chosen = services[n - 1]
        const link = await buildScheduleUrl(admin, store, chosen.id)
        return {
            reply: `Ótimo! Pra agendar *${chosen.name}*, abra o link e escolha o dia e o horário:\n${link}\n\nDigite *menu* pra voltar.`,
            newState: 'menu',
            newContext: {},
        }
    }

    // ===== FAZER PEDIDO: escolher item (ou finalizar) =====
    if (convo.state === 'ordering_pick_item') {
        const items: { id: string; name: string; price: number | null; image_url?: string | null; slug?: string; quantity: number }[] = convo.context.items || []
        const products: { id: string; name: string; price: number | null; image_url?: string | null; slug?: string }[] = convo.context.products || []

        if (lower === 'finalizar') {
            if (items.length === 0) {
                return { reply: 'Você ainda não adicionou nenhum item. Escolha um da lista, ou digite *cancelar*.', newState: 'ordering_pick_item', newContext: convo.context }
            }
            const total = items.reduce((sum, it) => sum + (Number(it.price) || 0) * it.quantity, 0)
            const summary = items.map((it) => `${it.quantity}x ${it.name}`).join(', ')
            const cartUrl = await buildCartUrl(admin, store, items)

            return {
                reply: `Prontinho! ${summary}\n*Total: R$ ${total.toFixed(2)}*\n\nAbra o link pra finalizar — endereço, forma de pagamento e confirmação ficam por lá:\n${cartUrl}\n\nDigite *menu* pra voltar.`,
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
        const products: { id: string; name: string; price: number | null; image_url?: string | null; slug?: string }[] = convo.context.products || []
        const product = products[convo.context.pendingProductIdx]
        const items = [
            ...(convo.context.items || []),
            { id: product.id, name: product.name, price: product.price, image_url: product.image_url, slug: product.slug, quantity: qty },
        ]
        return {
            reply: `Adicionado: ${qty}x ${product.name}.\n\nQuer adicionar mais algum item? Digite o número dele, ou *finalizar* pra confirmar o pedido.\n\n${formatProductList(products)}`,
            newState: 'ordering_pick_item',
            newContext: { ...convo.context, items },
        }
    }

    return { reply: 'Não entendi. ' + menuText(store.name), newState: 'menu', newContext: {} }
}
