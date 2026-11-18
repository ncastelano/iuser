# Estudo: delivery do iUser × concorrentes, dinheiro na porta e preço (18/11/2026)

> **Andamento (18/11/2026):** implementado no app (migrations `20261130000074` a `20261130000078`): saídas A (Pix antes, direto à loja), B (Pix na porta),
> C1 (link de cartão da loja), D (frete devido pela loja + acerto pelo saldo + troco na oferta); ajustes de preço 1 (teto do Pós-pago) e 2 (frete mínimo
> R$ 7,00, editável em Admin → Entregas); itens 2 (o cliente vê o entregador), 4 (push do cancelamento sem entregador), 5 (Admin dos prazos e limites) e
> 6 (endereço obrigatório para o Entregador do iUser) da seção 4. Ficam para depois: E (confirmação automática pela Asaas), C2 (Tap to Pay do entregador)
> e o item 8 (custo por pedido).

Objetivo: saber o que o iUser já tem, o que os concorrentes cobram e fazem, e o que falta para o delivery começar a ser
vendido com qualidade. Três perguntas do dono:

1. Como tirar do motorista a volta à loja para levar o troco/dinheiro e devolver a maquininha?
2. Como competir com as comissões (≈ 15% a 27%) e os fretes baixos dos concorrentes cobrando só o plano (Pré R$ 100/mês)
   ou R$ 0,50 por uso (Pós)?
3. O que priorizar para o iUser ficar comercializável?

> Os números dos concorrentes vêm de páginas públicas e blogs (lista de fontes no fim). Vários divergem entre si e mudam
> por cidade e por negociação. Use como ordem de grandeza e confirme com proposta por escrito antes de usar em material
> de venda.

---

## 1. O que os concorrentes cobram

| Plataforma | Loja paga | Quem entrega | Observações |
|---|---|---|---|
| **iFood – Plano Básico** | **12%** de comissão + **3,2%** no pedido pago pelo app + mensalidade **R$ 110** (acima de R$ 1.800/mês) | a própria loja | o mais usado; total ≈ 15% |
| **iFood – Plano Entrega** | **23%** + 3,2% + mensalidade **R$ 150** | entregador do iFood | total ≈ 26%; algumas fontes citam 27% |
| **99Food** | **0%** no lançamento (2025, promoção de 1 a 2 anos); depois, segundo um blog, **8,9%** (entrega 99) ou **10,9%** (entrega própria) + 3,2% | os dois modelos | entrou forte com dinheiro e com garantia de ganho para motoboys |
| **Keeta (Meituan)** | sem tabela pública; fala-se em 2 a 3 pontos abaixo do iFood (≈ 9,9% a 12%) | os dois | chegou em 2025 com R$ 5,6 bi de investimento |
| **Rappi** | **0% por 3 anos** para quem entrou em 2025; tabela antiga: 3,5% (entrega própria) ou 27% (entrega Rappi) | os dois | promoção com prazo de adesão |
| **Cardápio próprio (Anota AI, Goomer, Cardápio Web)** | **mensalidade** ≈ R$ 115 a R$ 300, **sem comissão** | a própria loja | o iFood comprou a Anota AI: é o concorrente direto do modelo "sem comissão" |

**Entregador:** o iFood paga no mínimo **R$ 7,50 por rota** de moto/carro (≈ até 5 km) e **R$ 7,00** de bicicleta desde
junho de 2025, mais adicionais por km e por entrega extra na rota. A 99 chegou a garantir **R$ 250/dia** para quem fizesse
20 corridas em SP.

**Dinheiro e maquininha nos concorrentes (o ponto 1):** no iFood, quando a entrega é do iFood, **o entregador nunca volta
à loja**:
- **cartão:** o entregador usa uma **maquininha do próprio iFood**. O dinheiro entra no iFood e vai para a loja no repasse;
- **dinheiro:** o iFood cuida do troco e do repasse. A loja recebe junto com os pedidos online e não dá troco;
- o recebimento em dinheiro **só é liberado para alguns entregadores** (histórico e indicadores), como a liberação por
  etapas que o iUser já tem (`delivery_trust_settings`).

Isso só funciona porque o iFood **movimenta o dinheiro**: é instituição de pagamento, recebe tudo e repassa. O iUser hoje
decidiu **não movimentar dinheiro**. Por isso a solução do iUser precisa ser outra (seção 3).

---

## 2. O que o iUser cobra hoje

| Quem | Pré-pago | Pós-pago |
|---|---|---|
| **Loja** | R$ 100/mês, sem taxa por pedido | R$ 0,50 por pedido pago, venda no balcão, agendamento, produto novo, publicação… (`service_pricing`); trava com R$ 100 de dívida |
| **Motorista/entregador** | plano R$ 50 ou R$ 100/mês | R$ 0,50 por corrida/entrega concluída (`ride_fee`) |
| **Cliente** | — | — |
| **Frete** | 100% do motorista (o iUser não fica com nada) | idem |

