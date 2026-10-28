// src/app/tres-telas/scenes.ts — os ROTEIROS do TEATRO (só LOCAL): cada pessoa usa o app de verdade, com cursor, rolagem e digitação, nos quadros de /tres-telas.
//   Cliente (Gabriela): abre o iUser, procura, entra na loja, vê o catálogo, escolhe, preenche e confirma a compra, espera a entrega e avalia.
//   Dono (admin-teste): vê o painel, aceita o pedido dela, prepara e marca pronto (e vê o motorista chegando).
//   Motorista (Dani): recebe a entrega "do nada", aceita, vai à loja, espera, pega, faz o trajeto e entrega.
// O simulador (`simulate-pizzaria.py --stage`) deixa os pedidos da Gabriela e a corrida da Dani por conta destas telas.
import { Stage, pick, rnd, sleep, type Who } from './stage'

export interface Obs { featured?: { id: string; status: string; delivery_option: string }[]; log?: string[]; openOffers?: number; drivers?: { id: string; key: string; name: string; capacity: number; stops: number; deliveredLastHour: number }[] }
type Ctx = { st: Stage; gen: number; obs: () => Obs | null; say: (who: Who, msg: string) => void; setDriver: (key: string) => void }

const ADDRESSES = ['Rua das Palmeiras, 120, Porto Velho', 'Av. Jorge Teixeira, 3400, Porto Velho', 'Rua Dom Pedro II, 800, Porto Velho', 'Av. Calama, 1500, Porto Velho', 'Rua Rafael Vaz e Silva, 450, Porto Velho']
const PIZZAS = ['Pizza Margherita (grande)', 'Pizza Calabresa (grande)', 'Pizza Portuguesa (grande)', 'Pizza Frango com Catupiry (grande)', 'Pizza Quatro Queijos (grande)', 'Pizza Bacon com Cheddar (grande)']
const EXTRAS = ['Coca-Cola 2 L', 'Combo Casal: 1 pizza grande + 2 latas', 'Petit gâteau com sorvete', 'Anel de cebola empanado']
const ADDONS = ['Borda recheada de catupiry', 'Bacon extra', 'Catupiry extra', 'Cheddar extra', 'Azeitona']
const NOTES = ['Sem cebola, por favor', 'Capricha no queijo', 'Cortar em 12 fatias', 'Bem passada', 'Tocar o interfone']
const HANDLE = '@gabriela-carvalho-7'

const alive = (c: Ctx) => !c.st.stopped && c.st.gen === c.gen
/** pausa "de gente": espera um tempo e sai na hora se o teatro parar */
async function human(c: Ctx, a: number, b = a) { const end = Date.now() + rnd(a, b) * 1000; while (alive(c) && Date.now() < end) await sleep(250) }
async function soft<T>(c: Ctx, fn: () => Promise<T>): Promise<T | null> { try { return await fn() } catch (e: any) { c.st.onLog('client', `· ${e.message}`); return null } }

// ---------------------------------------------------------------- CLIENTE
async function review(c: Ctx, who: Who = 'client') {
    const st = c.st
    if (!(await st.soft(who, { op: 'has', target: { text: 'Avaliar agora' } }))) return false
    const label = who === 'owner' ? 'a corrida do motorista' : 'o pedido que chegou'
    c.say(who, `avaliando ${label}`)
    await st.caption(who, who === 'owner' ? '⭐ O dono avalia o motorista' : '⭐ Gabriela avalia o pedido')
    await human(c, 1.5, 2.5)
    await st.soft(who, { op: 'click', target: { text: 'Avaliar agora' } })
    await human(c, 1.5, 2.5)
    // a janela de avaliação: estrelas (as 5 são botões com ícone de estrela), texto e enviar
    const stars = pick([5, 5, 5, 4, 4, 3])
    await st.soft(who, { op: 'click', target: { selector: 'button:has(svg.lucide-star)', nth: stars - 1 } })
    await human(c, 0.8, 1.4)
    if (await st.soft(who, { op: 'has', target: { selector: 'textarea' } })) {
        await st.soft(who, { op: 'type', target: { selector: 'textarea' }, text: pick([...(who === 'owner' ? ['Entregou rápido e com cuidado.', 'Muito educado e pontual.', 'Ótimo entregador!'] : ['Chegou quentinha, muito boa!', 'Entrega rápida e a pizza deliciosa 😋', 'Tudo certo, recomendo a loja.', 'Capricharam no recheio. Voltarei!'])]) })
        await human(c, 0.8, 1.4)
    }
    await st.soft(who, { op: 'click', target: { text: 'Enviar Avaliação' } })
    await human(c, 2, 3)
    await st.soft(who, { op: 'click', target: { text: 'Avaliar depois' } })   // se sobrou outro pedido, fica para depois
    return true
}

