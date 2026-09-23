// app/(main)/privacidade/page.tsx

export const metadata = {
    title: 'Política de Privacidade | iUser',
    description: 'Como o iUser coleta, usa e protege seus dados.',
}

export default function PrivacidadePage() {
    return (
        <main className="max-w-3xl mx-auto px-5 py-12 text-neutral-800">
            <h1 className="text-2xl font-black mb-2">Política de Privacidade</h1>
            <p className="text-sm text-neutral-500 mb-8">Última atualização: 23 de setembro de 2026</p>

            <section className="mb-6">
                <p>
                    O iUser (&quot;nós&quot;) é uma plataforma que conecta usuários, lojas, prestadores de
                    serviço e motoristas parceiros. Esta política explica quais dados coletamos, para que
                    usamos e como você pode exercer seus direitos, em conformidade com a Lei Geral de
                    Proteção de Dados (LGPD).
                </p>
            </section>

            <section className="mb-6">
                <h2 className="text-lg font-bold mb-2">1. Dados que coletamos</h2>
                <ul className="list-disc pl-5 space-y-1">
                    <li>Dados de cadastro: nome, e-mail, telefone e foto de perfil.</li>
                    <li>Dados de localização, quando você usa corridas, entregas ou busca por lojas próximas.</li>
                    <li>Dados de pagamento e cobrança, processados por parceiros como Asaas (não armazenamos números completos de cartão).</li>
                    <li>Mensagens trocadas com lojas via WhatsApp, quando você usa o atendimento automático de uma loja parceira (WhatsApp Business Platform / Meta Cloud API).</li>
                    <li>Dados de uso do app: pedidos, avaliações, publicações e histórico de navegação dentro da plataforma.</li>
                </ul>
            </section>

            <section className="mb-6">
                <h2 className="text-lg font-bold mb-2">2. Como usamos seus dados</h2>
                <ul className="list-disc pl-5 space-y-1">
                    <li>Viabilizar pedidos, corridas, agendamentos e comunicação entre usuários, lojas e prestadores.</li>
                    <li>Processar pagamentos e cobranças dos planos e serviços da plataforma.</li>
                    <li>Enviar notificações sobre o andamento de pedidos e corridas (push, e-mail ou WhatsApp).</li>
                    <li>Melhorar a segurança, prevenir fraudes e cumprir obrigações legais.</li>
                </ul>
            </section>

            <section className="mb-6">
                <h2 className="text-lg font-bold mb-2">3. Compartilhamento com terceiros</h2>
                <p>
                    Utilizamos provedores de infraestrutura para operar a plataforma, incluindo Supabase
                    (banco de dados e autenticação), Mapbox (mapas e geolocalização), Asaas (pagamentos) e
                    Meta / WhatsApp Business Platform (mensagens automáticas de lojas que ativam esse
                    recurso). Esses provedores processam dados apenas para viabilizar o funcionamento do
                    iUser, sob seus próprios termos de proteção de dados.
                </p>
            </section>

            <section className="mb-6">
                <h2 className="text-lg font-bold mb-2">4. Seus direitos</h2>
                <p>
                    Você pode solicitar acesso, correção ou exclusão dos seus dados, bem como retirar
                    consentimentos, entrando em contato pelo e-mail abaixo. Contas e seus dados podem ser
                    excluídos diretamente pelas configurações do perfil no app.
                </p>
            </section>

            <section className="mb-6">
                <h2 className="text-lg font-bold mb-2">5. Contato</h2>
                <p>
                    Dúvidas sobre esta política podem ser enviadas para{' '}
                    <a href="mailto:contato@iuser.com.br" className="text-blue-600 underline">
                        contato@iuser.com.br
                    </a>
                    .
                </p>
            </section>
        </main>
    )
}
