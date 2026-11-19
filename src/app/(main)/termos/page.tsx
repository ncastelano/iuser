// app/(main)/termos/page.tsx
//
// Termos de Uso do iUser (18/11/2026). O cadastro manda aceitar este texto e a página não existia (404).
// Escrito a partir de como o app FUNCIONA hoje (o iUser não recebe o dinheiro de pedidos e corridas; planos Pré e Pós-pago;
// programa Convidados; moderação). É uma base: precisa da revisão de um advogado e dos dados da empresa (LEGAL_ENTITY).
// Ao mudar uma regra do app que aparece aqui (planos, limites, quem paga quem), atualize o texto e a data.
import { LegalDoc, Sec, Ul, LEGAL_ENTITY } from '@/components/legal/LegalDoc'

export const metadata = {
    title: 'Termos de Uso | iUser',
    description: 'As regras para usar o iUser: contas, lojas, motoristas, pedidos, planos e conduta.',
}

export default function TermosPage() {
    const e = LEGAL_ENTITY
    return (
        <LegalDoc
            title="Termos de Uso"
            updated="18 de novembro de 2026"
            intro={<p>
                Bem-vindo ao iUser. Estes Termos explicam as regras para usar o aplicativo e o site <b>iuser.com.br</b>{' '}(o &quot;iUser&quot;).
                Ao criar uma conta ou usar o iUser você concorda com eles e com a <a href="/privacidade" className="underline">Política de Privacidade</a>.
                Se não concordar, não use o iUser.
            </p>}
        >
            <Sec n={1} title="O que é o iUser">
                <p>
                    O iUser é uma <b>plataforma de tecnologia</b> que aproxima pessoas, lojas, prestadores de serviço e motoristas independentes.
                    Pelo iUser você pode vender e comprar produtos, contratar e oferecer serviços, agendar horários, pedir e fazer corridas e entregas,
                    publicar conteúdo e conversar.
                </p>
                <p>
                    O iUser <b>não é</b> o vendedor dos produtos, o prestador dos serviços nem a empresa de transporte: quem vende é a loja, quem presta
                    o serviço é o profissional e quem faz a corrida ou a entrega é o motorista, cada um responsável pelo que oferece. O iUser fornece a
                    ferramenta, as regras de uso e os meios de denúncia e de contestação descritos aqui.
                </p>
            </Sec>

            <Sec n={2} title="Quem pode usar">
                <Ul>
                    <li>Para criar conta é preciso ter <b>18 anos ou mais</b> e capacidade para assinar contratos.</li>
                    <li>Os dados do cadastro precisam ser verdadeiros e seus. Uma pessoa não pode usar a conta de outra, nem criar contas para fraudar regras, pontos ou indicações.</li>
                    <li>Você é responsável pelo que acontece na sua conta: guarde sua senha e avise-nos se notar uso que não reconhece.</li>
                </Ul>
            </Sec>

            <Sec n={3} title="Pagamentos entre as pessoas: o iUser não recebe esse dinheiro">
                <p>
                    O valor de pedidos, corridas, entregas, agendamentos, gorjetas e mensalidades de clube é pago <b>diretamente</b> por quem compra a
                    quem vende ou presta o serviço (por exemplo, pelo Pix da loja, em dinheiro na entrega ou na maquininha da loja). O iUser mostra
                    para onde pagar e <b>registra o que cada parte declara</b> (&quot;já paguei&quot;, &quot;recebi&quot;), mas não guarda, não
                    repassa e não garante esse dinheiro.
                </p>
                <Ul>
                    <li>Confira o valor e o destinatário antes de pagar. Pagamento feito fora do caminho indicado no iUser é de sua responsabilidade.</li>
                    <li>Devoluções, trocas e reembolsos são feitos entre as partes, conforme o Código de Defesa do Consumidor e a política de cada loja. O iUser pode intermediar a conversa e registrar a contestação.</li>
                    <li>Nas entregas, o entregador recebe o frete e repassa à loja o que receber em dinheiro pelos produtos; a loja paga ao entregador o frete das entregas pagas a ela. O iUser registra essas declarações e pode suspender quem não se regulariza.</li>
                </Ul>
            </Sec>

            <Sec n={4} title="Planos e taxas do iUser">
                <p>Quem vende, presta serviço, anuncia ou dirige pelo iUser escolhe um plano:</p>
                <Ul>
                    <li><b>Pré-pago:</b> mensalidade fixa, sem taxa por uso.</li>
                    <li><b>Pós-pago:</b> uma taxa pequena por uso (por exemplo, por pedido pago ou corrida), acumulada e quitada por Pix, com um teto por mês e um limite de dívida. Ao chegar no limite, o uso que gera taxa fica pausado até a quitação.</li>
                    <li>Os valores em vigor aparecem no app antes da contratação. Mudanças de preço são avisadas com antecedência e não alteram o que já foi cobrado.</li>
                    <li>Comprar como cliente, pedir corrida e usar o app para conversar e publicar é gratuito.</li>
                </Ul>
            </Sec>

            <Sec n={5} title="Lojas e prestadores de serviço">
                <Ul>
                    <li>Você é o responsável pelos produtos e serviços que anuncia: descrição verdadeira, preço, estoque, prazo, qualidade, garantia, nota fiscal e o cumprimento das leis do seu ramo (inclusive as de defesa do consumidor).</li>
                    <li><b>Produtos com regra própria</b> (medicamentos, bebidas alcoólicas, tabaco, gás de cozinha, produtos para animais, alimentos e outros) só podem ser vendidos por quem tem as licenças exigidas, e seguindo essas regras — por exemplo, não vender bebida alcoólica a menores de 18 anos e não vender medicamento que exige receita sem ela.</li>
                    <li>É proibido anunciar produtos ou serviços ilegais, falsificados, roubados, armas, drogas, conteúdo sexual envolvendo menores e qualquer coisa que viole direitos de terceiros.</li>
                    <li>Conteúdo digital (música, vídeo, cursos, livros, programas) só pode ser vendido ou distribuído por quem é o autor ou tem licença. Ao enviar, você declara isso e responde por qualquer violação.</li>
                </Ul>
            </Sec>

            <Sec n={6} title="Motoristas e entregadores">
                <Ul>
                    <li>Motoristas e entregadores são <b>profissionais independentes</b>: escolhem se ficam disponíveis, quais corridas e entregas aceitam, o horário e, quando o app permite, a própria tarifa. Não há relação de emprego com o iUser nem com as lojas pelo simples uso da plataforma.</li>
                    <li>Você precisa ter habilitação válida para o veículo, documentos do veículo em dia e cumprir as regras de trânsito e as exigências da sua cidade para o transporte de passageiros ou de mercadorias.</li>
                    <li>As informações do seu cadastro (foto, veículo) precisam ser verdadeiras. Para levar dinheiro ou maquininha de lojas, o iUser libera por etapas, conforme o histórico.</li>
                    <li>O valor combinado da corrida é o que vale; esperas e paradas seguem as regras mostradas no app antes de começarem.</li>
                </Ul>
            </Sec>

            <Sec n={7} title="Programa Convidados iUser (indicação)">
                <Ul>
                    <li>Você pode convidar pessoas para o iUser. Quando alguém que você indicou <b>paga um plano do iUser</b>, você pode receber uma comissão sobre esse pagamento, conforme a sua graduação e as regras exibidas no app.</li>
                    <li>A comissão vem <b>somente de pagamentos reais de planos</b>, nunca do simples cadastro de pessoas. Não há taxa de adesão ao programa, não é investimento e não há promessa de ganho.</li>
                    <li>Indicações falsas, contas criadas para si mesmo ou combinadas, e qualquer manipulação geram o cancelamento das comissões e a suspensão da conta.</li>
                    <li>O iUser pode mudar ou encerrar o programa com aviso prévio, respeitando as comissões já confirmadas.</li>
                </Ul>
            </Sec>

            <Sec n={8} title="Conteúdo, conduta e moderação">
                <Ul>
                    <li>O que você publica (fotos, textos, avaliações, mensagens, flashes) continua sendo seu. Você permite ao iUser exibi-lo dentro da plataforma e nos compartilhamentos que você fizer, enquanto estiver publicado.</li>
                    <li>É proibido: assédio, ameaça, discurso de ódio, conteúdo sexual explícito, golpes, spam, informação falsa sobre pessoas ou produtos, divulgar dados pessoais de terceiros, e manipular avaliações, pontos, rankings, visitas ou compartilhamentos.</li>
                    <li>Qualquer pessoa pode denunciar um conteúdo. Conteúdo denunciado por várias pessoas pode ser ocultado automaticamente até a nossa análise; o iUser pode remover conteúdo, suspender ou encerrar contas que violem estes Termos ou a lei.</li>
                    <li>Se você é titular de um direito (por exemplo, autoral) e encontrou uma violação, envie a notificação para <a href={`mailto:${e.email}`} className="underline">{e.email}</a> com o endereço do conteúdo e a prova do seu direito.</li>
                </Ul>
            </Sec>

            <Sec n={9} title="Segurança do sistema">
                <p>
                    É proibido tentar acessar dados de outras pessoas, contornar limites e travas do app, automatizar acessos em massa, explorar falhas
                    ou atrapalhar o funcionamento do iUser. Se você encontrar uma falha de segurança, avise-nos em <a href={`mailto:${e.email}`} className="underline">{e.email}</a>
                    {' '}antes de divulgá-la; agradecemos quem faz isso de boa-fé.
                </p>
            </Sec>

            <Sec n={10} title="Responsabilidades e limites">
                <Ul>
                    <li>O iUser se esforça para manter o serviço disponível e seguro, mas ele pode ter interrupções para manutenção ou por falhas de terceiros (internet, provedores de mapa, de mensagem e de hospedagem).</li>
                    <li>Cada loja, prestador e motorista responde pelo que oferece e faz. O iUser responde pelos atos da própria plataforma, nos limites da lei.</li>
                    <li><b>IA do iUser:</b> a IA ajuda a fazer pedidos no app (procurar, cadastrar produto, mudar preço, ficar online...). Ela pode entender errado: por isso mostra o que entendeu e nada muda sem você tocar em <b>Confirmar</b>. Confira antes de confirmar; o que você confirma vale como feito por você.</li>
                    <li>Nada nestes Termos retira direitos que o Código de Defesa do Consumidor garante a você.</li>
                </Ul>
            </Sec>

            <Sec n={11} title="Encerrar a conta">
                <p>
                    Você pode excluir sua conta a qualquer momento pelo painel do perfil. Valores devidos ao iUser (plano Pós-pago) ou entre as partes
                    (repasses, reembolsos) continuam devidos. O iUser pode suspender ou encerrar contas que violem estes Termos, avisando o motivo
                    sempre que possível.
                </p>
            </Sec>

            <Sec n={12} title="Mudanças, lei e foro">
                <Ul>
                    <li>Podemos atualizar estes Termos; mudanças importantes serão avisadas no app antes de valerem. Continuar usando depois disso significa concordar com a nova versão.</li>
                    <li>Vale a lei brasileira. Se você é consumidor, pode buscar seus direitos no foro da sua cidade; nos demais casos, fica eleito o foro de {e.forumCity}.</li>
                </Ul>
            </Sec>
        </LegalDoc>
    )
}
