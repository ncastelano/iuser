// Dados FICTÍCIOS do "ecossistema" de lojas do staging (usado por seed-ecosystem.mjs). Só texto/valores: nada aqui toca o banco.
// Cada loja tem dono (perfil), produtos, serviços, publicações e uma lista de "ligações" com os outros donos (pedidos e agendamentos
// entre eles), para a rede se comportar como um ecossistema: o dono de uma loja é cliente das outras.

const week = (open, close, days = [1, 2, 3, 4, 5, 6], lunch) =>
    Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [String(d), days.includes(d)
        ? { isOpen: true, start: open, end: close, ...(lunch ? { lunchStart: lunch[0], lunchEnd: lunch[1] } : {}) }
        : { isOpen: false, start: '', end: '' }]))

// paleta de cada loja (gradiente das imagens geradas)
export const STORES = [
    {
        key: 'padaria', slug: 'loja-teste', name: 'Loja de Teste', category: 'Alimentação', colors: ['#f59e0b', '#b45309'],
        owner: { email: 'lojista@staging.iuser.test', name: 'Lojista Teste', slug: 'lojista-teste', existing: true },
        description: 'Padaria, café e confeitaria artesanal no coração de Porto Velho. Pães quentes toda hora, bolos sob encomenda, salgados para festas e o melhor café especial de Rondônia. Retirada no balcão ou entrega.',
        address: 'Av. Teste, 200, Centro, Porto Velho - RO, 76801-000, Brasil', lat: -8.7619, lng: -63.9039, whatsapp: '5569999990001',
        hours: week('06:00', '21:00', [0, 1, 2, 3, 4, 5, 6]), scheduling: true,
        social: { instagram: '@lojadeteste.oficial', youtube: '@lojadeteste', facebook: 'lojadeteste', x: '@lojadeteste' },
        reviews: 118, followers: 96, orders: 46,
        products: [
            ['Pão Francês Artesanal (6 un)', 9.9, 'Crocante por fora, macio por dentro. Saindo do forno de hora em hora.'],
            ['Pão de Queijo Mineiro (500 g)', 24.9, 'Receita mineira com queijo meia-cura. Vai quentinho ou congelado para assar em casa.'],
            ['Bolo de Cenoura com Chocolate', 32, 'Fatia generosa com cobertura de chocolate meio amargo. Também em bolo inteiro de 1 kg.'],
            ['Bolo de Milho Cremoso', 28, 'Bem úmido, feito com milho de verdade. Combina com café coado.'],
            ['Torta de Limão', 38, 'Massa amanteigada, creme de limão siciliano e merengue maçaricado.'],
            ['Brigadeiro Gourmet (caixa 12)', 36, 'Chocolate belga, granulado crocante. Sabores: tradicional, ninho e pistache.'],
            ['Coxinha de Frango (10 un)', 29.9, 'Massa leve e recheio cremoso com catupiry. Fritas na hora.'],
            ['Empada de Palmito (6 un)', 27, 'Massa quebradiça e recheio generoso de palmito pupunha.'],
            ['Café Especial Torrado (250 g)', 34.9, 'Grãos de Rondônia, torra média, notas de chocolate e caramelo. Moído ou em grão.'],
            ['Cappuccino Cremoso', 12, 'Espresso, leite vaporizado e canela. Pode ser gelado.'],
            ['Suco de Cupuaçu (500 ml)', 14, 'Polpa da região, sem conservantes. Sirvo com ou sem açúcar.'],
            ['Cesta de Café da Manhã (para 2)', 79.9, 'Pães, frios, bolo, frutas, suco e café. Ótima para presentear.'],
            ['Pão de Mel Recheado', 9.5, 'Doce de leite cremoso e cobertura de chocolate ao leite.'],
            ['Kit Festa Salgados (50 un)', 119.9, 'Coxinha, risole, bolinha de queijo e kibe. Entregue quentinho no horário combinado.'],
        ],
        services: [
            ['Bolo sob Encomenda', 150, 'Bolos personalizados para aniversário, casamento e confraternização. Orçamento pelo chat.', 60],
            ['Buffet para Festa Infantil', 680, 'Salgados, doces, bolo e bebidas para até 30 convidados. Montagem inclusa.', 180],
            ['Coffee Break Corporativo', 450, 'Café, sucos, salgados e doces para 20 pessoas, servido no seu escritório.', 120],
            ['Aula de Confeitaria', 90, 'Aula prática de 2 horas, com receita impressa e degustação. Turmas de até 6 pessoas.', 120],
        ],
        pubs: [
            ['Novo cardápio de outubro chegou', 'Pães de fermentação natural, tortas sazonais e o novo cappuccino de canela. Passa aqui para provar.'],
            ['Combo Café + Pão de Queijo com preço especial', 'De segunda a quinta, o combo sai por R$ 15. Vale para consumo no balcão.'],
            ['O segredo do pão de queijo perfeito', 'Queijo meia-cura, polvilho azedo e muita paciência na massa. Nossa equipe conta o passo a passo.'],
            ['Encomendas para o Dia das Crianças', 'Kits de brigadeiro, bolo temático e lembrancinhas. Encomende até sexta para garantir.'],
            ['Chegou o café especial de Rondônia', 'Grãos de produtores locais, torrados aqui. Provem e contem o que acharam.'],
            ['Bastidores: a padaria às 4 da manhã', 'Quem acorda cedo para o seu pão sair quentinho. Obrigado, equipe.'],
            ['Já são mais de 100 avaliações!', 'Obrigado a cada cliente que passou por aqui e deixou um comentário. Vocês são o motivo.'],
            ['Mês do cliente: brinde em compras acima de R$ 60', 'Todo pedido acima de R$ 60 leva um brigadeiro de presente durante o mês.'],
        ],
    },
    {
        key: 'mecanica', slug: 'auto-center-rondonia', name: 'Auto Center Rondônia', category: 'Serviços', colors: ['#2563eb', '#1e3a8a'],
        owner: { email: 'owner-mecanica@staging.iuser.test', name: 'Carlos Mendes', slug: 'carlos-mendes' },
        description: 'Mecânica completa para carros e utilitários: revisão, freios, suspensão, ar-condicionado e diagnóstico com scanner. Orçamento transparente e garantia de 90 dias no serviço.',
        address: 'Av. Jorge Teixeira, 3500, Industrial, Porto Velho - RO, 76821-000, Brasil', lat: -8.7451, lng: -63.8733, whatsapp: '5569999990002',
        hours: week('07:30', '18:00', [1, 2, 3, 4, 5, 6], ['12:00', '13:30']), scheduling: true,
        social: { instagram: '@autocenter.rondonia', youtube: '@autocenterrondonia', facebook: 'autocenterrondonia' },
        reviews: 64, followers: 41, orders: 14,
        products: [
            ['Óleo Sintético 5W30 (1 L)', 54.9, 'Óleo sintético de alta performance para motores flex. Vendido por litro.'],
            ['Pastilha de Freio Dianteira (jogo)', 189, 'Jogo com 4 pastilhas, cerâmica de baixo ruído. Instalação opcional.'],
            ['Filtro de Ar do Motor', 59.9, 'Filtro de papel de alta filtragem. Consulte a compatibilidade com o seu modelo.'],
            ['Palheta de Limpador (par)', 69, 'Par de palhetas com borracha de silicone. Fixação universal.'],
            ['Bateria 60 Ah', 489, 'Bateria selada, 18 meses de garantia. Troca na hora, com descarte da antiga.'],
            ['Aditivo para Radiador (1 L)', 32, 'Aditivo concentrado, protege contra ferrugem e superaquecimento.'],
        ],
        services: [
            ['Troca de Óleo e Filtros', 180, 'Óleo, filtro de óleo e verificação de 12 itens. Leva cerca de 40 minutos.', 40],
            ['Alinhamento e Balanceamento', 140, 'Alinhamento 3D e balanceamento das quatro rodas.', 60],
            ['Revisão Completa', 520, 'Freios, suspensão, correias, fluidos e elétrica, com relatório por escrito.', 180],
            ['Diagnóstico com Scanner', 120, 'Leitura de falhas e parâmetros do motor com scanner profissional.', 45],
            ['Higienização do Ar-condicionado', 160, 'Limpeza do evaporador e troca do filtro de cabine.', 60],
        ],
        pubs: [
            ['Revisão de fim de ano: agende já', 'Antes de pegar a estrada, confira freios, pneus e óleo. Horários limitados.'],
            ['5 sinais de que seus freios pedem atenção', 'Barulho agudo, pedal baixo, carro puxando para um lado... Veja o que fazer em cada caso.'],
            ['Promoção: alinhamento + balanceamento', 'Pacote com 15% de desconto de segunda a quarta.'],
            ['Como escolher o óleo certo para o seu carro', 'Viscosidade, tipo e quando trocar. Explicamos sem complicar.'],
        ],
    },
    {
        key: 'psicologia', slug: 'clinica-mente-viva', name: 'Clínica Mente Viva', category: 'Saúde e Bem-estar', colors: ['#7c3aed', '#4c1d95'],
        owner: { email: 'owner-psicologia@staging.iuser.test', name: 'Helena Prado', slug: 'helena-prado' },
        description: 'Psicologia clínica com acolhimento, ética e sigilo. Atendimento individual, de casal e avaliação psicológica, presencial e online. Primeira conversa sem compromisso.',
        address: 'Rua Dom Pedro II, 780, Centro, Porto Velho - RO, 76801-000, Brasil', lat: -8.7633, lng: -63.9021, whatsapp: '5569999990003',
        hours: week('08:00', '19:00', [1, 2, 3, 4, 5]), scheduling: true,
        social: { instagram: '@clinicamenteviva', youtube: '@menteviva', x: '@menteviva' },
        reviews: 52, followers: 58, orders: 6,
        products: [
            ['Diário de Autoconhecimento (PDF)', 29.9, 'Roteiro de 30 dias com perguntas guiadas para registrar emoções e hábitos. Entrega por e-mail.', 'digital'],
            ['Guia de Respiração e Relaxamento (PDF)', 19.9, 'Práticas simples para ansiedade e sono, com áudios de apoio. Entrega por e-mail.', 'digital'],
        ],
        services: [
            ['Sessão de Psicoterapia Individual', 180, 'Atendimento de 50 minutos, presencial ou online.', 50],
            ['Terapia de Casal', 260, 'Sessão de 60 minutos para casais, com foco em comunicação e acordos.', 60],
            ['Avaliação Psicológica', 450, 'Processo de avaliação com testes e devolutiva por escrito.', 90],
            ['Orientação Vocacional', 220, 'Sessão de 60 minutos para quem quer escolher ou mudar de carreira.', 60],
            ['Primeira Conversa de Acolhimento', 0, 'Conversa inicial de 20 minutos para conhecer o atendimento. Sem custo.', 20],
        ],
        pubs: [
            ['Ansiedade: o que fazer na hora da crise', 'Três passos simples para voltar ao presente: respirar, nomear o que sente e ancorar nos sentidos.'],
            ['Terapia online funciona?', 'Sim, com os cuidados certos. Falamos de sigilo, ambiente e frequência ideal.'],
            ['Novas vagas às quartas à tarde', 'Abrimos horários para psicoterapia individual. Agende uma conversa de acolhimento.'],
            ['Autocuidado não é luxo', 'Pequenas rotinas de descanso previnem o esgotamento. Veja ideias fáceis de começar hoje.'],
        ],
    },
    {
        key: 'odonto', slug: 'odonto-sorriso', name: 'Odonto Sorriso', category: 'Saúde e Bem-estar', colors: ['#06b6d4', '#0e7490'],
        owner: { email: 'owner-odonto@staging.iuser.test', name: 'Rafael Nogueira', slug: 'rafael-nogueira' },
        description: 'Clínica odontológica com atendimento humanizado: limpeza, clareamento, restaurações, ortodontia e urgência. Parcelamos seu tratamento e atendemos crianças.',
        address: 'Av. Sete de Setembro, 1220, Nossa Senhora das Graças, Porto Velho - RO, 76804-000, Brasil', lat: -8.7589, lng: -63.9087, whatsapp: '5569999990004',
        hours: week('08:00', '18:00', [1, 2, 3, 4, 5, 6], ['12:00', '14:00']), scheduling: true,
        social: { instagram: '@odontosorriso.pvh', facebook: 'odontosorrisopvh' },
        reviews: 71, followers: 63, orders: 9,
        products: [
            ['Kit de Escovação Completo', 49.9, 'Escova macia, fio dental e creme dental com flúor. Indicado por nossos dentistas.'],
            ['Fio Dental Encerado (3 un)', 18.9, 'Fio resistente que desliza fácil entre os dentes.'],
            ['Enxaguante sem Álcool (500 ml)', 24.9, 'Proteção diária sem ardência. Ideal para toda a família.'],
        ],
        services: [
            ['Avaliação e Limpeza', 150, 'Consulta, profilaxia e orientação de higiene.', 45],
            ['Clareamento a Laser', 690, 'Sessão em consultório, com resultado visível desde a primeira aplicação.', 60],
            ['Restauração em Resina', 220, 'Restauração estética com resina composta, por dente.', 40],
            ['Avaliação Ortodôntica', 120, 'Avaliação e plano de tratamento para aparelho fixo ou alinhadores.', 30],
            ['Atendimento de Urgência', 200, 'Dor, dente quebrado ou inflamação. Atendimento no mesmo dia.', 40],
        ],
        pubs: [
            ['Clareamento: o que você precisa saber', 'Funciona para quase todos, mas exige avaliação prévia. Explicamos o passo a passo.'],
            ['Campanha de limpeza para toda a família', 'Traga três pessoas e ganhe 20% de desconto na limpeza de todas.'],
            ['Dentinho de leite também precisa de cuidado', 'Cuidar do dente de leite protege o dente definitivo. Veja como começar a rotina.'],
            ['Bastidores: nosso novo consultório', 'Equipamentos novos, mais conforto e menos tempo de espera.'],
        ],
    },
    {
        key: 'studio', slug: 'studio-bela-cabelos', name: 'Studio Bela Cabelos', category: 'Moda e Beleza', colors: ['#ec4899', '#9d174d'],
        owner: { email: 'owner-studio@staging.iuser.test', name: 'Bianca Torres', slug: 'bianca-torres' },
        description: 'Salão especializado em cortes, coloração, mechas e tratamentos capilares. Barba, penteados para festa e produtos profissionais. Atendimento com hora marcada.',
        address: 'Rua José Bonifácio, 455, Olaria, Porto Velho - RO, 76801-000, Brasil', lat: -8.7655, lng: -63.8988, whatsapp: '5569999990005',
        hours: week('09:00', '19:00', [2, 3, 4, 5, 6]), scheduling: true,
        social: { instagram: '@studiobelacabelos', youtube: '@studiobelacabelos', facebook: 'studiobelacabelos', x: '@studiobela' },
        reviews: 88, followers: 74, orders: 12,
        products: [
            ['Shampoo Reconstrutor (300 ml)', 59.9, 'Repõe massa capilar e reduz a quebra. Uso diário.'],
            ['Máscara de Hidratação (250 g)', 74.9, 'Hidratação profunda para cabelos ressecados e coloridos.'],
            ['Óleo Reparador de Pontas', 44.9, 'Finalizador leve, sem pesar, com proteção térmica.'],
            ['Kit Cuidados com a Barba', 69.9, 'Óleo, balm e pente de madeira.'],
        ],
        services: [
            ['Corte Feminino', 90, 'Corte com lavagem e finalização.', 60],
            ['Corte Masculino', 55, 'Corte na máquina ou tesoura, com acabamento.', 40],
            ['Escova Modelada', 70, 'Lavagem, escova e finalização.', 50],
            ['Coloração e Mechas', 320, 'Avaliação, aplicação e tratamento pós-química. O valor varia conforme o comprimento.', 180],
            ['Hidratação Profunda', 110, 'Tratamento com máscara profissional e massagem capilar.', 60],
            ['Barba e Bigode', 40, 'Modelagem com toalha quente e finalização.', 30],
        ],
        pubs: [
            ['Tendência de coloração para o verão', 'Loiro manteiga, ruivo suave e mechas finas. Veja o que combina com seu tom de pele.'],
            ['Cronograma capilar em 3 passos', 'Hidratação, nutrição e reconstrução: como alternar sem errar.'],
            ['Dia da noiva: reserve com antecedência', 'Penteado, maquiagem e teste prévio. Agenda de dezembro quase cheia.'],
            ['Novos horários aos sábados', 'Abrimos mais horários para corte e escova aos sábados.'],
        ],
    },
    {
        key: 'contabil', slug: 'contabil-facil', name: 'Contábil Fácil', category: 'Serviços', colors: ['#16a34a', '#14532d'],
        owner: { email: 'owner-contabil@staging.iuser.test', name: 'Tiago Ramos', slug: 'tiago-ramos' },
        description: 'Contabilidade para MEI, microempresas e profissionais autônomos: abertura, impostos, folha, declaração de renda e consultoria. Atendimento online e presencial, sem enrolação.',
        address: 'Av. Calama, 2100, Embratel, Porto Velho - RO, 76820-000, Brasil', lat: -8.7712, lng: -63.8844, whatsapp: '5569999990006',
        hours: week('08:00', '17:30', [1, 2, 3, 4, 5], ['12:00', '13:30']), scheduling: true,
        social: { instagram: '@contabilfacil.ro', youtube: '@contabilfacil', x: '@contabilfacil' },
        reviews: 38, followers: 29, orders: 5,
        products: [
            ['Planilha de Controle Financeiro (MEI)', 39.9, 'Planilha pronta para organizar entradas, saídas e imposto mensal. Entrega por e-mail.', 'digital'],
            ['Guia Fiscal para Pequenos Negócios (PDF)', 24.9, 'Passo a passo de obrigações e prazos. Entrega por e-mail.', 'digital'],
        ],
        services: [
            ['Abertura de MEI', 150, 'Abertura completa com orientações de enquadramento e emissão de nota.', 60],
            ['Declaração de Imposto de Renda', 180, 'Declaração para pessoa física, com revisão de deduções.', 60],
            ['Contabilidade Mensal (plano básico)', 220, 'Fechamento mensal, impostos e orientação. Valor por mês.', 60],
            ['Consultoria Fiscal (1 hora)', 160, 'Atendimento individual para tirar dúvidas sobre impostos e regime tributário.', 60],
            ['Regularização de Pendências', 300, 'Levantamento de débitos, parcelamento e regularização junto aos órgãos.', 90],
        ],
        pubs: [
            ['MEI: o que muda neste ano', 'Limite de faturamento, DAS e obrigações. Resumimos o essencial em poucas linhas.'],
            ['Calendário de impostos de novembro', 'Veja datas, quem paga e como evitar multa.'],
            ['Como separar conta pessoal e da empresa', 'Um passo simples que evita dor de cabeça no fim do ano.'],
            ['Plantão de dúvidas no WhatsApp', 'Toda sexta, das 14h às 16h, respondemos perguntas rápidas sobre impostos.'],
        ],
    },
    {
        key: 'pet', slug: 'pet-amigo', name: 'Pet Amigo', category: 'Pet', colors: ['#f97316', '#9a3412'],
        owner: { email: 'owner-pet@staging.iuser.test', name: 'Luciana Castro', slug: 'luciana-castro' },
        description: 'Pet shop e clínica veterinária: banho e tosa, consultas, vacinas, rações e acessórios. Táxi dog e atendimento a domicílio. Seu melhor amigo em boas mãos.',
        address: 'Rua Rafael Vaz e Silva, 610, São Cristóvão, Porto Velho - RO, 76805-000, Brasil', lat: -8.7576, lng: -63.9134, whatsapp: '5569999990007',
        hours: week('08:00', '19:00', [1, 2, 3, 4, 5, 6]), scheduling: true,
        social: { instagram: '@petamigo.pvh', youtube: '@petamigopvh', facebook: 'petamigopvh' },
        reviews: 79, followers: 69, orders: 22,
        products: [
            ['Ração Premium Cães Adultos (10 kg)', 189.9, 'Ração super premium com proteína de frango e arroz. Para cães de porte médio e grande.'],
            ['Ração Gatos Castrados (3 kg)', 94.9, 'Controle de peso e saúde urinária.'],
            ['Brinquedo Mordedor Resistente', 34.9, 'Borracha atóxica, resistente para mordedores ativos.'],
            ['Cama Pet Confort (M)', 129.9, 'Cama lavável e antiderrapante, tamanho M.'],
            ['Petisco Natural de Frango (100 g)', 19.9, 'Desidratado, sem conservantes.'],
            ['Shampoo Neutro Pet (500 ml)', 39.9, 'Fórmula suave para pele sensível.'],
        ],
        services: [
            ['Banho e Tosa Higiênica', 80, 'Banho, secagem, corte de unhas e tosa higiênica. Preço para porte pequeno.', 90],
            ['Consulta Veterinária', 150, 'Consulta clínica com avaliação completa.', 40],
            ['Vacinação Anual', 120, 'Vacina múltipla ou antirrábica, com carteirinha atualizada.', 20],
            ['Táxi Dog', 35, 'Buscamos e levamos seu pet em segurança. Valor por trajeto.', 30],
        ],
        pubs: [
            ['Semana da vacinação com desconto', 'Vacina antirrábica com 20% de desconto durante toda a semana.'],
            ['Cuidados com o calor para cães e gatos', 'Água fresca, sombra e passeios nos horários certos: um guia rápido.'],
            ['Adote um amigo: feira de adoção no sábado', 'Parceria com abrigos locais. Venha conhecer os novos membros da família.'],
            ['Novidade: ração premium para filhotes', 'Chegou uma linha nova com proteína de alta digestibilidade.'],
        ],
    },
    {
        key: 'eletrica', slug: 'eletrica-faisca', name: 'Elétrica Faísca', category: 'Serviços', colors: ['#eab308', '#854d0e'],
        owner: { email: 'owner-eletrica@staging.iuser.test', name: 'Anderson Lima', slug: 'anderson-lima' },
        description: 'Instalações e manutenção elétrica residencial e comercial: quadros, tomadas, iluminação, chuveiros e laudos. Atendimento rápido e orçamento sem compromisso. Serviço com garantia.',
        address: 'Rua Euclides da Cunha, 305, Liberdade, Porto Velho - RO, 76803-000, Brasil', lat: -8.7541, lng: -63.8956, whatsapp: '5569999990008',
        hours: week('07:00', '18:00', [1, 2, 3, 4, 5, 6]), scheduling: true,
        social: { instagram: '@eletricafaisca', facebook: 'eletricafaisca' },
        reviews: 34, followers: 22, orders: 7,
        products: [
            ['Disjuntor Bipolar 40 A', 34.9, 'Disjuntor termomagnético padrão DIN.'],
            ['Kit Tomadas 10 A (5 un)', 39.9, 'Tomadas com placa e acabamento branco.'],
            ['Lâmpada LED 12 W (4 un)', 44.9, 'Luz branca neutra, economia de até 80%.'],
            ['Fita Isolante Profissional (3 un)', 19.9, 'Alta aderência, 20 m cada.'],
        ],
        services: [
            ['Instalação de Chuveiro e Tomadas', 120, 'Instalação segura com verificação do circuito.', 60],
            ['Revisão do Quadro de Distribuição', 280, 'Aperto, medição e etiquetagem de circuitos, com relatório.', 120],
            ['Instalação de Luminárias e Spots', 180, 'Instalação com teste e organização da fiação.', 90],
            ['Laudo Elétrico Residencial', 450, 'Laudo técnico com ART para imóveis e financiamento.', 180],
            ['Atendimento de Urgência 24 h', 250, 'Queda de energia, curto e cheiro de queimado. Atendimento imediato.', 60],
        ],
        pubs: [
            ['Cuidados para evitar sobrecarga elétrica', 'Não use benjamins em cascata e nunca ignore disjuntor que desarma. Veja o que fazer.'],
            ['Chuveiro novo: o que checar antes de instalar', 'Potência, bitola do fio e aterramento. Evite dores de cabeça.'],
            ['Promoção: revisão do quadro com desconto', 'Revisão completa com 10% de desconto durante o mês.'],
            ['Aviso: temporada de chuvas', 'Desligue aparelhos em tempestade e proteja a rede com DPS.'],
        ],
    },
]

