// src/app/tres-telas/scenes.ts — os ROTEIROS do TEATRO DE 6 TELAS (só LOCAL): cada pessoa usa o app de verdade, com cursor, rolagem, digitação e a câmera, nos quadros de /tres-telas.
//   owner    — a DONA da pizzaria (admin-teste, com o perfil dela): atende pedidos e conversas, informa o código de retirada, avalia o motorista.
//   fixed    — o MOTORISTA FIXO da pizzaria (Dani, favorita da loja).
//   courier1 / courier2 — ENTREGADORES do iUser (Léo e Tito): entregas de qualquer loja.
//   helena   — HELENA (Helena Prado): o perfil dela e a Clínica Mente Viva.
//   ride     — MOTORISTA DE CORRIDAS: pedidos de motorista de qualquer tipo.
// O simulador (`simulate-pizzaria.py --theater`) e o alimentador (`simulate-teatro.py`) fazem chegar o movimento; aqui cada pessoa só atende.
import { Stage, pick, rnd, sleep, type Who } from './stage'

export interface Obs { log?: string[]; openOffers?: number; drivers?: { id: string; key: string; name: string; capacity: number; stops: number; deliveredLastHour: number }[] }
export type Ctx = { st: Stage; gen: number; obs: () => Obs | null; say: (who: Who, msg: string) => void }

export const alive = (c: Ctx) => !c.st.stopped && c.st.gen === c.gen
/** pausa "de gente": espera um tempo e sai na hora se o teatro parar */
export async function human(c: Ctx, a: number, b = a) { const end = Date.now() + rnd(a, b) * 1000; while (alive(c) && Date.now() < end) await sleep(250) }

/** O aviso de avaliação que aparece na frente da tela (corrida/pedido finalizado): resolve antes de seguir */
export async function review(c: Ctx, who: Who, label: string, comments: string[]) {
    const st = c.st
    if (!(await st.soft(who, { op: 'has', target: { text: 'Avaliar agora' } }))) return false
    c.say(who, `avaliando ${label}`)
    await st.caption(who, `⭐ Avaliando ${label}`)
    await human(c, 1.5, 2.5)
    await st.soft(who, { op: 'click', target: { text: 'Avaliar agora' } })
    await human(c, 1.5, 2.5)
    const stars = pick([5, 5, 5, 4, 4, 3])
    await st.soft(who, { op: 'click', target: { selector: 'button:has(svg.lucide-star)', nth: stars - 1 } })
    await human(c, 0.8, 1.4)
    if (await st.soft(who, { op: 'has', target: { selector: 'textarea' } })) {
        await st.soft(who, { op: 'type', target: { selector: 'textarea' }, text: pick(comments) })
        await human(c, 0.8, 1.4)
    }
    await st.soft(who, { op: 'click', target: { text: 'Enviar Avaliação' } })
    await human(c, 2, 3)
    await st.soft(who, { op: 'click', target: { text: 'Avaliar depois' } })   // se sobrou outro, fica para depois
    return true
}

export async function idleScene(c: Ctx, who: Who, path: string, caption: string) {
    await c.st.goto(who, path)
    while (alive(c)) {
        await c.st.caption(who, caption)
        await c.st.soft(who, { op: 'scroll', by: pick([300, -200, 260]), ms: 1400 })
        await human(c, 6, 10)
    }
}

const textOf = async (c: Ctx, who: Who) => ((await c.st.soft(who, { op: 'text' })) as string | null) || ''
const count = (text: string, label: string) => { const m = new RegExp(`${label}\\s+(\\d+)`, 'i').exec(text); return m ? Number(m[1]) : 0 }