**Tarifa iUser de moto** (Admin → Tarifas): **R$ 5,00 até 3 km + R$ 1,50 por km**. Exemplos: 3 km = R$ 5,00; 5 km =
R$ 8,00; 8 km = R$ 12,50.

### Comparação para a mesma loja

Lanchonete com **600 pedidos/mês** e tíquete de **R$ 45** (R$ 27.000/mês), todos pagos por Pix/app:

| Plataforma | Custo para a loja por mês | % do faturamento |
|---|---|---|
| iFood Entrega (23% + 3,2% + R$ 150) | **R$ 7.224** | 26,8% |
| iFood Básico (12% + 3,2% + R$ 110) | **R$ 4.214** | 15,6% |
| 99Food depois da promoção (8,9% + 3,2%) | **R$ 3.267** | 12,1% |
| Cardápio próprio (Anota AI, plano de entrada) | **≈ R$ 300** | 1,1% |
| **iUser Pós-pago** (600 × R$ 0,50) | **R$ 300** | 1,1% |
| **iUser Pré-pago** | **R$ 100** | 0,37% |

Loja pequena (**100 pedidos/mês**, R$ 4.500): iFood Básico ≈ **R$ 794**, iUser Pós **R$ 50**, iUser Pré **R$ 100**.

**Conclusão:** para a loja, o iUser já é de 10 a 70 vezes mais barato que o iFood. O argumento de preço já está ganho.
**O que falta é confiança e operação:** entregador disponível, pagamento sem atrito e o cliente acompanhando o pedido.

### Três ajustes de preço que recomendo

1. **Teto do Pós-pago = preço do Pré-pago.** Hoje, acima de 200 pedidos no mês, o Pós custa mais que o Pré: com 600
   pedidos, R$ 300 contra R$ 100. A loja que não percebe se sente enganada. Proposta: "pague R$ 0,50 por pedido até
   R$ 100 no mês; depois disso o mês é ilimitado". Na prática, o Pós vira o Pré "sem compromisso", e a frase de venda
   fica simples: **nunca mais que R$ 100 por mês, e nenhuma comissão**.
2. **Frete mínimo do entregador perto do mercado.** O iFood paga **R$ 7,50** por rota curta; o iUser paga **R$ 5,00** até
   3 km. O entregador escolhe onde trabalhar pelo que ganha por hora, e com R$ 5 o iUser perde os bons entregadores na
   hora de pico. Sugestão: **frete mínimo de entrega de loja em R$ 7,00 a R$ 7,50** (só muda `platform_tariffs`, moto
   base). Quem paga é o cliente, e mesmo assim o pedido sai mais barato que no iFood: sem comissão, a loja pode cobrar
   menos pelo lanche.
3. **Cobrança do entregador:** o iUser fica com R$ 0,50 por entrega, contra 0% no iFood (que ganha da loja) e cerca de
   25% na Uber/99 (corridas). É justo, mas a mensagem precisa ser clara: **"o frete é 100% seu; o iUser fica com R$ 0,50
   ou com o plano"**. Vale mostrar isso na Central de entregas ("hoje: 14 entregas, R$ 112 de frete, R$ 7 para o iUser").

---

## 3. Dinheiro, troco e maquininha sem o motorista voltar à loja

### Como é hoje no iUser (já pronto e publicado)

- **Dinheiro na porta:** o entregador recebe o total e fica com o frete. O valor dos produtos fica como dívida com a loja
  (`store_dues` tipo `cash`). Ele repassa por **Pix** (a chave da loja aparece só para quem deve) ou em mãos, e a loja
  confirma. Prazo de 24 h e limite de R$ 300 em aberto; passou disso, ele não pega mais entrega.
- **Maquininha da loja:** a máquina sai com o entregador e precisa **voltar em até 3 h** depois da última entrega no cartão
  (`store_dues` tipo `machine`).
- **Liberação por etapas:** entregador novo só leva pedido pago por Pix; iniciante leva até R$ 60 por entrega e R$ 80 ao
  mesmo tempo; o favorito da loja fica livre.

**O que incomoda:** a maquininha obriga o entregador a voltar, e o troco depende do bolso dele. Não dá para resolver só
com regra: é preciso mudar **como o cliente paga**.

### As saídas, da mais simples para a mais completa