// ligações entre os donos (a mesma pessoa é dona de uma loja e cliente das outras)
//   order: compra produtos; booking: agenda um serviço (nomes iguais aos de STORES)
export const LINKS = [
    { who: 'mecanica', store: 'padaria', order: ['Café Especial Torrado (250 g)', 'Cesta de Café da Manhã (para 2)'] },
    { who: 'mecanica', store: 'psicologia', booking: 'Sessão de Psicoterapia Individual', status: 'completed', daysAgo: 21 },
    { who: 'padaria', store: 'mecanica', booking: 'Revisão Completa', status: 'completed', daysAgo: 12 },
    { who: 'padaria', store: 'contabil', booking: 'Contabilidade Mensal (plano básico)', status: 'confirmed', daysAhead: 3 },
    { who: 'padaria', store: 'eletrica', booking: 'Revisão do Quadro de Distribuição', status: 'completed', daysAgo: 40 },
    { who: 'psicologia', store: 'odonto', booking: 'Avaliação e Limpeza', status: 'completed', daysAgo: 30 },
    { who: 'psicologia', store: 'pet', order: ['Brinquedo Mordedor Resistente', 'Petisco Natural de Frango (100 g)'] },
    { who: 'psicologia', store: 'padaria', order: ['Torta de Limão', 'Bolo de Cenoura com Chocolate'] },
    { who: 'odonto', store: 'studio', booking: 'Corte Masculino', status: 'completed', daysAgo: 8 },
    { who: 'odonto', store: 'psicologia', booking: 'Terapia de Casal', status: 'confirmed', daysAhead: 5 },
    { who: 'odonto', store: 'contabil', booking: 'Declaração de Imposto de Renda', status: 'completed', daysAgo: 55 },
    { who: 'studio', store: 'contabil', booking: 'Abertura de MEI', status: 'completed', daysAgo: 70 },
    { who: 'studio', store: 'padaria', order: ['Kit Festa Salgados (50 un)', 'Brigadeiro Gourmet (caixa 12)'] },
    { who: 'studio', store: 'odonto', booking: 'Clareamento a Laser', status: 'pending', daysAhead: 9 },
    { who: 'contabil', store: 'eletrica', booking: 'Laudo Elétrico Residencial', status: 'completed', daysAgo: 18 },
    { who: 'contabil', store: 'padaria', order: ['Café Especial Torrado (250 g)'] },
    { who: 'contabil', store: 'studio', booking: 'Corte Masculino', status: 'confirmed', daysAhead: 2 },
    { who: 'pet', store: 'mecanica', booking: 'Troca de Óleo e Filtros', status: 'completed', daysAgo: 25 },
    { who: 'pet', store: 'contabil', booking: 'Consultoria Fiscal (1 hora)', status: 'completed', daysAgo: 33 },
    { who: 'pet', store: 'studio', order: ['Shampoo Reconstrutor (300 ml)', 'Máscara de Hidratação (250 g)'] },
    { who: 'eletrica', store: 'pet', order: ['Ração Premium Cães Adultos (10 kg)'] },
    { who: 'eletrica', store: 'studio', booking: 'Barba e Bigode', status: 'completed', daysAgo: 6 },
    { who: 'eletrica', store: 'mecanica', order: ['Bateria 60 Ah'] },
    { who: 'eletrica', store: 'padaria', order: ['Pão de Queijo Mineiro (500 g)', 'Coxinha de Frango (10 un)'] },
]