async function addItem(c: Ctx, name: string, withAddon: boolean) {
    const st = c.st
    await review(c)   // se aparecer o aviso de pedido finalizado, ela resolve antes de seguir
    const r = await st.soft('client', { op: 'click', target: { text: `Adicionar ${name}` } })
    if (r === null) return false
    await human(c, 1, 1.6)
    if (await st.soft('client', { op: 'has', target: { selector: 'textarea' } }) && Math.random() < 0.5) {
        await st.soft('client', { op: 'type', target: { selector: 'textarea' }, text: pick(NOTES) })
        await human(c, 0.6, 1)
    }
    await st.soft('client', { op: 'click', target: { text: 'Continuar', exact: true } })
    await human(c, 1, 1.6)
    if (await st.soft('client', { op: 'has', target: { text: 'ETAPA 2 DE 2 · ADICIONAIS' } })) {
        if (withAddon) { await st.soft('client', { op: 'click', target: { text: pick(ADDONS) } }); await human(c, 0.8, 1.3) }
        await st.soft('client', { op: 'click', target: { text: 'Adicionar', exact: true } })
        await human(c, 1.2, 1.8)
    }
    return true
}

async function clientBuy(c: Ctx) {
    const st = c.st
    // 1. abre o iUser, vê a home, entra em Comprar e pesquisa
    c.say('client', 'abre o iUser')
    await st.goto('client', '/')
    await st.caption('client', '👀 Gabriela está procurando pizza')
    await review(c)
    await human(c, 1.5, 2.5)
    await st.soft('client', { op: 'scroll', by: 520, ms: 1800 }); await human(c, 1, 2)
    await st.soft('client', { op: 'scroll', to: 'top', ms: 1400 }); await human(c, 0.8, 1.4)
    if (!(await st.soft('client', { op: 'click', target: { text: 'Comprar', exact: true } }))) await st.soft('client', { op: 'click', target: { text: 'Lojas e produtos perto de você' } })
    await human(c, 2.5, 3.5)
    if (await st.soft('client', { op: 'has', target: { selector: 'input' } })) {
        await st.soft('client', { op: 'type', target: { selector: 'input[type=search], input[placeholder*="rocur"], input[placeholder*="uscar"]' }, text: 'pizza' })
        await human(c, 1.5, 2.2)
    }
    await st.soft('client', { op: 'scroll', by: 360, ms: 1500 }); await human(c, 1, 1.8)
    // 2. entra na loja
    if (!(await st.soft('client', { op: 'click', target: { text: 'Pizzaria Forno de Ouro' } }))) await st.goto('client', '/pizzaria-forno-de-ouro')
    c.say('client', 'olhando a Pizzaria Forno de Ouro')
    await st.caption('client', '🍕 Vendo a loja')
    await human(c, 2.5, 3.5)
    await st.soft('client', { op: 'scroll', by: 600, ms: 2000 }); await human(c, 1.2, 2)
    await st.soft('client', { op: 'scroll', by: 600, ms: 2000 }); await human(c, 1.2, 2)
    await st.soft('client', { op: 'scroll', to: 'top', ms: 1500 }); await human(c, 1, 1.6)
    // 3. catálogo
    await st.goto('client', '/pizzaria-forno-de-ouro/catalogo')
    await st.caption('client', '📖 Escolhendo no catálogo')
    await human(c, 1.5, 2.5)
    await st.soft('client', { op: 'scroll', by: 700, ms: 2000 }); await human(c, 1, 1.6)
    await st.soft('client', { op: 'scroll', by: 700, ms: 2000 }); await human(c, 1, 1.6)
    const picks = [pick(PIZZAS), ...(Math.random() < 0.6 ? [pick(PIZZAS)] : []), ...(Math.random() < 0.7 ? [pick(EXTRAS)] : [])]
    for (const name of picks) {
        if (!alive(c)) return
        c.say('client', `adicionando ${name}`)
        await addItem(c, name, name.startsWith('Pizza'))
    }
    await review(c)
    // 4. sacola → finalizar → entrega em casa → endereço → pagamento → confirmar
    await st.caption('client', '🛒 Finalizando o pedido')
    await st.soft('client', { op: 'click', target: { text: 'item R$' } })
    await human(c, 1.2, 1.8)
    await st.soft('client', { op: 'click', target: { text: 'Finalizar', exact: true } })
    await human(c, 1.5, 2.2)
    await st.soft('client', { op: 'click', target: { text: 'Receber em casa' } })
    await human(c, 1.2, 1.8)
    await st.soft('client', { op: 'type', target: { selector: 'input[placeholder="Buscar endereço..."]' }, text: pick(ADDRESSES) })
    await human(c, 0.8, 1.2)
    await st.soft('client', { op: 'click', target: { text: 'Buscar', exact: true } })
    await human(c, 3, 4)
    await st.soft('client', { op: 'click', target: { text: 'Continuar', exact: true } })
    await human(c, 1.5, 2.2)
    const pay = pick(['Pix', 'Cartão', 'Dinheiro'])
    await st.soft('client', { op: 'click', target: { text: pay, exact: true } })
    await human(c, 1, 1.6)
    if (pay === 'Dinheiro') await st.soft('client', { op: 'type', target: { selector: 'input[placeholder*="troco"]' }, text: '100' })
    await human(c, 0.8, 1.4)
    c.say('client', `confirmou o pedido (${pay})`)
    await st.soft('client', { op: 'click', target: { text: 'Confirmar Pedido' } })
    await human(c, 3, 4)
}

