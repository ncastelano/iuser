// app/(main)/privacidade/page.tsx
//
// Política de Privacidade (reescrita em 18/11/2026, na revisão antes de comercializar; a de 23/09 não dizia quem é o
// controlador, as bases legais, por quanto tempo os dados ficam, a transferência para fora do Brasil, CPF, cookies nem menores).
// A página também estava fora do IGNORED_ROUTES do proxy e dava 404 em produção. Base para revisão de um advogado.
// Ao mudar o que o app coleta ou com quem compartilha, atualize o texto e a data.
import { LegalDoc, Sec, Ul, LEGAL_ENTITY } from '@/components/legal/LegalDoc'

export const metadata = {
    title: 'Política de Privacidade | iUser',
    description: 'Quais dados o iUser coleta, para quê, com quem compartilha, por quanto tempo guarda e como exercer seus direitos (LGPD).',
}

export default function PrivacidadePage() {
    const e = LEGAL_ENTITY
    return (
        <LegalDoc
            title="Política de Privacidade"
            updated="18 de novembro de 2026"
            intro={<p>
                Esta política explica como o iUser trata os seus dados pessoais, de acordo com a Lei Geral de Proteção de Dados (Lei 13.709/2018, &quot;LGPD&quot;).
                {e.company ? <> O controlador dos dados é <b>{e.company}</b>{e.cnpj ? `, CNPJ ${e.cnpj}` : ''}.</> : ''}
                {' '}O encarregado pelo tratamento de dados{e.dpoName ? ` (${e.dpoName})` : ''} atende pelo e-mail <a href={`mailto:${e.email}`} className="underline">{e.email}</a>.
            </p>}
        >
            <Sec n={1} title="Dados que coletamos">
                <Ul>
                    <li><b>Cadastro:</b> nome, nome de usuário (@), e-mail, telefone, CPF (para evitar contas duplicadas e fraudes) e foto.</li>
                    <li><b>Localização:</b> o endereço que você define e, quando você permite, a localização do aparelho — para mostrar o que está perto, calcular corridas e entregas e acompanhar uma entrega. Motoristas e entregadores em serviço compartilham a posição ao vivo enquanto o modo motorista está ligado.</li>
                    <li><b>Motoristas e entregadores:</b> selfie, dados e fotos do veículo, avaliações e, se cadastrada, a chave Pix para receber.</li>
                    <li><b>Lojas e prestadores:</b> dados da loja, endereço, horários, chave Pix e link de pagamento da loja, produtos, serviços e conteúdos enviados.</li>
                    <li><b>Uso do app:</b> pedidos, corridas, agendamentos, avaliações, publicações, mensagens, buscas, seguidores, denúncias e as declarações de pagamento (&quot;já paguei&quot;, &quot;recebi&quot;).</li>
                    <li><b>Dados técnicos:</b> tipo de aparelho e navegador, endereço IP, registros de acesso e o identificador para notificações (push).</li>
                    <li><b>Pagamentos ao iUser</b> (planos): processados pela Asaas. Não guardamos número de cartão.</li>
                </Ul>
            </Sec>

            <Sec n={2} title="Para que usamos e com qual base legal">
                <Ul>
                    <li><b>Executar o serviço que você pediu</b> (contrato — LGPD art. 7º, V): criar e manter a conta, mostrar sua loja/perfil, levar o pedido até a loja, encontrar um motorista, agendar, enviar avisos do andamento.</li>
                    <li><b>Segurança e prevenção a fraudes</b> (legítimo interesse e proteção ao crédito — art. 7º, IX e X): CPF único, limites de uso, liberação por etapas para entregadores, moderação de conteúdo, investigação de golpes.</li>
                    <li><b>Cumprir a lei</b> (art. 7º, II): guardar registros de acesso, dados fiscais e responder a ordens judiciais.</li>
                    <li><b>Melhorar o iUser</b> (legítimo interesse): estatísticas de uso, sempre que possível sem identificar você.</li>
                    <li><b>Com o seu consentimento</b> (art. 7º, I): localização do aparelho, notificações e aparecer no mapa do Radar. Você pode retirar o consentimento a qualquer momento nas configurações do aparelho ou do app.</li>
                </Ul>
            </Sec>

            <Sec n={3} title="O que as outras pessoas veem">
                <Ul>
                    <li>No seu perfil público: nome, @, foto, bio, publicações, avaliações e, se você escolheu aparecer, só o <b>bairro</b> — nunca o endereço completo.</li>
                    <li>Telefone, CPF, e-mail, endereço completo e chaves Pix de pessoas <b>não são públicos</b>. O endereço de entrega vai só para a loja e o entregador daquele pedido; a chave Pix do motorista, só a quem precisa pagá-lo.</li>
                    <li>Motoristas aparecem no mapa numa posição aproximada; a posição exata só é mostrada a quem tem uma corrida ou entrega com eles, durante ela.</li>
                </Ul>
            </Sec>

            <Sec n={4} title="Com quem compartilhamos">
                <p>Não vendemos seus dados. Compartilhamos só o necessário com:</p>
                <Ul>
                    <li><b>As outras partes da sua transação</b> (loja, cliente, motorista, prestador), para ela acontecer.</li>
                    <li><b>Fornecedores que operam o iUser:</b> Supabase (banco de dados e login), Vercel (hospedagem), Cloudflare (DNS e armazenamento de arquivos), Mapbox (mapas, rotas e busca de endereços), Google Firebase (notificações), Asaas (cobrança dos planos), Meta/WhatsApp (mensagens automáticas, quando a loja usa esse recurso) e Anthropic (a IA do iUser: quando você faz um pedido à IA, o texto do pedido e o que é preciso para atendê-lo — por exemplo, os nomes e preços dos produtos da sua loja — são enviados para ela entender o pedido; a IA não recebe senha, documento nem dados de pagamento, e nada muda sem a sua confirmação). Ao falar em vez de digitar, o ditado é feito pelo seu navegador (no Chrome, pelo serviço de voz do Google); o iUser não grava o áudio.</li>
                    <li><b>Autoridades</b>, quando a lei ou uma ordem judicial exigir.</li>
                </Ul>
                <p>
                    Alguns desses fornecedores guardam dados fora do Brasil (por exemplo, nos Estados Unidos). Essa transferência é feita para executar
                    o serviço que você contratou e com fornecedores que adotam cláusulas e padrões de proteção de dados (LGPD art. 33).
                </p>
            </Sec>

            <Sec n={5} title="Cookies e armazenamento no aparelho">
                <p>
                    Usamos cookies e o armazenamento do navegador para manter você conectado, lembrar preferências (tema, última aba, carrinho),
                    registrar quem convidou você (programa Convidados) e para segurança. Não usamos cookies de publicidade de terceiros.
                </p>
            </Sec>

            <Sec n={6} title="Por quanto tempo guardamos">
                <Ul>
                    <li>Os dados da conta ficam enquanto ela existir. Ao excluir a conta, apagamos ou tornamos anônimos os seus dados, exceto o que a lei manda guardar.</li>
                    <li>Registros de acesso: pelo menos 6 meses (Marco Civil da Internet, art. 15).</li>
                    <li>Pedidos, pagamentos de planos e dados fiscais: pelo prazo da legislação fiscal e para defesa em processos (em geral, até 5 anos).</li>
                    <li>Conteúdo ocultado por moderação pode ser guardado pelo tempo necessário para investigar e responder a autoridades.</li>
                </Ul>
            </Sec>

            <Sec n={7} title="Como protegemos">
                <p>
                    Acesso aos dados controlado no próprio banco (cada pessoa só lê o que pode), conexão sempre cifrada (https), arquivos privados só
                    por links temporários, senhas nunca guardadas em texto e acesso administrativo restrito e registrado. Nenhum sistema é 100% seguro:
                    se acontecer um incidente que possa trazer risco a você, avisaremos você e a ANPD, como manda a lei.
                </p>
            </Sec>

            <Sec n={8} title="Seus direitos">
                <p>Você pode, a qualquer momento (LGPD art. 18):</p>
                <Ul>
                    <li>confirmar se tratamos seus dados e pedir uma cópia;</li>
                    <li>corrigir dados incompletos ou errados (a maioria pelo próprio painel do perfil);</li>
                    <li>pedir a anonimização, o bloqueio ou a exclusão de dados desnecessários;</li>
                    <li>pedir a portabilidade;</li>
                    <li>retirar o consentimento e saber as consequências disso;</li>
                    <li>excluir a conta pelo painel do perfil;</li>
                    <li>reclamar à Autoridade Nacional de Proteção de Dados (ANPD).</li>
                </Ul>
                <p>Para os pedidos que o app não resolve sozinho, escreva para <a href={`mailto:${e.email}`} className="underline">{e.email}</a>. Respondemos em até 15 dias.</p>
            </Sec>

            <Sec n={9} title="Menores de idade">
                <p>O iUser é para maiores de 18 anos. Se soubermos que uma conta é de menor, ela será encerrada e os dados apagados.</p>
            </Sec>

            <Sec n={10} title="Mudanças">
                <p>Podemos atualizar esta política. Quando a mudança for importante, avisaremos no app antes de ela valer.</p>
            </Sec>
        </LegalDoc>
    )
}