// ---------------------------------------------------------------- CONVERSAS (a dona da pizzaria e a Helena respondem como pessoas)
const PIZZA_ANSWERS: [RegExp, string][] = [
    [/entreg/i, 'Entregamos sim! A taxa é R$ 8,00 e a entrega leva uns 40 minutos. 🛵'],
    [/tempo|demora/i, 'A pizza grande fica pronta em uns 30 a 40 minutos, já com a entrega. 🍕'],
    [/lactose/i, 'Tem sim, o catupiry e a mussarela têm lactose. Posso sugerir a Margherita sem queijo extra!'],
    [/meio/i, 'Dá sim! Escolha dois sabores e avise nas observações que fazemos meio a meio, sem custo extra.'],
    [/rod[ií]zio/i, 'O rodízio roda todos os dias das 11h às 23h e dura 2 horas. Adulto R$ 69,90, criança R$ 39,90. 🍕'],
    [/vip/i, 'Temos o Ambiente VIP para até 20 pessoas! É só agendar pelo app, na página da loja.'],
    [/gl[uú]ten/i, 'Ainda não temos massa sem glúten, mas posso sugerir um calzone no forno a lenha. Quer?'],
    [/cart[aã]o/i, 'Aceitamos cartão, Pix e dinheiro na entrega. 💳'],
    [/borda/i, 'Se o pedido ainda não estiver no forno dá sim! Me avise aqui que eu troco para você.'],
    [/aberto/i, 'Estamos abertos todos os dias, das 11h às 23h59. Pode pedir! 🍕'],
]
const CLINIC_ANSWERS: [RegExp, string][] = [
    [/online/i, 'Atendemos online e presencialmente, você escolhe na hora de agendar. 💚'],
    [/valor|quanto custa|pre[cç]o/i, 'A Primeira Conversa de Acolhimento é gratuita. A sessão individual é R$ 180,00 e a de casal R$ 260,00.'],
    [/hor[aá]rio|semana|remarc/i, 'Tenho horários nesta semana sim! Veja a agenda na página da clínica. Remarcações podem ser feitas até 24 h antes.'],
    [/casal/i, 'Na terapia de casal é importante que os dois participem, mas a primeira conversa pode ser só com um de vocês.'],
    [/plano|sa[uú]de/i, 'Por enquanto atendemos particular, mas emitimos recibo para reembolso do seu plano. 🙂'],
    [/quanto tempo|dura/i, 'Cada sessão dura 50 minutos.'],
    [/avalia[cç][aã]o/i, 'A Avaliação Psicológica é feita em encontros, com entrevistas e testes; ao final você recebe um laudo. Posso explicar melhor por aqui!'],
    [/vocacional|ensino/i, 'A orientação vocacional serve para jovens e adultos em dúvida sobre a carreira. 🎓'],
    [/ansios|conversar|come[cç]/i, 'Que bom que você escreveu. A Primeira Conversa de Acolhimento é um ótimo começo e não tem custo. Quer agendar?'],
]
const GENERIC = ['Oi! Em que posso ajudar? 😊', 'Claro, pode falar!', 'Estamos à disposição por aqui.']

/** Abre a conversa não respondida mais recente da caixa de entrada da loja e responde pelo teclado. Devolve se respondeu. */
export async function answerChat(c: Ctx, who: Who, room: string, answers: [RegExp, string][], label: string): Promise<boolean> {
    const st = c.st
    await st.goto(who, `/conversas?sala=${room}`)
    await human(c, 1.5, 2.2)
    const list = (await st.soft(who, { op: 'list' })) as { tag: string; text: string }[] | null
    // não lida = tem a hora de hoje (HH:MM) e a última mensagem NÃO é "Você: ..."
    const unread = (list || []).find((x) => x.tag === 'button' && x.text.startsWith('@') && /\d\d:\d\d/.test(x.text) && !/você:/.test(x.text))
    if (!unread) return false
    const handle = unread.text.split(/\d/)[0]
    c.say(who, `${label} responde ${handle}`)
    await st.caption(who, `💬 Respondendo ${handle}`)
    await st.soft(who, { op: 'click', target: { text: handle, selector: 'button' } })
    await human(c, 2, 3)
    const chat = await textOf(c, who)
    const last = chat.split('\n').filter((l) => l.trim().length > 12).slice(-3).join(' ')
    const reply = (answers.find(([re]) => re.test(last)) || [null, pick(GENERIC)])[1]
    await st.soft(who, { op: 'type', target: { selector: 'textarea' }, text: reply })
    await human(c, 0.8, 1.4)
    await st.soft(who, { op: 'click', target: { selector: 'button[aria-label="Enviar"]' } })
    await human(c, 2, 3)
    return true
}

// ---------------------------------------------------------------- DONA DA PIZZARIA
const SLUG = 'pizzaria-forno-de-ouro'
const OWNER_REVIEWS = ['Entregou rápido e com cuidado.', 'Muito educado e pontual.', 'Ótimo entregador!', 'Tudo certo com a entrega.']