export const FIRST = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elisa', 'Felipe', 'Gabriela', 'Hugo', 'Isabela', 'João', 'Karina', 'Lucas', 'Marta', 'Nelson', 'Olívia', 'Paulo', 'Quésia', 'Rafaela', 'Sérgio', 'Tatiane', 'Ubirajara', 'Vanessa', 'Wesley', 'Yasmin', 'Zeca', 'Aline', 'Breno', 'Camila', 'Daniel', 'Eduarda', 'Fábio', 'Giovana', 'Heitor', 'Ingrid', 'Jorge', 'Larissa', 'Mateus', 'Natália', 'Otávio', 'Priscila']
export const LAST = ['Silva', 'Souza', 'Oliveira', 'Santos', 'Pereira', 'Costa', 'Rodrigues', 'Almeida', 'Nascimento', 'Lima', 'Araújo', 'Fernandes', 'Carvalho', 'Gomes', 'Martins', 'Rocha', 'Ribeiro', 'Alves', 'Monteiro', 'Mendes', 'Barros', 'Freitas', 'Barbosa', 'Pinto', 'Moura', 'Cavalcanti', 'Dias', 'Castro', 'Campos', 'Cardoso']

// comentários de avaliação por faixa de nota (genéricos + um específico por segmento)
export const COMMENTS = {
    good: [
        'Atendimento excelente, super recomendo!', 'Tudo perfeito, voltarei com certeza.', 'Qualidade acima do esperado e preço justo.',
        'Equipe atenciosa e muito profissional.', 'Chegou no prazo e do jeito que eu queria.', 'Melhor da cidade, sem dúvida.',
        'Ótimo custo-benefício, já indiquei para amigos.', 'Fui muito bem atendido(a), ambiente limpo e organizado.',
        'Nota 10! Superou minhas expectativas.', 'Rápido, transparente e honesto. Gostei demais.',
    ],
    ok: ['Bom, mas pode melhorar no prazo.', 'Gostei, só achei um pouco caro.', 'Atendimento bom, demorou um pouco para ser atendido.', 'Cumpre o que promete, sem grandes surpresas.'],
    bad: ['Demorou mais do que o combinado.', 'Esperava mais pelo valor cobrado.', 'Tive um problema e demorou para resolverem.'],
    byStore: {
        padaria: ['O pão de queijo é viciante!', 'O café especial é sensacional.', 'O bolo de cenoura é igual ao da vovó.', 'Encomendei o buffet da festa e todo mundo elogiou.', 'Os salgados chegaram quentinhos.', 'A torta de limão é a melhor que já comi.'],
        mecanica: ['Fizeram a revisão e explicaram tudo que foi trocado.', 'Orçamento honesto, sem empurrar peça desnecessária.', 'Resolveram o barulho no freio no mesmo dia.', 'Alinhamento ficou perfeito, o carro não puxa mais.'],
        psicologia: ['Me senti acolhido(a) desde a primeira sessão.', 'Profissional ética e muito sensível.', 'A terapia mudou minha forma de lidar com a ansiedade.', 'O atendimento online funciona muito bem.'],
        odonto: ['Atendimento tranquilo e sem dor.', 'O clareamento deixou meu sorriso incrível.', 'Explicam cada etapa do tratamento com clareza.', 'Levei meu filho e ele saiu sorrindo.'],
        studio: ['Saí com o cabelo dos sonhos!', 'A coloração ficou exatamente como pedi.', 'Profissionais atualizadas e muito simpáticas.', 'Ambiente lindo e atendimento impecável.'],
        contabil: ['Resolveram minha pendência que ninguém resolvia.', 'Abriram meu MEI em um dia.', 'Explicam o imposto de um jeito que dá para entender.', 'Respondem rápido e com clareza.'],
        pet: ['Meu cachorro saiu cheirosinho e feliz.', 'Veterinária carinhosa e atenciosa.', 'O táxi dog salvou minha semana.', 'Ração de qualidade e entrega rápida.'],
        eletrica: ['Chegou rápido e resolveu o curto na hora.', 'Instalação limpa e organizada.', 'Laudo completo e bem explicado.', 'Preço justo e serviço com garantia.'],
    },
}