async function clientWait(c: Ctx) {
    const st = c.st
    // 5. espera a entrega acompanhando os pedidos; quando chegar, avalia
    await st.caption('client', '⏳ Esperando o pedido chegar')
    await st.goto('client', '/carrinho?aba=pedidos')
    c.say('client', 'acompanhando o pedido')
    const t0 = Date.now()
    let atDoor = false
    while (alive(c) && Date.now() - t0 < 6 * 60_000) {
        await human(c, 6, 9)
        const page = (await st.soft('client', { op: 'text' })) as string | null
        if (!atDoor && page && /está no seu endereço/.test(page)) {   // o entregador tocou "Estou no local": a ilha avisa
            atDoor = true
            await st.caption('client', '🚪 O entregador chegou!')
            await human(c, 1.2, 2)
            if ((await st.soft('client', { op: 'has', target: { text: 'Já estou descendo' } })) === true) { await st.caption('client', '💬 Respondendo com um toque: “Já estou descendo”'); await st.soft('client', { op: 'click', target: { text: 'Já estou descendo' } }) }
            await st.soft('client', { op: 'scroll', by: -400, ms: 900 }); await human(c, 2, 3)
            await st.caption('client', '🚶 Indo receber o pedido na porta'); await human(c, 3, 4)
            await st.caption('client', '⏳ Esperando o pedido chegar')
        }
        await st.soft('client', { op: 'scroll', by: pick([-200, 240, 160]), ms: 1100 })
        if (Date.now() - t0 > 40_000 && (await review(c))) return
        if ((c.obs()?.featured || []).length === 0 && Date.now() - t0 > 30_000) {   // não há mais pedido em andamento: recarrega a lista e tenta avaliar
            await st.goto('client', '/carrinho?aba=pedidos'); await human(c, 2, 3)
            if (await review(c)) return
        }
    }
}

export async function clientScene(c: Ctx) {
    await human(c, 2, 3)
    while (alive(c)) {
        try { await clientBuy(c); await clientWait(c) } catch (e: any) { c.st.onLog('client', `✗ ${e.message}`) }
        await c.st.caption('client', null)
        await human(c, 6, 12)   // um tempinho antes do próximo pedido
    }
}

// ---------------------------------------------------------------- DONO
function sectionNth(text: string, section: 'NOVOS' | 'EM PREPARO' | 'PRONTOS'): number {
    const start = text.indexOf(`${section} (`)
    if (start < 0) return -1
    const next = ['NOVOS', 'EM PREPARO', 'PRONTOS', 'FINALIZADOS'].map((s) => text.indexOf(`${s} (`)).filter((i) => i > start).sort((a, b) => a - b)[0] ?? text.length
    const block = text.slice(start, next)
    if (!block.includes(HANDLE)) return -1
    return (text.slice(0, start).split(HANDLE).length - 1)   // quantas vezes ela aparece ANTES desta seção
}

