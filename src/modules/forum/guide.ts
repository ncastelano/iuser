// src/modules/forum/guide.ts — o GUIA "Como funciona o iUser" da aba do Fórum (/forum?aba=guia).
// Só texto (sem React). Cada tópico tem um resumo, os passos e as regras que valem, e um atalho para a página do app.
// ATENÇÃO: os números (planos, taxas, mínimos) são os que estão no banco HOJE. Mudou uma regra no app → atualize aqui também
// (e nos Termos, /termos). Quem confere: scripts/test-forum.mjs (cada tópico tem título, passos e um link interno).

export interface GuideTopic {
    id: string
    icon: 'sparkles' | 'user' | 'bag' | 'store' | 'wrench' | 'car' | 'bike' | 'wallet' | 'crown' | 'play' | 'users' | 'radar' | 'gift' | 'home' | 'shield' | 'scale' | 'help'
    color: string
    title: string
    summary: string
    steps?: string[]
    rules?: string[]
    link?: { label: string; path: string }
    link2?: { label: string; path: string }
}

export interface GuideGroup { title: string; topics: GuideTopic[] }

export const GUIDE: GuideGroup[] = [
    {
        title: 'Comece por aqui',
        topics: [
            {
                id: 'o-que-e', icon: 'sparkles', color: '#f97316', title: 'O que é o iUser',
                summary: 'O iUser é um aplicativo que junta, num lugar só, o comércio, os serviços e a mobilidade do seu bairro: você compra em lojas, contrata profissionais, pede motorista ou entrega, vende o que faz e ainda conversa com quem está por perto. A diferença: quem vende não paga comissão sobre a venda e recebe o dinheiro direto do cliente, na hora.',
                rules: [
                    'O iUser não fica com o dinheiro dos pedidos: o cliente paga direto a quem vende (Pix, dinheiro ou cartão).',
                    'Quem vende paga só o plano do iUser (mensal ou por uso), nunca uma porcentagem da venda.',
                    'Funciona no navegador (iuser.com.br) e no Android.',
                ],
                link: { label: 'Abrir a página inicial', path: '/' },
            },
            {
                id: 'conta', icon: 'user', color: '#3b82f6', title: 'Sua conta e os modos de uso',
                summary: 'Com uma conta só você usa o iUser de jeitos diferentes. Cada jeito é um MODO: Pessoa (comprar, contratar, pedir corrida, conversar), Loja (vender e atender pedidos) e Motorista (fazer corridas e entregas). Você troca de modo no botão "Eu", no canto da barra de baixo.',
                steps: [
                    'Crie a conta com seu nome, e-mail e CPF, e aceite os Termos de Uso.',
                    'Escolha o tipo do seu perfil: pessoal, serviços, agendamentos ou motorista. Isso muda só como seu perfil aparece.',
                    'Defina o seu local ("Perto de..." na home) para ver o que tem perto de você.',
                    'Toque em "Eu" para trocar de modo ou abrir o painel do modo em que você está.',
                ],
                rules: [
                    'Seus dados pessoais (CPF, telefone, endereço completo) não aparecem para os outros. No seu perfil público aparece só o bairro, se você deixar.',
                    'Você só aparece no Radar se escolher "Visível no Radar".',
                ],
                link: { label: 'Abrir meu painel', path: '/painel-perfil' },
            },
            {
                id: 'barra', icon: 'help', color: '#64748b', title: 'Como navegar no app',
                summary: 'A barra de baixo leva ao que importa: Explorar (a página inicial, com a busca), Itens (o Carrinho e tudo o que você já tem, com o histórico dos pedidos), Conversas e Eu (seus modos). No modo Loja e no modo Motorista a barra muda e mostra as ferramentas de trabalho.',
                steps: [
                    'Explorar: procure lojas, serviços, pessoas e produtos, ou use os atalhos "Preciso de" e "Quero ganhar".',
                    'Itens: tem duas partes. Carrinho, com o que você vai comprar, e Itens, com tudo o que já é seu, nas abas Tudo, Histórico, Produtos, Serviços e Digitais. No Histórico dá para repetir um pedido inteiro e marcar pedidos favoritos (estrela), que ficam no alto para pedir com um toque.',
                    'Conversas: fale com lojas, profissionais e motoristas sem passar seu telefone.',
                    'A faixa em cima da barra mostra avisos e o que está acontecendo agora (pedido, corrida, carrinho).',
                ],
            },
        ],
    },
    {
        title: 'Para quem compra e contrata',
        topics: [
            {
                id: 'comprar', icon: 'bag', color: '#22c55e', title: 'Comprar numa loja',
                summary: 'Entre na loja, abra o cardápio ou catálogo, coloque os itens na sacola e finalize. Você escolhe receber em casa ou retirar na loja, e como vai pagar.',
                steps: [
                    'Abra a loja (pela busca, pela home ou pelo QR da mesa) e toque em Comprar ou no catálogo.',
                    'Toque no "+" do produto, escolha os adicionais e deixe uma observação se quiser.',
                    'No carrinho, escolha entrega ou retirada, a forma de pagamento e, se tiver, o código de desconto.',
                    'Confirme. A loja aceita o pedido como está ou manda uma mensagem (por exemplo: acabou um item). Enquanto ela não aceita, você decide: pode tirar itens, mudar a quantidade ou tocar em "Está bom assim".',
                    'Depois que a loja aceita aparece o Pix: o QR é o DA LOJA e o dinheiro vai direto para ela. Toque em "Já paguei" e, se quiser, anexe o comprovante do seu banco e diga em nome de quem foi o Pix.',
                    'Acompanhe as etapas na faixa da barra: aguardando a loja, preparando, pronto, a caminho.',
                    'Na entrega, passe ao entregador o código de 4 dígitos que aparece no seu pedido. Depois, avalie a compra.',
                ],
                rules: [
                    'Os preços, o frete e o total são calculados pelo iUser, não dá para alterar no app.',
                    'Enquanto a loja não aceitou, você pode mudar ou cancelar o pedido. O Pix só aparece depois do aceite: ninguém paga um valor que ainda pode mudar.',
                    'Pedido pago por Pix só fica pronto depois que a loja confirma que recebeu.',
                    'Loja fechada não recebe pedido de entrega.',
                    'Não recebeu? Em até 24 horas você pode contestar a entrega no próprio pedido; o iUser analisa as provas.',
                ],
                link: { label: 'Ver lojas', path: '/lojas' },
            },
            {
                id: 'entregas-cliente', icon: 'bike', color: '#8b5cf6', title: 'Como a entrega funciona',
                summary: 'Nas lojas com o Entregador do iUser, um motorista da cidade aceita levar o seu pedido ANTES de a loja começar a preparar. Assim o pedido nunca fica pronto esperando alguém.',
                steps: [
                    'Ao confirmar, o iUser procura um entregador perto da loja.',
                    'Quando um entregador aceita, a loja recebe o pedido e começa a preparar.',
                    'Você vê quem vem, a etapa e quanto falta, e pode trocar mensagens rápidas com ele.',
                    'Se ninguém aceitar em alguns minutos, você pode trocar para retirar na loja ou cancelar.',
                ],
                rules: [
                    'O frete vai inteiro para o entregador.',
                    'O entregador só conclui a entrega com o seu código ou, se você não atender, com uma foto.',
                ],
            },
            {
                id: 'servicos', icon: 'wrench', color: '#0ea5e9', title: 'Contratar um serviço',
                summary: 'Precisa de eletricista, diarista, cabeleireiro, professor? Dá para agendar com quem já oferece o serviço ou publicar o que você precisa e receber profissionais interessados.',
                steps: [
                    'Para agendar: abra o serviço ou o perfil do profissional, escolha o dia e o horário livre e confirme.',
                    'Se a loja pedir uma entrada, pague por Pix na chave dela e toque em "Já paguei". O horário fica reservado.',
                    'Para pedir: em "Contratar serviço", diga o que precisa e onde. Profissionais se inscrevem e você escolhe um.',
                    'Depois do serviço feito, vocês dois se avaliam.',
                ],
                rules: [
                    'Ninguém fica com dois compromissos no mesmo horário: o app mostra os horários em que você já está ocupado.',
                    'Seu endereço exato só aparece para o profissional que você escolheu.',
                ],
                link: { label: 'Ver quem oferece serviço', path: '/servicos-disponiveis' },
            },
            {
                id: 'corridas', icon: 'car', color: '#f97316', title: 'Pedir motorista',
                summary: 'Peça uma corrida de carro, moto ou bicicleta, ou mande um objeto. Os motoristas da cidade mostram o valor que querem cobrar e você escolhe.',
                steps: [
                    'Em "Pedir motorista", escolha a partida e a chegada (e paradas, se tiver).',
                    'Escolha o veículo e a forma de pagamento. Se quiser, ofereça um valor.',
                    'Os motoristas se candidatam com até 3 valores. Você vê o carro, a nota e em quanto tempo ele chega, e escolhe.',
                    'Acompanhe o motorista no mapa. Precisa que ele espere? Peça uma espera pelo app.',
                    'No fim, pague direto ao motorista e avalie.',
                ],
                rules: [
                    'Nenhuma corrida sai por menos de R$ 8 nem por menos de R$ 40 por hora de trabalho do motorista.',
                    'A espera custa R$ 3,00 (cobre 3 minutos) e depois R$ 0,60 por minuto, paga junto com a corrida.',
                    'O nome do motorista só aparece depois que você o escolhe.',
                ],
                link: { label: 'Pedir motorista', path: '/pedir-motorista' },
            },
        ],
    },
    {
        title: 'Para quem vende e trabalha',
        topics: [
            {
                id: 'loja', icon: 'store', color: '#f97316', title: 'Ter uma loja no iUser',
                summary: 'Qualquer pessoa pode abrir uma loja: restaurante, mercadinho, salão, artista, editora. A loja tem catálogo, pedidos, agenda, painel do dia e divulgação.',
                steps: [
                    'Toque em "Criar minha loja", dê o nome, escolha o modelo (produtos, atendimento, os dois, ou loja de criador) e a categoria.',
                    'Em Editar loja, preencha: logo, descrição, horários, chave Pix, como entrega, e "Quem vende" (nome e CPF/CNPJ, pedido pela lei).',
                    'Cadastre produtos e serviços. Dá para montar combos com desconto em Promoções.',
                    'No Painel, acompanhe os pedidos: aceitar, preparar, pronto. Confirme os Pix que chegarem.',
                    'Imprima o QR do cardápio para as mesas e o balcão em "QR na mesa".',
                ],
                rules: [
                    'O cliente paga direto a você; o iUser não segura nem repassa o dinheiro dos pedidos.',
                    'Quem vende remédio, bebida alcoólica, gás ou tabaco precisa declarar que tem as licenças.',
                    'Missões diárias e o cadastro completo dão pontos que sobem a loja no Outdoor e mudam a moldura do logo.',
                ],
                link: { label: 'Criar minha loja', path: '/criar-loja' },
            },
            {
                id: 'motorista', icon: 'car', color: '#16a34a', title: 'Ser motorista ou entregador',
                summary: 'Com carro, moto ou bicicleta você faz corridas e entregas das lojas, escolhe quais aceitar e define a sua tarifa.',
                steps: [
                    'No Canal do Motorista, cadastre o veículo, a selfie e a sua chave Pix, e aceite a declaração do motorista.',
                    'Fique online. As corridas e entregas perto de você aparecem com o valor e quanto rendem por hora.',
                    'Nas corridas, mande até 3 valores; nas entregas, aceite pelo frete mostrado.',
                    'Na entrega: vá à loja, pegue o pedido com o código da loja, leve ao cliente e confirme com o código dele.',
                    'Veja quanto ganhou hoje, na semana e no mês na própria página de Entregas (seção Seus ganhos).',
                    'Divulgue: no alto do Canal do Motorista, "Compartilhar" manda o link da página do seu veículo (iuser.com.br/<seu-veículo>), por onde as pessoas chamam você. Ela é diferente do seu perfil pessoal.',
                ],
                rules: [
                    'Você precisa da CNH com atividade remunerada (EAR) e dos documentos do veículo.',
                    'Entregador novo começa só com pedidos pagos por Pix; o dinheiro vivo e a maquininha são liberados com o tempo e boas avaliações.',
                    'O dinheiro recebido na porta é da loja: você fica com o frete e repassa o resto. Repasse atrasado trava novas entregas.',
                    'Desistir de muitas entregas aceitas pausa as suas entregas por 24 horas.',
                ],
                link: { label: 'Abrir o Canal do Motorista', path: '/canal-do-motorista' },
            },
            {
                id: 'servico-oferecer', icon: 'wrench', color: '#0ea5e9', title: 'Oferecer serviços',
                summary: 'Profissionais publicam os serviços no perfil ou na loja, ligam a agenda e recebem pedidos de quem precisa.',
                steps: [
                    'Em "Publicar serviço", descreva o que faz e onde atende.',
                    'Ligue a agenda e defina os horários. Na loja, dá para pedir uma entrada por Pix.',
                    'Em "Fazer serviços", veja o que as pessoas estão pedindo e se inscreva.',
                    'Aceite ou recuse os agendamentos, marque "Serviço feito" e avalie o cliente.',
                ],
                link: { label: 'Publicar serviço', path: '/meus-servicos' },
            },
            {
                id: 'planos', icon: 'wallet', color: '#eab308', title: 'Planos: quanto o iUser cobra',
                summary: 'O iUser não cobra comissão sobre as vendas. Quem vende ou trabalha escolhe um dos dois planos.',
                rules: [
                    'Pré-pago: R$ 100 por mês, sem nenhuma taxa por venda, pedido ou corrida.',
                    'Pós-pago: R$ 0,50 por uso (pedido, corrida, agendamento, produto publicado), nunca mais que R$ 100 no mês.',
                    'No Pós-pago, se a conta passar de R$ 100 sem pagar, as ferramentas de venda pausam até quitar.',
                    'Comprar, contratar e pedir corrida como cliente não tem custo do iUser.',
                ],
                link: { label: 'Ver os planos', path: '/planos' },
            },
        ],
    },
    {
        title: 'Conteúdo, comunidade e vantagens',
        topics: [
            {
                id: 'digital', icon: 'play', color: '#8b5cf6', title: 'Cursos, músicas, livros e programas',
                summary: 'Lojas vendem (ou dão de graça) conteúdo digital: cursos em vídeo, aulas, músicas e álbuns, audiolivros, podcasts, e-books e programas para baixar.',
                steps: [
                    'Encontre em "Conteúdos digitais" na home ou na aba Digitais da loja. Muitos têm prévia.',
                    'Pague o pedido; a loja libera o acesso. Os grátis você pega com um toque.',
                    'Assista, ouça ou leia em Itens → Digitais. A música continua tocando enquanto você usa o app.',
                    'Gostou do artista? Assine o clube dele ou mande um apoio.',
                ],
                rules: ['Quem publica declara que é dono da obra ou tem licença. Cópia de conteúdo alheio é retirada do ar.'],
                link: { label: 'Ver conteúdos digitais', path: '/digitais' },
            },
            {
                id: 'social', icon: 'users', color: '#ec4899', title: 'Social, Flash e Comunidades',
                summary: 'O iUser também é para conhecer gente do seu bairro: publique flashes (fotos, vídeos e textos curtos), siga perfis, entre em comunidades e converse.',
                steps: [
                    'Em Social, veja os flashes, as publicações e as pessoas em destaque.',
                    'Toque no "+" do Flash para postar. Dá para marcar o local (só a rua e o bairro).',
                    'Entre numa comunidade para conversar sobre um assunto ou um lugar.',
                    'Ganhe pontos ao convidar, publicar e receber seguidores: os perfis com mais pontos aparecem no Outdoor iUser.',
                ],
                link: { label: 'Abrir o Social', path: '/social' },
            },
            {
                id: 'radar', icon: 'radar', color: '#14b8a6', title: 'Radar: ver o que tem perto',
                summary: 'O Radar mostra no mapa as lojas, serviços, produtos, pessoas, imóveis e motoristas ao seu redor.',
                rules: ['As posições de pessoas e motoristas são aproximadas (nunca o endereço exato).'],
                link: { label: 'Abrir o Radar', path: '/radar' },
            },
            {
                id: 'imoveis', icon: 'home', color: '#16a34a', title: 'Imóveis para alugar',
                summary: 'Anuncie ou encontre casas, apartamentos, quartos, salas e chácaras, para alugar por mês ou por temporada, e marque a visita pelo app.',
                rules: ['O endereço completo só aparece para quem tem visita confirmada. O iUser não recebe nem repassa o aluguel.'],
                link: { label: 'Buscar imóvel', path: '/imoveis' },
            },
            {
                id: 'convidados', icon: 'gift', color: '#7c3aed', title: 'Convidar e ganhar',
                summary: 'Convide pessoas com o seu link. Quando elas pagam um plano, você ganha uma comissão, que cresce com a sua graduação (Bronze, Prata, Ouro, Diamante...).',
                steps: [
                    'Abra "Indicar e ganhar" e compartilhe o seu link (ou mostre o QR).',
                    'Acompanhe sua rede, o saldo e peça o saque por Pix.',
                    'Ganhou um cartão de desconto do iUser? Escaneie o QR dele: o desconto já fica guardado para o seu pedido.',
                ],
                link: { label: 'Abrir Convidados', path: '/convidados' },
            },
        ],
    },
    {
        title: 'Regras, segurança e termos',
        topics: [
            {
                id: 'regras', icon: 'scale', color: '#ef4444', title: 'Regras de convivência',
                summary: 'O iUser é de todo mundo. Estas regras valem em perfis, lojas, flashes, comentários, comunidades e conversas.',
                rules: [
                    'Proibido: assédio, ameaça, discurso de ódio, conteúdo sexual explícito, golpe, spam e informação falsa.',
                    'Proibido divulgar dados pessoais de outras pessoas e manipular avaliações, votos, pontos ou visitas.',
                    'Venda só o que é legal e que você pode vender; produtos controlados exigem licença.',
                    'Combine e pague sempre pelo que está no app: assim você tem o registro se algo der errado.',
                    'Quem quebra as regras pode ter o conteúdo ocultado e a conta suspensa ou encerrada.',
                ],
            },
            {
                id: 'seguranca', icon: 'shield', color: '#0ea5e9', title: 'Segurança e denúncias',
                summary: 'Viu algo errado? Toque em "Denunciar". Conteúdo denunciado por várias pessoas é ocultado até a análise do iUser; lojas e perfis são analisados pela equipe.',
                rules: [
                    'O iUser nunca pede sua senha por mensagem.',
                    'Pague o pedido só na chave Pix que aparece no app (a da própria loja).',
                    'Na entrega, só passe o código de 4 dígitos quando receber o pedido.',
                    'Encontrou uma falha de segurança? Avise pelo e-mail que está nos Termos.',
                ],
            },
            {
                id: 'termos', icon: 'scale', color: '#64748b', title: 'Termos de Uso e Privacidade',
                summary: 'Os textos completos explicam quem é responsável por cada coisa, os seus direitos (inclusive de consumidor) e como cuidamos dos seus dados, conforme a LGPD.',
                rules: [
                    'Termos de Uso: o que é o iUser, quem pode usar, pagamentos, planos, responsabilidades e regras.',
                    'Política de Privacidade: o que coletamos, para quê, com quem compartilhamos e como pedir a exclusão dos seus dados.',
                ],
                link: { label: 'Termos de Uso', path: '/termos' },
                link2: { label: 'Política de Privacidade', path: '/privacidade' },
            },
        ],
    },
]

export const GUIDE_TOPICS: GuideTopic[] = GUIDE.flatMap((g) => g.topics)