export async function ownerScene(c: Ctx) {
    const st = c.st
    const who: Who = 'owner'
    await human(c, 2, 3)
    await st.goto(who, `/painel-loja/${SLUG}`)
    await st.prep(who)
    await st.caption(who, '🏪 Dona da Pizzaria Forno de Ouro')
    await human(c, 2, 3)
    let lastAccept = 0, lastChat = 0, lastPanel = 0
    while (alive(c)) {
        try {
            await review(c, who, 'o motorista da entrega', OWNER_REVIEWS)
            // 1) PEDIDOS: aceita o mais antigo dos novos; passado o tempo do forno, deixa pronto o mais antigo em preparo
            if (!st.where(who).includes('/pedidos')) { await st.goto(who, `/painel-loja/${SLUG}/pedidos`); await human(c, 1, 1.6) }
            let text = await textOf(c, who)
            const novos = count(text, 'Novos'), prep = count(text, 'Preparando')
            if (novos > 0) {
                await st.soft(who, { op: 'click', target: { text: 'Novos', selector: 'button' } }); await human(c, 1, 1.6)
                const handle = (/@[a-z0-9][a-z0-9-]*/.exec(text.slice(text.search(/Finalizados\s+\d+/))) || [''])[0]
                c.say(who, handle ? `pedido novo de ${handle}` : 'pedido novo')
                await st.caption(who, `🔔 Pedido novo${handle ? ` de ${handle}` : ''}`)
                await human(c, 1.5, 2.5)
                await st.soft(who, { op: 'scroll', by: 120, ms: 700 })
                await st.soft(who, { op: 'click', target: { text: 'Aceitar', exact: true } })
                await st.caption(who, '👨‍🍳 Aceitou — indo para o forno')
                lastAccept = Date.now()
                await human(c, 3, 4)
                continue
            }
            if (prep > 0 && Date.now() - lastAccept > 22_000) {
                await st.soft(who, { op: 'click', target: { text: 'Preparando', selector: 'button' } }); await human(c, 1, 1.6)
                await st.caption(who, '🔥 No forno…'); await human(c, 3, 5)
                await st.soft(who, { op: 'click', target: { text: 'Pronto', exact: true } })
                c.say(who, 'pedido pronto — aguardando motorista')
                await st.caption(who, '✅ Pronto! Esperando o motorista')
                await human(c, 3, 4)
                continue
            }
            // 2) CÓDIGO DE RETIRADA: motorista na porta da loja → a dona confere o que entrega e informa o código (o painel mostra)
            if (Date.now() - lastPanel > 40_000) {
                lastPanel = Date.now()
                await st.goto(who, `/painel-loja/${SLUG}`); await human(c, 1.5, 2.5)
                text = await textOf(c, who)
                const m = /([\p{L}]+)\s+chegou para retirar[\s\S]*?CÓDIGO DE RETIRADA\s*(\d{4})/iu.exec(text)
                if (m) {
                    c.say(who, `${m[1]} chegou — código ${m[2]}`)
                    await st.caption(who, `🔑 ${m[1]} chegou para retirar — informando o código ${m[2]}`)
                    await st.soft(who, { op: 'move', target: { text: 'CÓDIGO DE RETIRADA' } })
                    await human(c, 3, 4)
                } else { await st.caption(who, '🏪 Olhando o movimento da loja'); await st.soft(who, { op: 'scroll', by: 420, ms: 1600 }); await human(c, 2, 3); await st.soft(who, { op: 'scroll', to: 'top', ms: 1200 }) }
                continue
            }
            // 3) CONVERSAS: responde quem escreveu
            if (Date.now() - lastChat > 55_000) {
                lastChat = Date.now()
                await answerChat(c, who, SLUG, PIZZA_ANSWERS, 'a loja')
                continue
            }
            await human(c, 3, 5)
        } catch (e: any) { c.st.onLog(who, `✗ ${e.message}`) }
    }
}

// ---------------------------------------------------------------- MOTORISTAS DE ENTREGA (o fixo da pizzaria e os dois independentes)
/** espera um texto aparecer no quadro (ex.: "Você chegou" no guia do mapa) */
async function waitText(c: Ctx, who: Who, text: string, maxS: number) {
    const end = Date.now() + maxS * 1000
    while (alive(c) && Date.now() < end) {
        if ((await textOf(c, who)).includes(text)) return true
        await sleep(1500)
    }
    return false
}