export const PUB_COMMENTS = [
    'Adorei a novidade!', 'Já quero experimentar.', 'Muito bom, parabéns pelo trabalho!', 'Salvei para mostrar para um amigo.',
    'Que ótima ideia!', 'Vou passar aí essa semana.', 'Boa explicação, obrigado por compartilhar.', 'Top demais!', 'Compartilhei com minha família.',
]

// ---------- conversas nas publicações (comentários, respostas e respostas de respostas) ----------
export const PRAISE = [
    'Adorei a novidade!', 'Já quero experimentar 😍', 'Muito bom, parabéns pelo trabalho!', 'Salvei para mostrar para um amigo.',
    'Que ótima ideia!', 'Vou passar aí essa semana.', 'Boa explicação, obrigado por compartilhar.', 'Top demais!', 'Compartilhei com minha família.',
    'Vocês são referência na cidade 👏', 'Sempre com qualidade, parabéns!', 'Amei! Quando posso ir?', 'Que capricho, hein!', 'Já sou cliente e recomendo muito.',
    'Isso é o que eu estava esperando!', 'Mandei para o grupo da firma.', 'Fiquei com água na boca 🤤', 'Parabéns pela iniciativa!', 'Continuem assim, vocês merecem.',
    'Foto linda, produto melhor ainda.', 'Vou levar minha mãe aí no fim de semana.', 'Aprendi bastante, valeu!', 'Excelente conteúdo, continuem postando.',
]
export const REPLY_PEERS = [
    'Concordo totalmente!', 'Também adorei.', 'Já experimentei, recomendo.', 'Fui semana passada e foi ótimo.', 'Verdade, melhor da cidade.',
    'Boa! Vou lá também.', 'Mesma opinião aqui 👍', 'Foi o que pedi ontem, estava ótimo.', 'Confirmo, atendimento nota 10.', 'Quero ir junto, hein!',
]
export const THANKS = ['Perfeito, obrigado!', 'Valeu! Vou passar aí hoje.', 'Show, até já!', 'Obrigada pela resposta rápida 🙏', 'Ótimo, já fiz o pedido!', 'Combinado, muito obrigado!', 'Resolvido, valeu!']
// pergunta de cliente → resposta do dono da loja
export const QA = {
    padaria: [
        ['Vocês entregam no bairro Embratel?', 'Entregamos sim! Taxa fixa de R$ 8 e pedido mínimo de R$ 30.'],
        ['Qual o horário de funcionamento no domingo?', 'Aos domingos abrimos das 6h às 21h, igual aos outros dias.'],
        ['Tem opção sem glúten?', 'Temos pão de queijo e bolo de milho sem glúten. Confirme a disponibilidade no chat.'],
        ['Aceitam encomenda de bolo para 40 pessoas?', 'Aceitamos! Chame a gente no chat com 3 dias de antecedência.'],
        ['O cappuccino de canela também sai gelado?', 'Sai sim! É só pedir "gelado" no balcão ou no pedido.'],
        ['Dá para pagar no Pix?', 'Aceitamos Pix, cartão e dinheiro.'],
        ['Tem vaga para a aula de confeitaria no sábado?', 'Temos 2 vagas no sábado às 14h. Reserve pelo chat.'],
        ['Vocês fazem café da manhã para empresas?', 'Fazemos! Veja o Coffee Break Corporativo na aba de serviços.'],
        ['Como funciona a retirada no balcão?', 'Você faz o pedido pelo app e retira no balcão com o nome. Fica pronto em até 20 minutos.'],
        ['O pão de queijo congelado dura quanto tempo?', 'Até 60 dias no congelador. Assa direto, sem descongelar.'],
    ],
    mecanica: [['Vocês fazem revisão de carro flex?', 'Fazemos sim, de qualquer marca. Agende pela aba de serviços.'], ['Quanto tempo leva a troca de óleo?', 'Em média 40 minutos, sem precisar deixar o carro.']],
    psicologia: [['Atendem pelo plano de saúde?', 'Trabalhamos com recibo para reembolso. A primeira conversa de acolhimento é gratuita.'], ['A terapia online tem o mesmo valor?', 'Sim, o valor é o mesmo da sessão presencial.']],
    odonto: [['O clareamento causa sensibilidade?', 'Pode causar um pouco, mas usamos protocolo que reduz bastante. Avaliamos antes.'], ['Atendem criança?', 'Atendemos! Temos horário especial para os pequenos.']],
    studio: [['Vocês fazem penteado para formatura?', 'Fazemos sim! Agende com antecedência pelo chat.'], ['Tem horário aos sábados à tarde?', 'Temos alguns horários. Veja a agenda na aba de serviços.']],
    contabil: [['Fazem declaração de IR para MEI?', 'Fazemos a declaração anual do MEI e também a pessoa física.'], ['Atendem online?', 'Atendemos 100% online ou presencial, como preferir.']],
    pet: [['Fazem banho em gato?', 'Fazemos com agendamento e cuidado especial.'], ['O táxi dog atende qual região?', 'Atendemos toda a região central e bairros próximos.']],
    eletrica: [['Atendem sábado?', 'Atendemos sim, das 7h às 18h. Urgência 24 h por telefone.'], ['Emitem nota fiscal?', 'Emitimos nota fiscal de serviço em todos os atendimentos.']],
}