**A. Pagar antes, por Pix direto para a loja (recomendado como padrão).** No checkout, o app mostra o **QR Pix
dinâmico da própria loja**, com o valor exato e o número do pedido (`lib/pixBrCode.ts` já monta isso, como na Venda no
balcão). O dinheiro cai na conta da loja; o entregador não toca em dinheiro, não precisa de troco nem de maquininha. A
loja confirma "recebi" (ou o banco confirma sozinho, na saída E). O frete segue a regra que o iUser já desenhou para o
novo fluxo de entrega: **o cliente paga o total à loja e a loja paga o frete ao entregador**, por Pix, no momento da
retirada (a tela do código de retirada pode mostrar "pague R$ 8,00 de frete ao Rafa · copiar Pix"). Vantagem: elimina
golpe, troco e maquininha de uma vez. Custo: a loja precisa confirmar o Pix enquanto não houver confirmação automática.

**B. Pix na porta com o QR da loja.** Para o cliente que só quer pagar ao receber: o celular do entregador mostra o
**QR da loja** com o valor exato, o cliente paga na hora e o dinheiro vai direto para a loja. O entregador só confere a
tela de "pago" do cliente; não leva maquininha nem dinheiro. É o mesmo QR da saída A, mostrado na porta. Substitui boa
parte dos pagamentos "em dinheiro", que na prática são de quem não quer pagar antes.

**C. Cartão sem a maquininha da loja.** Três caminhos, nesta ordem de preferência:
1. **Link de pagamento da loja:** a loja cadastra o link de cartão dela (Mercado Pago, InfinitePay, PagBank…), e o
   cliente paga no próprio celular, no checkout ou na porta. Nada de hardware.
2. **Celular do entregador como maquininha** (Tap to Pay da InfinitePay, PagBank, Mercado Pago; Android com NFC; débito
   ≈ 0,9% a 1,4%, crédito ≈ 3,2%; CPF com limite de ≈ R$ 3 mil por venda). O dinheiro cai na conta dele e ele repassa à
   loja pelo mesmo caminho do dinheiro (Pix, descontando o frete). O iUser só registra; a regra de quem paga a taxa do
   cartão precisa ser decidida (sugestão: a loja, descontada do repasse).
3. **Maquininha da loja viajando** (como hoje): fica só para a **entrega própria da loja** (o funcionário volta de
   qualquer jeito), nunca para o entregador iUser.