const DRIVER_REVIEWS = ['Bom atendimento, tudo certo!', 'Loja organizada e pedido pronto no horário.']

export async function deliveryDriverScene(c: Ctx, who: Who, key: string, eager: number) {
    const st = c.st
    // espera o observador trazer o nome do motorista (para a rota do código de retirada e da prova de entrega)
    let name = ''
    for (let i = 0; i < 60 && alive(c) && !name; i++) { name = c.obs()?.drivers?.find((d) => d.key === key)?.name || ''; if (!name) await sleep(1000) }
    await human(c, 2, 4)
    await st.goto(who, '/entregas')
    await st.prep(who)
    const first = name.split(' ')[0] || key
    await st.caption(who, `🛵 ${first} abre o app e vê as entregas`)
    while (alive(c)) {
        try {
            if (!st.where(who).startsWith('/entregas')) await st.goto(who, '/entregas')
            if (await review(c, who, 'a loja', DRIVER_REVIEWS)) continue
            const text = await textOf(c, who)
            if (!text) { await human(c, 2, 3); continue }
            if (text.includes('Offline') && !text.includes('Sair para a loja')) { await st.soft(who, { op: 'click', target: { text: 'Offline' } }); await human(c, 1.5, 2); continue }
            if (text.includes('Sair para a loja')) {
                c.say(who, 'saindo para a loja'); await st.caption(who, `🏍️ ${first} a caminho da loja`)
                await human(c, 1.5, 2.5); await st.soft(who, { op: 'click', target: { text: 'Sair para a loja' } })
                await waitText(c, who, 'Você chegou', 90)   // o trajeto até a loja: o GPS anda no mapa até chegar
                continue
            }
            if (text.includes('Cheguei na loja')) {
                c.say(who, 'chegou na loja'); await st.caption(who, '📍 Chegou na loja')
                await human(c, 1, 2); await st.soft(who, { op: 'click', target: { text: 'Cheguei na loja' } }); await human(c, 2, 3)
                continue
            }
            // A caixa do CÓDIGO DE RETIRADA: a loja confere o que entrega e informa o código; o motorista digita
            if (text.includes('Confirmar retirada')) {
                const code = await fetch(`/api/dev/pickup-code?driver=${encodeURIComponent(name)}`).then((r) => r.json()).then((j) => j.code as string | null).catch(() => null)
                if (!code) { await st.caption(who, '⏳ Esperando o código da loja'); await human(c, 4, 6); continue }
                await st.caption(who, '🔑 A loja conferiu e informou o código')
                await human(c, 3, 5)   // o tempo de a loja falar o código
                await st.soft(who, { op: 'type', target: { selector: 'input[aria-label="Código de retirada"]' }, text: code })
                await human(c, 0.8, 1.4)
                c.say(who, 'confirmou a retirada'); await st.caption(who, '📦 Retirada confirmada')
                await st.soft(who, { op: 'click', target: { text: 'Confirmar retirada' } })
                await human(c, 3, 4)
                continue
            }
            if (text.includes('Peguei os')) {
                if (text.includes('Em preparo')) { await st.caption(who, '⏳ Esperando o pedido ficar pronto'); await human(c, 4, 6); continue }   // o app só habilita com todos prontos
                await st.soft(who, { op: 'scroll', by: 260, ms: 1000 }); await human(c, 1.5, 2.5)
                await st.caption(who, '📦 Vai retirar os pedidos')
                await st.soft(who, { op: 'click', target: { text: 'Peguei os' } }); await human(c, 2, 3)
                continue
            }
            // Na porta do cliente são DOIS toques: "Estou no local" (o cliente é avisado) e, depois que ele sai para receber, "Entreguei"
            if (text.includes('foi avisado')) {
                c.say(who, 'esperando o cliente na porta'); await st.caption(who, '🚪 Cliente avisado — esperando ele chegar na porta')
                if (Math.random() < 0.6) {
                    await human(c, 1, 1.6); await st.soft(who, { op: 'click', target: { text: 'Falar com' } }); await human(c, 0.8, 1.2)
                    await st.caption(who, '💬 “Estou em frente ao endereço”'); await st.soft(who, { op: 'click', target: { text: 'Estou em frente' } })
                }
                await human(c, 3.5, 5.5)
                if (text.includes('Peça o código')) {   // PROVA DE ENTREGA: o cliente diz o código de 4 dígitos
                    const pin = await fetch(`/api/dev/proof?driver=${encodeURIComponent(name)}`).then((r) => r.json()).then((j) => j.pin as string | null).catch(() => null)
                    if (!pin) { await st.caption(who, '⏳ Esperando o cliente dizer o código'); await human(c, 3, 5); continue }
                    await st.caption(who, '🔢 O cliente disse o código de entrega')
                    await human(c, 1, 1.8); await st.soft(who, { op: 'type', target: { selector: 'input[aria-label="Código do cliente"]' }, text: pin })
                    await human(c, 0.8, 1.4); await st.soft(who, { op: 'click', target: { text: 'Confirmar', exact: true } })
                    await human(c, 2, 3)
                    continue
                }
                await st.caption(who, '🤝 Entregando o pedido')
                await human(c, 1, 1.8); await st.soft(who, { op: 'click', target: { text: 'Entreguei', exact: true } })
                await human(c, 2.5, 3.5)
                c.say(who, 'entregou!'); await st.caption(who, '🎉 Entregue!')
                await human(c, 2, 3)
                continue
            }
            if (text.includes('Estou no local')) {
                c.say(who, 'indo entregar'); await st.caption(who, '🧭 Seguindo para a entrega')
                await human(c, 1, 2); await waitText(c, who, 'Você chegou', 90)
                await st.caption(who, '🚪 Chegou! Avisando o cliente: estou no local')
                await human(c, 1, 1.8); await st.soft(who, { op: 'click', target: { text: 'Estou no local', exact: true } })
                await human(c, 2, 3)
                continue
            }
            if (text.includes('Entreguei')) {
                await human(c, 1, 1.8); await st.soft(who, { op: 'click', target: { text: 'Entreguei', exact: true } })
                await human(c, 2.5, 3.5)
                continue
            }
            // entrega nova: aceita (cada um com a sua disposição)
            if ((await st.soft(who, { op: 'has', target: { text: 'Aceitar', exact: true } })) && text.includes('Entregas disponíveis') && !text.includes('mochila está cheia') && Math.random() < eager) {
                c.say(who, 'chegou uma entrega — aceitou'); await st.caption(who, '🔔 Chegou uma entrega! Aceitando…')
                await human(c, 2, 4); await st.soft(who, { op: 'click', target: { text: 'Aceitar', exact: true } }); await human(c, 2.5, 3.5)
                continue
            }
            await st.caption(who, `💤 ${first} esperando entregas`)
            await st.soft(who, { op: 'scroll', by: pick([-180, 200]), ms: 1100 })
            await human(c, 3, 5)
        } catch (e: any) { c.st.onLog(who, `✗ ${e.message}`) }
    }
}

