// src/app/tres-telas/scenes.ts — os ROTEIROS do TEATRO (só LOCAL): cada pessoa usa o app de verdade, com cursor, rolagem e digitação, nos quadros de /tres-telas.
//   Cliente (Gabriela): abre o iUser, procura, entra na loja, vê o catálogo, escolhe, preenche e confirma a compra, espera a entrega e avalia.
//   Dono (admin-teste): vê o painel, aceita o pedido dela, prepara e marca pronto (e vê o motorista chegando).
//   Motorista (Dani): recebe a entrega "do nada", aceita, vai à loja, espera, pega, faz o trajeto e entrega.
// O simulador (`simulate-pizzaria.py --stage`) deixa os pedidos da Gabriela e a corrida da Dani por conta destas telas.
import { Stage, pick, rnd, sleep, type Who } from './stage'

export interface Obs { featured?: { id: string; status: string; delivery_option: string }[]; log?: string[] }
type Ctx = { st: Stage; gen: number; obs: () => Obs | null; say: (who: Who, msg: string) => void }

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
    while (alive(c) && Date.now() - t0 < 6 * 60_000) {
        await human(c, 6, 9)
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
export async function driverScene(c: Ctx) {
    const st = c.st
    await human(c, 3, 4)
    while (alive(c)) {
        try {
            await st.goto('driver', '/entregas')
            await st.caption('driver', '🛵 Dani está online, esperando entregas')
            await human(c, 2, 3)
            const t0 = Date.now()
            while (alive(c) && Date.now() - t0 < 30_000) {
                const text = (await st.soft('driver', { op: 'text' })) as string | null
                if (!text) { await human(c, 2, 3); continue }
                if (text.includes('Offline') && !text.includes('Sair para a loja')) { await st.soft('driver', { op: 'click', target: { text: 'Offline' } }); await human(c, 1.5, 2); continue }
                if (text.includes('Sair para a loja')) {
                    c.say('driver', 'saindo para a loja'); await st.caption('driver', '🏍️ A caminho da loja')
                    await human(c, 1.5, 2.5); await st.soft('driver', { op: 'click', target: { text: 'Sair para a loja' } })
                    await human(c, 14, 20)   // o trajeto até a loja (a posição da Dani anda no mapa)
                    continue
                }
                if (text.includes('Cheguei na loja')) {
                    c.say('driver', 'chegou na loja'); await st.caption('driver', '📍 Chegou na loja')
                    await human(c, 1, 2); await st.soft('driver', { op: 'click', target: { text: 'Cheguei na loja' } }); await human(c, 2, 3)
                    continue
                }
                if (text.includes('Confira os pedidos') || text.includes('Peguei os')) {
                    // só pega quando a loja já marcou o pedido dela como pronto
                    const featured = c.obs()?.featured || []
                    if (featured.some((o) => o.status !== 'ready' && o.delivery_option === 'entrega')) {
                        await st.caption('driver', '⏳ Esperando o pedido ficar pronto'); await human(c, 4, 6); continue
                    }
                    await st.soft('driver', { op: 'scroll', by: 260, ms: 1000 }); await human(c, 1.5, 2.5)
                    c.say('driver', 'pegou os pedidos'); await st.caption('driver', '📦 Pegou os pedidos')
                    await st.soft('driver', { op: 'click', target: { text: 'Peguei os' } }); await human(c, 2, 3)
                    continue
                }
                if (text.includes('Entreguei')) {
                    c.say('driver', 'indo entregar'); await st.caption('driver', '🧭 Seguindo para a entrega')
                    await st.soft('driver', { op: 'scroll', by: 240, ms: 1000 }); await human(c, 12, 18)   // o trajeto (a posição anda no mapa)
                    await st.soft('driver', { op: 'click', target: { text: 'Estou no local (teste)' } })
                    await human(c, 2.5, 3.5)
                    c.say('driver', 'entregou!'); await st.caption('driver', '🎉 Entregue!')
                    await human(c, 2, 3)
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

export function runTheater(st: Stage, obs: () => Obs | null, say: (who: Who, msg: string) => void) {
    const c: Ctx = { st, gen: ++st.gen, obs, say }
    void clientScene(c); void ownerScene(c); void driverScene(c)
}