export async function ownerScene(c: Ctx) {
    const st = c.st
    await human(c, 3, 4)
    while (alive(c)) {
        try {
            await st.goto('owner', '/painel-loja/pizzaria-forno-de-ouro')
            await review(c, 'owner')
            await st.caption('owner', '🏪 Painel da pizzaria')
            await human(c, 2, 3)
            // fica de olho: rola o painel, olha a agenda e volta
            const t0 = Date.now()
            while (alive(c) && Date.now() - t0 < 25_000) {
                if (await review(c, 'owner')) continue
                const text = await st.soft('owner', { op: 'text' }) as string | null
                if (text) {
                    const nNovo = sectionNth(text, 'NOVOS')
                    if (nNovo >= 0) {
                        c.say('owner', 'chegou um pedido da Gabriela')
                        await st.caption('owner', '🔔 Pedido novo da Gabriela')
                        await human(c, 2, 3)
                        await st.soft('owner', { op: 'click', target: { text: HANDLE, nth: nNovo } })
                        await human(c, 2.5, 3.5)
                        await st.soft('owner', { op: 'scroll', by: 220, ms: 900 }); await human(c, 1.5, 2.5)
                        await st.soft('owner', { op: 'click', target: { text: 'aceitar pedido' } })
                        c.say('owner', 'aceitou o pedido — indo para o forno')
                        await st.caption('owner', '👨‍🍳 Pedido aceito, indo para o forno')
                        await human(c, 3, 4)
                        await st.soft('owner', { op: 'click', target: { text: 'voltar ao painel' } })
                        continue
                    }
                    const nPrep = sectionNth(text, 'EM PREPARO')
                    if (nPrep >= 0) {
                        await st.caption('owner', '🔥 No forno…')
                        await human(c, 14, 22)   // o tempo de fazer a pizza
                        await st.soft('owner', { op: 'click', target: { text: HANDLE, nth: nPrep } })
                        await human(c, 2.5, 3.5)
                        await st.soft('owner', { op: 'click', target: { text: 'pedido pronto' } })
                        c.say('owner', 'pedido pronto — aguardando o motoboy')
                        await st.caption('owner', '✅ Pronto! Esperando o motorista')
                        await human(c, 3, 4)
                        await st.soft('owner', { op: 'click', target: { text: 'voltar ao painel' } })
                        continue
                    }
                }
                await st.soft('owner', { op: 'scroll', by: pick([260, 320, -200]), ms: 1200 })
                await human(c, 4, 7)
            }
            await st.soft('owner', { op: 'scroll', to: 'top', ms: 1500 })
        } catch (e: any) { c.st.onLog('owner', `✗ ${e.message}`) }
        await human(c, 1, 2)
    }
}

// ---------------------------------------------------------------- MOTORISTA (Dani)
/** espera um texto aparecer no quadro (ex.: "Você chegou" no guia do mapa) */
async function waitText(c: Ctx, who: Who, text: string, maxS: number) {
    const end = Date.now() + maxS * 1000
    while (alive(c) && Date.now() < end) {
        const t = (await c.st.soft(who, { op: 'text' })) as string | null
        if (t && t.includes(text)) return true
        await sleep(1500)
    }
    return false
}

/** O código de retirada, lido no quadro do DONO (é a loja quem o vê e informa ao motorista): "<Nome> chegou para retirar ... Código de retirada 1234" */
async function storeCodeFor(c: Ctx, driverName: string): Promise<string | null> {
    for (let i = 0; i < 3; i++) {
        const t = (await c.st.soft('owner', { op: 'text' })) as string | null
        const m = t && new RegExp(driverName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' chegou para retirar[\\s\\S]*?CÓDIGO DE RETIRADA\\s*(\\d{4})', 'i').exec(t)
        if (m) return m[1]
        if (!c.st.where('owner').startsWith('/painel-loja/')) await c.st.goto('owner', '/painel-loja/pizzaria-forno-de-ouro')
        await sleep(2500)
    }
    return null
}