// ---------------------------------------------------------------- HELENA (o perfil dela e a Clínica Mente Viva)
const CLINIC_SLUG = 'clinica-mente-viva'
const HELENA_REVIEWS = ['Cliente pontual e educado.', 'Sessão tranquila, tudo certo.']

/** De cada "CONVITE DE SERVIÇO" (um cartão por cliente) tira quantos horários tem e se dá para aceitar (entrada informada ou sem entrada) */
function inviteCards(text: string) {
    const blocks = text.split('CONVITE DE SERVIÇO').slice(1)
    let firstBtn = 0
    return blocks.map((b) => {
        const slots = Math.max(1, Number((/(\d+) horários? pedidos?/.exec(b) || [])[1] || 1))
        const card = { handle: (/@[a-z0-9][a-z0-9-]*/.exec(b) || [''])[0], slots, firstBtn, acceptable: /Entrada informada/.test(b) || !/Aguardando a entrada/.test(b), awaiting: /Aguardando a entrada/.test(b) }
        firstBtn += slots
        return card
    })
}

export async function helenaScene(c: Ctx) {
    const st = c.st
    const who: Who = 'helena'
    await human(c, 3, 5)
    await st.goto(who, `/painel-loja/${CLINIC_SLUG}`)
    await st.prep(who)
    await st.caption(who, '🩺 Helena na Clínica Mente Viva')
    await human(c, 2, 3)
    let lastChat = 0, lastTour = Date.now(), lastHistory = 0
    while (alive(c)) {
        try {
            await review(c, who, 'o cliente', HELENA_REVIEWS)
            // 1) PEDIDOS DE SERVIÇO da loja: confere a entrada e aceita o horário; os que ainda esperam a entrada ela só olha o histórico
            if (!st.where(who).includes('/pedidos')) { await st.goto(who, `/painel-loja/${CLINIC_SLUG}/pedidos`); await human(c, 1, 1.6) }
            await st.soft(who, { op: 'click', target: { text: 'Serviços', selector: 'button' } }); await human(c, 1.2, 1.8)
            const cards = inviteCards(await textOf(c, who))
            const ready = cards.find((x) => x.acceptable)
            if (ready) {
                c.say(who, `aceitou o horário de ${ready.handle}`)
                await st.caption(who, `📅 Convite de ${ready.handle}`)
                await human(c, 1.5, 2.5)
                await st.soft(who, { op: 'scroll', by: 160, ms: 800 })
                await st.caption(who, '💸 Entrada conferida — aceitando o horário')
                await human(c, 1.5, 2.5)
                await st.soft(who, { op: 'click', target: { text: 'Aceitar horário', nth: ready.firstBtn } })
                await human(c, 3, 4)
                continue
            }
            if (cards.length && Date.now() - lastHistory > 45_000) {   // vê o histórico de quem ainda não pagou a entrada
                lastHistory = Date.now()
                await st.caption(who, '🔎 Olhando o histórico do cliente antes de aceitar')
                await st.soft(who, { op: 'click', target: { text: 'Histórico do cliente' } }); await human(c, 4, 6)
                await st.soft(who, { op: 'click', target: { text: 'Histórico do cliente' } })   // fecha
                await human(c, 2, 3)
                continue
            }
            // 2) CONVERSAS: responde quem escreveu para a clínica
            if (Date.now() - lastChat > 50_000) {
                lastChat = Date.now()
                await answerChat(c, who, CLINIC_SLUG, CLINIC_ANSWERS, 'Helena')
                continue
            }
            // 3) um passeio: a agenda dela (da loja e pessoal), o perfil e a página pública da clínica
            if (Date.now() - lastTour > 100_000) {
                lastTour = Date.now()
                await st.goto(who, '/compromissos'); await st.caption(who, '📅 Conferindo a agenda'); await human(c, 2, 3)
                await st.soft(who, { op: 'scroll', by: 360, ms: 1600 }); await human(c, 2, 3); await st.soft(who, { op: 'scroll', to: 'top', ms: 1200 }); await human(c, 1.5, 2.5)
                await st.goto(who, '/helena-prado'); await st.caption(who, '👤 O perfil da Helena'); await human(c, 2, 3)
                await st.soft(who, { op: 'scroll', by: 500, ms: 1800 }); await human(c, 2, 3)
                await st.goto(who, `/${CLINIC_SLUG}`); await st.caption(who, '🏥 A página da clínica, como o cliente vê'); await human(c, 2, 3)
                await st.soft(who, { op: 'scroll', by: 500, ms: 1800 }); await human(c, 2, 3)
                continue
            }
            await st.caption(who, '🩺 Atendendo a clínica')
            await human(c, 4, 6)
        } catch (e: any) { c.st.onLog(who, `✗ ${e.message}`) }
    }
}