// pedidos de serviço publicados por clientes ("procurando profissional") e quais lojas/profissionais do ecossistema se candidatam
export const SERVICE_REQUESTS = [
    ['eletricista', null, 'Rua Rafael Vaz e Silva, 410, São Cristóvão, Porto Velho - RO', 'Preciso trocar o disjuntor geral e revisar os fios da cozinha. O chuveiro desarma toda vez que ligo junto com o micro-ondas.', 'Posso receber a partir das 14h.', ['eletrica']],
    ['eletricista', null, 'Av. Calama, 880, Embratel, Porto Velho - RO', 'Instalação de 6 luminárias de LED e 3 tomadas novas na sala comercial.', 'Material por minha conta.', ['eletrica']],
    ['cabeleireiro', null, 'Rua José Bonifácio, 120, Olaria, Porto Velho - RO', 'Procuro profissional para corte e coloração em casa para a minha mãe, que tem dificuldade de locomoção.', 'Atendimento domiciliar, sábado de manhã.', ['studio']],
    ['psicologa', null, 'Atendimento online', 'Busco psicóloga para acompanhamento semanal de ansiedade. Prefiro atendimento online no período da noite.', null, ['psicologia']],
    ['dentista', null, 'Av. Sete de Setembro, 900, Nossa Senhora das Graças, Porto Velho - RO', 'Dor no dente do fundo há dois dias. Preciso de avaliação e, se der, atendimento ainda esta semana.', 'Urgente.', ['odonto']],
    ['veterinario', null, 'Rua Dom Pedro II, 320, Centro, Porto Velho - RO', 'Minha cachorrinha de 8 anos está sem apetite. Preciso de consulta veterinária a domicílio.', null, ['pet']],
    ['pintor', null, 'Rua Euclides da Cunha, 77, Liberdade, Porto Velho - RO', 'Pintura de apartamento de 2 quartos (sala, cozinha e 2 quartos). Paredes já estão preparadas.', 'Tinta eu compro, só a mão de obra.', []],
    ['encanador', null, 'Av. Jorge Teixeira, 1500, Industrial, Porto Velho - RO', 'Vazamento embaixo da pia da cozinha e torneira do tanque pingando.', 'Pode ser a qualquer hora.', []],
    ['diarista', null, 'Rua das Palmeiras, 230, Porto Velho - RO', 'Diarista para limpeza pesada de casa de 3 quartos, uma vez só, antes de uma mudança.', null, []],
    ['jardineiro', null, 'Rua Campos Sales, 45, Centro, Porto Velho - RO', 'Poda de duas árvores e limpeza do quintal (aprox. 120 m²).', 'Preciso de nota fiscal.', []],
    ['montador', null, 'Av. Rio Madeira, 700, Mato Grosso, Porto Velho - RO', 'Montagem de guarda-roupa de 6 portas e uma cômoda. Móveis já estão no local.', null, []],
    ['instrutor', null, 'Rua Almirante Barroso, 150, Centro, Porto Velho - RO', 'Aulas de violão para iniciante, duas vezes por semana. Tenho o instrumento.', 'Prefiro à tarde.', []],
    ['personal', null, 'Academia perto do Shopping, Porto Velho - RO', 'Personal para treino de força 3x por semana, foco em ganho de massa.', null, []],
    ['massageador', null, 'Rua Tenreiro Aranha, 90, Centro, Porto Velho - RO', 'Massagem relaxante para dor nas costas. Atendimento no meu escritório.', 'Quartas ou sextas.', []],
    ['outro', 'Fotógrafo para aniversário', 'Salão de festas Vila Verde, Porto Velho - RO', 'Fotógrafo para festa de 15 anos, sábado, das 19h às 23h. Cerca de 80 convidados.', 'Quero ver portfólio antes.', []],
    ['outro', 'Técnico de ar-condicionado', 'Rua Rio Branco, 310, Centro, Porto Velho - RO', 'Instalação de 2 aparelhos split de 12.000 BTU em escritório.', 'Já tenho os aparelhos.', ['eletrica']],
]