**D. Dinheiro sem voltar à loja: conta corrente loja × entregador.** Quando um entregador trabalha muito para a mesma
loja, os valores vão nos dois sentidos: ele deve à loja os produtos dos pedidos em dinheiro, e a loja deve a ele o frete
dos pedidos pagos por Pix (saída A). Em vez de um Pix por pedido, o iUser **soma tudo e mostra o saldo** ("hoje: você
deve R$ 84 à Pizzaria, ela te deve R$ 40 de frete → repasse R$ 44"). Um Pix por dia, sem voltar à loja, e o iUser
continua sem tocar no dinheiro: só faz a conta das declarações (`store_dues` já guarda as duas pontas). O troco continua
com o entregador, mas pode ficar mais fácil:
- a oferta mostra **"precisa de troco de R$ 30"** antes de ele aceitar (o cliente já informa "troco para R$ X"), e ele
  só pega se tiver;
- um **troco máximo** por pedido (ex.: R$ 50);
- **pagamento misto:** sem troco suficiente, o cliente paga uma parte em dinheiro e o resto no QR da loja (saída B).

**E. Confirmação automática do Pix (próxima etapa, decisão do dono).** Com a **Asaas** (subconta por loja + webhook),
o banco avisa o iUser quando o Pix cai, e o pedido segue sozinho, sem a loja conferir. No Pix o split é instantâneo, e o
dinheiro pode ser dividido na hora: produtos para a subconta da loja, frete para a subconta do entregador. Isso resolve
tudo, mas **abre a exceção "o iUser movimenta dinheiro"** (a mesma já avaliada para o Pix automático dos produtos
digitais) e exige cadastro e KYC de cada loja e entregador.

### Recomendação

1. **Agora (sem mover dinheiro):** A como padrão no checkout, B como opção na porta, C1 para cartão e o "precisa de
   troco" na oferta (parte de D). A maquininha da loja sai do fluxo do entregador iUser.
2. **Em seguida:** a conta corrente loja × entregador (D), com um repasse por dia.
3. **Quando houver volume:** a confirmação automática pela Asaas (E). Primeiro só a confirmação; o split, depois de uma
   decisão sobre movimentar dinheiro.

---

## 4. O que falta para vender o delivery com qualidade

Em ordem de impacto no dia a dia (o resto já existe: entregador antes da loja, código de retirada, prova de entrega,
caixa do entregador, contestação, favoritos, ciclo sem pedido parado):

1. **Pagamento sem atrito** (seção 3, saídas A e B).
2. **O cliente vê onde está o entregador e quanto falta.** Hoje a loja vê "Rafa chega em ~6 min", mas o cliente não lê
   a posição do entregador. É a pergunta número um no suporte de qualquer delivery.
3. **Entregador disponível no pico.** Com o frete curto abaixo do iFood (R$ 5 × R$ 7,50), faltará gente às 20 h. Ajustar
   a tarifa e mostrar ao entregador o ganho do dia.
4. **Aviso no celular de cancelamento e atraso.** Hoje esses avisos aparecem só no app aberto (`order_no_driver`,
   cancelamento pelo prazo).
5. **Tela do Admin para os prazos** (`delivery_cycle_settings`, `delivery_hold_settings`, `delivery_dues_settings`,
   `delivery_trust_settings`): hoje só mudam por SQL. Para operar várias cidades, o Admin precisa mexer sem programador.
6. **Loja sem endereço cadastrado** pula o "entregador primeiro". Obrigar o endereço para quem liga o Entregador iUser.
7. **Teto do Pós-pago** (seção 2, ajuste 1): a frase de venda "nunca mais que R$ 100".
8. **Custo por pedido do próprio iUser:** cada pedido usa rotas e buscas do Mapbox, push e banco. Medir quanto custa um
   pedido de ponta a ponta e garantir que fica bem abaixo dos R$ 0,50 do Pós (a telemetria de uso já existe; falta somar
   o Mapbox por pedido).

### Como vender, em uma frase por público

- **Loja:** "Sem comissão. Nunca mais que R$ 100 por mês. O dinheiro do cliente cai direto na sua conta."
- **Entregador:** "O frete é 100% seu. Você vê o valor e o troco antes de aceitar e não volta à loja."
- **Cliente:** "Mesmo lanche, mais barato que no app grande, e você acompanha o entregador até a porta."

---

## Fontes

- [Taxas do iFood para restaurante (blog oficial do iFood)](https://blog-parceiros.ifood.com.br/taxas-ifood/)
- [Planos do iFood para parceiros (blog oficial)](https://blog-parceiros.ifood.com.br/planos-ifood/)
- [Pagamento na entrega no iFood: maquininha cedida e troco pelo iFood (blog oficial)](https://blog-parceiros.ifood.com.br/pagamento-na-entrega/)
- [Taxa do iFood para lojista em 2026 (Brendi)](https://brendi.com.br/blog/taxas-ifood-lojistas-2026/)
- [iFood reajusta a taxa mínima do entregador para R$ 7,50 (Mercado & Consumo, abr/2025)](https://mercadoeconsumo.com.br/29/04/2025/noticias/ifood-anuncia-reajuste-de-ate-154-na-taxa-minima-paga-aos-entregadores/)
- [99Food zera taxa de serviço para restaurantes (BS9, mai/2025)](https://www.bs9.com.br/brasil/2025/05/02/apos-anuncio-de-investimento-bilionario-99food-zera-taxa-de-servico-para-restaurantes.html)
- [Taxas da 99Food (ajuda oficial)](https://99app.com/ajuda/99food/quais-taxas-a-plataforma-cobra/)
- [Como vender na 99Food em 2026 (Controle na Mão)](https://controlenamao.com.br/blog/como-vender-na-99food/)
- [99Food: remuneração mínima diária para entregadores em SP](https://www.bnewssaopaulo.com.br/noticias/politica/99food-remuneracao-minima-diaria-entregadores-sp-valor.html)
- [Keeta para restaurantes em 2026 (Brendi)](https://brendi.com.br/keeta-para-restaurantes)
- [Meituan lança a Keeta no Brasil com R$ 5,6 bi (Abrasel)](https://abrasel.com.br/noticias/entrevistas/meituan-lanca-keeta-no-brasil-com-r-5-6-bi-e-enfatiza-competitividade-do-setor/)
- [Rappi com taxa zero (Guia do Investidor)](https://guiadoinvestidor.com.br/noticias/rappi-acirra-disputa-do-delivery-com-taxa-zero-e-app-turbinado-para-conquistar-o-brasil/)
- [iFood compra a Anota AI (Startups)](https://startups.com.br/negocios/exclusivo-ifood-compra-a-anota-ai-para-oferecer-atendimento-pelo-whatsapp/)
- [Preço da Anota AI (Take App)](https://www.take.app/alternatives/anota-ai)
- [Maquininha no celular: taxas (InfinitePay)](https://www.infinitepay.io/blog/maquininha-no-celular-menor-taxa)
- [Tap to Pay: comparação (Calculadora de Taxas)](https://calculadoradetaxas.com.br/maquininha-com-tap_to_pay)
- [Split de pagamento (documentação da Asaas)](https://docs.asaas.com/docs/split-de-pagamento)