async function driverSlice(c: Ctx, name: string) {
    const st = c.st
    {
        try {
            if (!st.where('driver').startsWith('/entregas')) await st.goto('driver', '/entregas')
            const t0 = Date.now()
            while (alive(c) && Date.now() - t0 < 30_000) {
                if (await review(c, 'driver')) continue   // aviso de corrida finalizada na frente da tela: resolve primeiro
                const text = (await st.soft('driver', { op: 'text' })) as string | null
                if (!text) { await human(c, 2, 3); continue }
                if (text.includes('Offline') && !text.includes('Sair para a loja')) { await st.soft('driver', { op: 'click', target: { text: 'Offline' } }); await human(c, 1.5, 2); continue }
                if (text.includes('Sair para a loja')) {
                    c.say('driver', 'saindo para a loja'); await st.caption('driver', '🏍️ A caminho da loja')
                    await human(c, 1.5, 2.5); await st.soft('driver', { op: 'click', target: { text: 'Sair para a loja' } })
                    await waitText(c, 'driver', 'Você chegou', 70)   // o trajeto até a loja: o GPS anda no mapa até chegar
                    continue
                }
                if (text.includes('Cheguei na loja')) {
                    c.say('driver', 'chegou na loja'); await st.caption('driver', '📍 Chegou na loja')
                    await human(c, 1, 2); await st.soft('driver', { op: 'click', target: { text: 'Cheguei na loja' } }); await human(c, 2, 3)
                    continue
                }
                // A caixa do CÓDIGO DE RETIRADA está aberta: a loja (quadro do dono) informa o código depois de conferir o que entrega; o motorista digita
                if (text.includes('Confirmar retirada')) {
                    const code = await storeCodeFor(c, name)
                    if (!code) { await st.caption('driver', '⏳ Esperando o código da loja'); await human(c, 4, 6); continue }
                    await st.caption('driver', '🔑 A loja conferiu e informou o código')
                    await human(c, 1.5, 2.5)
                    await st.soft('driver', { op: 'type', target: { selector: 'input[aria-label="Código de retirada"]' }, text: code })
                    await human(c, 0.8, 1.4)
                    c.say('driver', 'confirmou a retirada'); await st.caption('driver', '📦 Retirada confirmada')
                    await st.soft('driver', { op: 'click', target: { text: 'Confirmar retirada' } })
                    await human(c, 3, 4)   // se ainda tem pedido em preparo o app avisa na ilha e a caixa continua aberta: o laço tenta de novo
                    continue
                }
                if (text.includes('Peguei os')) {
                    // pega quando a loja já marcou o pedido dela como pronto (o banco confere de qualquer jeito)
                    const featured = c.obs()?.featured || []
                    if (featured.some((o) => o.status !== 'ready' && o.delivery_option === 'entrega')) {
                        await st.caption('driver', '⏳ Esperando o pedido ficar pronto'); await human(c, 4, 6); continue
                    }
                    await st.soft('driver', { op: 'scroll', by: 260, ms: 1000 }); await human(c, 1.5, 2.5)
                    await st.caption('driver', '📦 Vai retirar os pedidos')
                    await st.soft('driver', { op: 'click', target: { text: 'Peguei os' } }); await human(c, 2, 3)
                    continue
                }
                // Na porta do cliente são DOIS toques: "Estou no local" (o cliente é avisado na hora) e, depois que ele sai para receber, "Entreguei"
                if (text.includes('foi avisado')) {
                    c.say('driver', 'esperando o cliente na porta'); await st.caption('driver', '🚪 Cliente avisado — esperando ele chegar na porta')
                    if (Math.random() < 0.6) {   // às vezes manda uma frase pronta ("Falar com ...")
                        await human(c, 1, 1.6); await st.soft('driver', { op: 'click', target: { text: 'Falar com' } }); await human(c, 0.8, 1.2)
                        await st.caption('driver', '💬 “Estou em frente ao endereço”'); await st.soft('driver', { op: 'click', target: { text: 'Estou em frente' } })
                    }
                    await human(c, 3.5, 5.5)   // o cliente vai até a porta
                    // PROVA DE ENTREGA: o cliente diz o código de 4 dígitos e o motorista o digita (o Teatro pega o código no servidor local)
                    if (text.includes('Peça o código')) {
                        const pin = await fetch(`/api/dev/proof?driver=${encodeURIComponent(name)}`).then((r) => r.json()).then((j) => j.pin as string | null).catch(() => null)
                        if (!pin) { await st.caption('driver', '⏳ Esperando o cliente dizer o código'); await human(c, 3, 5); continue }
                        await st.caption('driver', '🔢 O cliente disse o código de entrega')
                        await human(c, 1, 1.8); await st.soft('driver', { op: 'type', target: { selector: 'input[aria-label="Código do cliente"]' }, text: pin })
                        await human(c, 0.8, 1.4); await st.soft('driver', { op: 'click', target: { text: 'Confirmar', exact: true } })
                        await human(c, 2, 3)
                        continue
                    }
                    await st.caption('driver', '🤝 Entregando o pedido')
                    await human(c, 1, 1.8); await st.soft('driver', { op: 'click', target: { text: 'Entreguei', exact: true } })
                    await human(c, 2.5, 3.5)
                    c.say('driver', 'entregou!'); await st.caption('driver', '🎉 Entregue!')
                    await human(c, 2, 3)
                    continue
                }
                if (text.includes('Estou no local')) {
                    c.say('driver', 'indo entregar'); await st.caption('driver', '🧭 Seguindo para a entrega')
                    await human(c, 1, 2); await waitText(c, 'driver', 'Você chegou', 80)   // o trajeto até o cliente: o GPS anda no mapa até chegar
                    await st.caption('driver', '🚪 Chegou! Avisando o cliente: estou no local')
                    await human(c, 1, 1.8); await st.soft('driver', { op: 'click', target: { text: 'Estou no local', exact: true } })
                    await human(c, 2, 3)
                    continue
                }
                if (text.includes('Entreguei')) {
                    await human(c, 1, 1.8); await st.soft('driver', { op: 'click', target: { text: 'Entreguei', exact: true } })
                    await human(c, 2.5, 3.5)
                    continue
                }
                // entrega nova aparecendo "do nada": aceita
                if ((await st.soft('driver', { op: 'has', target: { text: 'Aceitar', exact: true } })) && text.includes('Entregas disponíveis') && !text.includes('mochila está cheia')) {
                    c.say('driver', 'chegou uma entrega — aceitou'); await st.caption('driver', '🔔 Chegou uma entrega! Aceitando…')
                    await human(c, 2, 3.5); await st.soft('driver', { op: 'click', target: { text: 'Aceitar', exact: true } }); await human(c, 2.5, 3.5)
                    continue
                }
                await st.soft('driver', { op: 'scroll', by: pick([-180, 200]), ms: 1100 })
                await human(c, 3, 5)
            }
        } catch (e: any) { c.st.onLog('driver', `✗ ${e.message}`) }
    }
}