// ---------------------------------------------------------------- MOTORISTA DE CORRIDAS (qualquer pedido de motorista: passageiro, objeto, animal)
const RIDE_REVIEWS = ['Passageiro educado e pontual.', 'Tudo tranquilo na corrida.', 'Ótimo passageiro!']

export async function rideScene(c: Ctx) {
    const st = c.st
    const who: Who = 'ride'
    let name = 'Eva Administradora'
    await human(c, 3, 5)
    await st.goto(who, '/aceitar-corridas')
    await st.prep(who)
    await st.caption(who, '🚗 Motorista de corridas: vendo os pedidos')
    await human(c, 2, 3)
    let appliedAt = 0
    while (alive(c)) {
        try {
            if (await review(c, who, 'o passageiro', RIDE_REVIEWS)) continue
            if (!st.where(who).startsWith('/aceitar-corridas')) await st.goto(who, '/aceitar-corridas')
            const low = (await textOf(c, who)).toLowerCase()
            // ---- uma corrida aceita: percorre as etapas (os botões mudam a cada passo)
            if (low.includes('ir para o ponto de partida')) {
                c.say(who, 'saindo para buscar o passageiro'); await st.caption(who, '🚗 Indo buscar o passageiro')
                await human(c, 1.5, 2.5); await st.soft(who, { op: 'click', target: { text: 'ir para o ponto de partida' } }); await human(c, 8, 14)   // o tempo de chegar lá
                continue
            }
            if (low.includes('cheguei ao ponto de partida')) {
                await st.caption(who, '📍 Chegou ao ponto de partida')
                await human(c, 5, 9); await st.soft(who, { op: 'click', target: { text: 'cheguei ao ponto de partida' } })
                await st.caption(who, '⏳ Esperando o passageiro entrar'); await human(c, 4, 7)
                continue
            }
            if (low.includes('iniciar corrida')) {
                await st.caption(who, '🚦 O passageiro entrou — iniciando a corrida')
                await human(c, 2, 3); await st.soft(who, { op: 'click', target: { text: 'iniciar corrida' } }); c.say(who, 'corrida iniciada')
                await st.caption(who, '🛣️ A caminho do destino'); await human(c, 12, 20)   // o tempo do trajeto
                continue
            }
            if (low.includes('cheguei ao destino')) {
                const j = await fetch(`/api/dev/ride-points?driver=${encodeURIComponent(name)}`).then((r) => r.json()).catch(() => null)
                const ride = j?.ride
                if (ride) await st.devpos(who, ride.destination_lat, ride.destination_lng)   // o GPS de teste: o motorista "está" no destino
                await st.caption(who, '🏁 Chegou ao destino'); await human(c, 2, 3)
                await st.soft(who, { op: 'click', target: { text: 'cheguei ao destino' } })
                c.say(who, 'corrida concluída'); await human(c, 3, 4)
                await st.devpos(who, null, null)
                await st.caption(who, '🎉 Corrida concluída!'); await human(c, 2, 3)
                appliedAt = 0
                continue
            }
            // ---- esperando ser escolhida pelo passageiro
            if (appliedAt && Date.now() - appliedAt < 60_000) {
                await st.caption(who, '⏳ Candidatura enviada — esperando o passageiro escolher')
                await human(c, 5, 8); await st.goto(who, '/aceitar-corridas')
                continue
            }
            appliedAt = 0
            // ---- sem corrida: olha os pedidos e se candidata ao melhor
            if (low.includes('solicitações de motorista') && (low.includes('tarifa iuser') || low.includes('aceitar oferta'))) {
                await st.caption(who, '👀 Vendo o pedido: trajeto, tempos e valores')
                await st.soft(who, { op: 'scroll', by: 260, ms: 1400 }); await human(c, 2, 3)
                await st.soft(who, { op: 'move', target: { text: 'Por tempo' } }); await human(c, 1.5, 2.5)
                await st.soft(who, { op: 'scroll', by: -260, ms: 1000 }); await human(c, 1, 1.5)
                const offer = low.includes('aceitar oferta')
                await st.caption(who, offer ? '🤝 O passageiro ofereceu um valor — aceitando a oferta' : '💰 Candidatando-se pela Tarifa iUser')
                const ok = offer
                    ? await st.soft(who, { op: 'click', target: { text: 'aceitar oferta', selector: 'button' } })
                    : await st.soft(who, { op: 'click', target: { text: 'tarifa iuser', selector: 'button' } })
                if (ok !== null) { appliedAt = Date.now(); c.say(who, 'se candidatou a uma corrida') }
                await human(c, 3, 4)
                continue
            }
            await st.caption(who, '💤 Nenhum pedido de motorista agora')
            await st.soft(who, { op: 'scroll', by: pick([-150, 200]), ms: 1100 })
            await human(c, 4, 6)
            await st.goto(who, '/aceitar-corridas')
        } catch (e: any) { c.st.onLog(who, `✗ ${e.message}`) }
    }
}

export function runTheater(st: Stage, obs: () => Obs | null, say: (who: Who, msg: string) => void) {
    const c: Ctx = { st, gen: ++st.gen, obs, say }
    void ownerScene(c)
    void deliveryDriverScene(c, 'fixed', 'dani', 0.95)
    void deliveryDriverScene(c, 'courier1', 'leo', 0.8)
    void deliveryDriverScene(c, 'courier2', 'tito', 0.65)
    void helenaScene(c)
    void rideScene(c)
}