// comunidades (salas de conversa): lugar (cidade/estado/país) e grupos de interesse
export const COMMUNITIES = [
    { slug: 'porto-velho', name: 'Porto Velho', city: 'Porto Velho', scope: 'city', kind: 'place', members: 96, messages: 70, description: 'A sala de conversa de quem vive em Porto Velho: dicas, avisos, achados e perdidos e indicações.',
        lines: ['Alguém sabe se a Av. Jorge Teixeira está interditada hoje?', 'Estou procurando uma boa padaria perto do centro, indicação?', 'Chuva forte chegando no Embratel, cuidado pessoal ☔', 'Perdi um chaveiro azul na Praça das Três Caixas, se alguém achar me avisa!', 'Alguém indica um eletricista de confiança?', 'O Auto Center Rondônia resolveu meu freio no mesmo dia, recomendo.', 'Feira do produtor sábado cedo na Av. Sete de Setembro, bora?', 'Quem mais está sem sinal de internet no bairro Olaria?', 'Vi que abriram uma sorveteria nova na Calama, alguém foi?', 'Bom dia, Porto Velho! ☀️', 'Procuro dentista que atenda criança, alguma dica?', 'Show de domingo na orla vai ter banda local, já vou separar o horário.', 'Ônibus da linha 201 atrasou de novo hoje.', 'Obrigado pela dica do café, fui lá e amei!', 'Alguém vendo sofá em bom estado? Pago bem.'] },
    { slug: 'rondonia', name: 'Rondônia', city: 'Rondônia', scope: 'state', kind: 'place', members: 64, messages: 40, description: 'Todo o estado numa sala: novidades, eventos e conexões entre as cidades de Rondônia.',
        lines: ['Alguém de Ji-Paraná conhece bons fornecedores de embalagem?', 'Festival de cinema em Vilhena começa semana que vem!', 'Ariquemes tem vaga para eletricista industrial, procurem a prefeitura.', 'Como está a estrada de Jaru para Ouro Preto hoje?', 'Quem produz café especial em Cacoal? Quero fechar compra.', 'Feira agropecuária em Rolim de Moura, vão?', 'Dica: o iUser agora tem lojas de várias cidades de Rondônia 👏', 'Boa tarde, Rondônia! Alguém indica hospedagem em Guajará-Mirim?'] },
    { slug: 'empreendedores-de-porto-velho', name: 'Empreendedores de Porto Velho', city: 'Porto Velho', scope: 'city', kind: 'custom', members: 48, messages: 55, description: 'Donos de loja e prestadores trocando ideias, indicações e parcerias na cidade.',
        lines: ['Quem aqui usa nota fiscal eletrônica de serviço? Algum contador para indicar?', 'A Contábil Fácil abriu meu MEI em um dia, super recomendo.', 'Estou montando uma promoção para o Dia das Crianças, ideias?', 'Quem vende pelo iUser: como vocês divulgam as publicações?', 'Procuro parceria com eletricista para atender meus clientes.', 'Meu pão de queijo bateu recorde de pedidos essa semana 🎉', 'Alguém contrata fotógrafo para ensaio de produtos?', 'Dica de ouro: respondam rápido no chat, o cliente valoriza muito.', 'Fecho parceria com quem faz entrega local?', 'Hoje fiz o primeiro pedido para a loja de um colega aqui do grupo, que bacana!', 'Como vocês organizam a agenda dos serviços?', 'Quem quer trocar contato para um grupo de indicações?'] },
    { slug: 'pets-de-porto-velho', name: 'Pets de Porto Velho', city: 'Porto Velho', scope: 'city', kind: 'custom', members: 52, messages: 45, description: 'Tutores de cães, gatos e outros bichinhos: dicas, adoção, veterinários e passeios.',
        lines: ['Meu cachorro anda com coceira, algum veterinário para indicar?', 'Feira de adoção neste sábado no Pet Amigo, vão?', 'Alguém sabe um bom banho e tosa para gato?', 'Perdemos a Mel, golden de 3 anos, no Embratel. Qualquer pista nos avise 🙏', 'Qual ração vocês estão usando para filhote?', 'Passeio coletivo no domingo na orla, quem vai?', 'O táxi dog salvou minha semana!', 'Vacina antirrábica com desconto essa semana, aproveitem.'] },
    { slug: 'saude-e-bem-estar-pvh', name: 'Saúde e bem-estar PVH', city: 'Porto Velho', scope: 'city', kind: 'custom', members: 40, messages: 38, description: 'Conversa sobre saúde, rotina e cuidados: psicologia, odontologia, alimentação e atividade física.',
        lines: ['Alguém tem dica de rotina de sono? Ando dormindo muito mal.', 'Fiz clareamento na Odonto Sorriso e adorei o resultado.', 'A psicóloga da Clínica Mente Viva me ajudou muito com a ansiedade.', 'Grupo de caminhada às 6h na orla, quem topa?', 'Receita de suco detox que não é enjoada?', 'Quanto tempo leva para ver resultado de musculação?', 'Lembrete: beber água, pessoal 💧', 'Alguém conhece nutricionista que atenda online?'] },
    { slug: 'brasil', name: 'Brasil', city: 'Brasil', scope: 'country', kind: 'place', members: 80, messages: 12, description: 'A grande sala do país: gente de todo lugar conversando sobre tudo.',
        lines: ['Bom dia, Brasil! ☕', 'Alguém de outro estado usando o iUser?', 'Qual a melhor comida típica da sua cidade?', 'Chegou a frente fria aqui no sul, e por aí?', 'Dicas de livro para o fim de semana?', 'Torcendo por todos os pequenos negócios do país 👏'] },
]
export const COMMUNITY_REPLIES = ['Concordo!', 'Boa dica, obrigado.', 'Também estou precisando disso.', 'Show!', 'Vou ver isso hoje.', 'Obrigada por compartilhar 🙏', 'Verdade!', 'Alguém mais passou por isso?', 'Já usei e recomendo.', 'Quero ir também.']