/** O despachante: a cada entrega que um motorista vai aceitar, o quadro troca para ELE e mostra tudo — aceitar, ir à loja, esperar, pegar, o trajeto, entregar e as avaliações — antes de passar ao próximo. */
export async function driverScene(c: Ctx) {
    const st = c.st
    const lastServed: Record<string, number> = {}
    let current: string | null = null
    let idleSince = Date.now()
    await human(c, 3, 4)
    while (alive(c)) {
        const o = c.obs()
        const drivers = o?.drivers || []
        const busy = drivers.filter((d) => d.stops > 0)
        let pickD = busy.find((d) => d.key === current) || busy[0]
        if (!pickD && (o?.openOffers || 0) > 0) pickD = [...drivers].sort((a, b) => (lastServed[a.key] || 0) - (lastServed[b.key] || 0))[0]   // quem ficou mais tempo sem atender aceita a próxima
        if (!pickD) { if (Date.now() - idleSince > 4000) await st.caption('driver', '💤 Nenhuma entrega aberta agora'); await human(c, 2, 3); continue }
        idleSince = Date.now()
        if (pickD.key !== current) {
            current = pickD.key
            c.say('driver', `${pickD.name} abre o app`)
            st.ready.driver = null
            c.setDriver(pickD.key)
            for (let i = 0; i < 80 && !st.ready.driver; i++) await sleep(250)
            await sleep(900)
            await st.caption('driver', `🛵 ${pickD.name.split(' ')[0]} abre o app e vê as entregas`)
            await human(c, 2, 3)
        }
        lastServed[pickD.key] = Date.now()
        await driverSlice(c, pickD.name)
        // depois de entregar: mostra a avaliação que chegou
        const after = (c.obs()?.drivers || []).find((d) => d.key === pickD!.key)
        if (after && after.stops === 0) {
            await st.caption('driver', '⭐ Esperando a avaliação da loja')
            await human(c, 6, 9)
            await st.soft('driver', { op: 'scroll', by: 700, ms: 1400 })
            await st.soft('driver', { op: 'move', target: { text: 'Avaliações recebidas' } })
            await human(c, 3, 4)
            await st.soft('driver', { op: 'scroll', to: 'top', ms: 1200 })
            current = null   // próximo motorista
        }
    }
}

export function runTheater(st: Stage, obs: () => Obs | null, say: (who: Who, msg: string) => void, setDriver: (key: string) => void) {
    const c: Ctx = { st, gen: ++st.gen, obs, say, setDriver }
    void clientScene(c); void ownerScene(c); void driverScene(c)
}
