// app/api/admin/expenses/asaas-overview/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/adminAuth'
import { getBalance, listPayments, listTransfers, getCustomer, getPixTransaction } from '@/lib/asaas'
import { getAvatarUrl } from '@/lib/avatar'

// Mapeamento financeiro do Asaas pro painel Financeiro > Asaas: o que está
// na conta Asaas de verdade (externo, via API deles — saldo, cobranças e
// transferências reais, mesmo as feitas direto no dashboard deles), o que
// está no nosso banco (assinaturas + pós-pago) e o que devemos/nos devem
// (carteira + dívida de pós-pago). Os totais agregados por usuário vêm de
// get_asaas_financial_overview() (migration 20261012000000); a atividade
// e os totais de recebido/taxa vêm direto da API da Asaas, porque uma
// cobrança criada manualmente lá (fora do fluxo de compra do app) nunca
// aparece em subscription_payments.
export async function POST(req: Request) {
    const admin = await requireSuperAdmin(req)
    if (!admin) {
        return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const { data, error } = await supabaseAdmin.rpc('get_asaas_financial_overview')
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Saldo da conta Asaas é best-effort: se a chave não estiver configurada
    // ou a chamada falhar, o resto do painel (tudo que vem do nosso banco)
    // continua funcionando normalmente.
    let asaasBalance: number | null = null
    let asaasBalanceError: string | null = null
    try {
        const balance = await getBalance()
        asaasBalance = balance.balance
    } catch (err: any) {
        asaasBalanceError = err.message || 'Erro ao consultar saldo na Asaas'
    }

    const isSandbox = (process.env.ASAAS_API_BASE_URL || 'https://sandbox.asaas.com/api/v3').includes('sandbox')

    // Linha "Asaas" de service_expenses (taxa por transação, notas etc) —
    // mesmo padrão do card do Supabase: custo e mapeamento de uso juntos,
    // num card só, em vez de espalhado pela lista genérica de outros serviços.
    const { data: expenseRow } = await supabaseAdmin
        .from('service_expenses')
        .select('*')
        .eq('service_name', 'Asaas')
        .maybeSingle()

    // Atividade e totais de verdade direto da Asaas — não só o que o nosso
    // banco registrou. Uma cobrança criada manualmente no dashboard deles
    // (fora do fluxo de compra do app, sem subscriptions.id correspondente)
    // nunca aparece em subscription_payments, então olhar só o nosso banco
    // sub-representa o que de fato aconteceu na conta. netValue já vem sem
    // a taxa da Asaas — é o que efetivamente ficou pra plataforma.
    let payments: Awaited<ReturnType<typeof listPayments>> = []
    let transfers: Awaited<ReturnType<typeof listTransfers>> = []
    let asaasActivityError: string | null = null
    try {
        ;[payments, transfers] = await Promise.all([listPayments(20), listTransfers(20)])
    } catch (err: any) {
        asaasActivityError = err.message || 'Erro ao consultar atividade na Asaas'
    }

    const receivedPayments = payments.filter((p) => p.status === 'RECEIVED' || p.status === 'CONFIRMED')
    const receivedGrossTotal = receivedPayments.reduce((sum, p) => sum + Number(p.value), 0)
    const receivedNetTotal = receivedPayments.reduce((sum, p) => sum + Number(p.netValue), 0)
    const asaasFeesTotal = receivedGrossTotal - receivedNetTotal
    const pendingPaymentsTotal = payments.filter((p) => p.status === 'PENDING').reduce((sum, p) => sum + Number(p.value), 0)
    const overduePaymentsTotal = payments.filter((p) => p.status === 'OVERDUE').reduce((sum, p) => sum + Number(p.value), 0)

    // Pra dizer se cada cobrança/transferência da Asaas tem um registro
    // correspondente no nosso banco (comprou pelo app) ou foi feita direto
    // no dashboard deles (ex: assinatura de teste avulsa).
    const subExternalRefs = payments.map((p) => p.externalReference).filter(Boolean) as string[]
    const paymentIds = payments.map((p) => p.id)
    const transferIds = transfers.map((t) => t.id)
    const [subsLookup, postpaidLookup, withdrawalsLookup] = await Promise.all([
        subExternalRefs.length
            ? supabaseAdmin.from('subscriptions').select('id, profiles:user_id(name, avatar_url, profileSlug), plans(name)').in('id', subExternalRefs)
            : Promise.resolve({ data: [] as any[] }),
        paymentIds.length
            ? supabaseAdmin.from('driver_postpaid_charges').select('asaas_payment_id, profiles:driver_id(name, avatar_url, profileSlug)').in('asaas_payment_id', paymentIds)
            : Promise.resolve({ data: [] as any[] }),
        transferIds.length
            ? supabaseAdmin.from('withdrawal_requests').select('asaas_transfer_id, profiles:user_id(name, avatar_url, profileSlug)').in('asaas_transfer_id', transferIds)
            : Promise.resolve({ data: [] as any[] }),
    ])
    const subMap = new Map((subsLookup.data || []).map((s: any) => [s.id, s]))
    const postpaidMap = new Map((postpaidLookup.data || []).map((p: any) => [p.asaas_payment_id, p]))
    const withdrawalMap = new Map((withdrawalsLookup.data || []).map((w: any) => [w.asaas_transfer_id, w]))

    // Quando a cobrança não tem vínculo no nosso banco (ex: assinatura de
    // teste criada direto no dashboard da Asaas), o único jeito de saber
    // quem pagou é perguntar pro customer da própria Asaas.
    const unresolvedCustomerIds = Array.from(new Set(
        payments
            .filter((p) => !(p.externalReference && subMap.has(p.externalReference)) && !postpaidMap.has(p.id))
            .map((p) => p.customer)
            .filter(Boolean)
    ))
    const customerResults = await Promise.allSettled(unresolvedCustomerIds.map((id) => getCustomer(id)))
    const customerNameMap = new Map<string, string>()
    unresolvedCustomerIds.forEach((id, i) => {
        const result = customerResults[i]
        if (result.status === 'fulfilled') customerNameMap.set(id, result.value.name)
    })

    // Cobrança PIX recebida não traz hora no /payments (só data) — e o nome
    // do customer cadastrado pode nem ser o nome de quem pagou de verdade.
    // A transação PIX associada tem os dois: hora exata e o nome da conta
    // de origem (externalAccount) — só busca pra quem foi de fato recebido.
    const pixTransactionIds = payments
        .filter((p) => (p.status === 'RECEIVED' || p.status === 'CONFIRMED') && p.pixTransaction)
        .map((p) => p.pixTransaction as string)
    const pixResults = await Promise.allSettled(pixTransactionIds.map((id) => getPixTransaction(id)))
    const pixMap = new Map<string, Awaited<ReturnType<typeof getPixTransaction>>>()
    pixTransactionIds.forEach((id, i) => {
        const result = pixResults[i]
        if (result.status === 'fulfilled') pixMap.set(id, result.value)
    })

    interface PersonDetail { name: string | null; avatarUrl: string | null; profileSlug: string | null; date: string; linked: boolean }

    // Nome resolvido (via customer/PIX/conta bancária) pode ser de gente que
    // TEM perfil no app mas cuja cobrança não passou pelo fluxo de compra
    // (ex: o próprio admin testando) — sem isso a pessoa aparece sem foto
    // mesmo estando cadastrada. Não dá pra bater nome exato: a Asaas guarda
    // o nome bancário completo ("Natanael Parintintin Castelano"), o perfil
    // guarda o apelido ("Natan Castelano") — por isso compara por palavra
    // (cada palavra de um nome precisa ser prefixo de alguma palavra do
    // outro), não string idêntica.
    const namesAlreadyLinked = new Set<string>()
    ;(subsLookup.data || []).forEach((s: any) => s.profiles?.name && namesAlreadyLinked.add(s.profiles.name))
    ;(postpaidLookup.data || []).forEach((p: any) => p.profiles?.name && namesAlreadyLinked.add(p.profiles.name))
    ;(withdrawalsLookup.data || []).forEach((w: any) => w.profiles?.name && namesAlreadyLinked.add(w.profiles.name))
    const candidateNames = Array.from(new Set([
        ...Array.from(pixMap.values()).map((tx) => tx.externalAccount?.name).filter(Boolean) as string[],
        ...Array.from(customerNameMap.values()),
        ...transfers.map((t) => t.bankAccount?.ownerName).filter(Boolean) as string[],
    ])).filter((n) => !namesAlreadyLinked.has(n))

    const normalizeWords = (name: string) =>
        name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/\s+/).filter(Boolean)
    const namesLooselyMatch = (a: string, b: string) => {
        const wordsA = normalizeWords(a)
        const wordsB = normalizeWords(b)
        const [shorter, longer] = wordsA.length <= wordsB.length ? [wordsA, wordsB] : [wordsB, wordsA]
        return shorter.length > 0 && shorter.every((w) => longer.some((l) => l.startsWith(w) || w.startsWith(l)))
    }

    const { data: allNamedProfiles } = candidateNames.length
        ? await supabaseAdmin.from('profiles').select('name, avatar_url, profileSlug').not('name', 'is', null).limit(1000)
        : { data: [] as any[] }
    const profileByName = new Map<string, any>()
    for (const candidate of candidateNames) {
        const match = (allNamedProfiles || []).find((p: any) => namesLooselyMatch(candidate, p.name))
        if (match) profileByName.set(candidate, match)
    }

    const resolvePayerDetails = (p: (typeof payments)[number]): PersonDetail => {
        const sub = p.externalReference ? subMap.get(p.externalReference) : null
        const postpaid = postpaidMap.get(p.id)
        const pixTx = p.pixTransaction ? pixMap.get(p.pixTransaction) : null
        const name = (sub as any)?.profiles?.name || (postpaid as any)?.profiles?.name || pixTx?.externalAccount?.name || customerNameMap.get(p.customer) || null
        const profile = (sub as any)?.profiles || (postpaid as any)?.profiles || (name ? profileByName.get(name) : null)
        return {
            name,
            avatarUrl: profile?.avatar_url ? getAvatarUrl(supabaseAdmin, profile.avatar_url) || null : null,
            profileSlug: profile?.profileSlug || null,
            date: pixTx?.dateCreated || p.dateCreated,
            linked: !!(sub || postpaid),
        }
    }
    const resolveTransferDetails = (t: (typeof transfers)[number]): PersonDetail => {
        const wd = withdrawalMap.get(t.id)
        const name = (wd as any)?.profiles?.name || t.bankAccount?.ownerName || null
        const profile = (wd as any)?.profiles || (name ? profileByName.get(name) : null)
        return {
            name,
            avatarUrl: profile?.avatar_url ? getAvatarUrl(supabaseAdmin, profile.avatar_url) || null : null,
            profileSlug: profile?.profileSlug || null,
            date: t.effectiveDate || t.dateCreated,
            linked: !!wd,
        }
    }

    // Pra onde foi o líquido (receivedNetTotal): quanto foi repasse de
    // comissão (transferência vinculada a um withdrawal_requests nosso,
    // pago pro indicador) x quanto foi retirada geral da conta (qualquer
    // outra transferência, ex: o dono tirando saldo pra si) x quanto ainda
    // sobrou disponível. Só conta transferência DONE — uma que falhou ou
    // ainda está processando não tirou dinheiro de verdade da conta.
    const doneTransfers = transfers.filter((t) => t.status === 'DONE')
    const transfersOutTotal = doneTransfers.reduce((sum, t) => sum + Number(t.value), 0)
    const commissionTransfersTotal = doneTransfers
        .filter((t) => withdrawalMap.has(t.id))
        .reduce((sum, t) => sum + Number(t.value), 0)
    const otherTransfersTotal = transfersOutTotal - commissionTransfersTotal
    // Não é lucro parado na conta — o saldo real (asaasBalance) é R$0, não
    // essa diferença. É taxa/custo da Asaas que não aparece no netValue de
    // cada cobrança nem no transferFee de cada saque (ex: mensalidade da
    // conta, taxa adicional de recebimento) — dinheiro que saiu pra Asaas,
    // não pra iUser nem pra quem indicou. Por isso conta como custo, não
    // como lucro ainda não repassado.
    const unexplainedTotal = receivedNetTotal - transfersOutTotal
    // Lucro real da plataforma: só o que de fato foi sacado pelo dono do
    // iUser (outras retiradas, fora do fluxo de comissão) — comissão nunca
    // foi dinheiro da iUser, e a diferença não explicada é custo de Asaas,
    // não lucro parado. Não soma unexplainedTotal aqui.
    const platformProfitTotal = otherTransfersTotal
    // Total pago à Asaas: a taxa já descontada em cada cobrança (asaasFeesTotal)
    // + essa diferença não explicada (presumivelmente outra taxa/custo deles).
    const totalAsaasCost = asaasFeesTotal + unexplainedTotal

    const activity = [
        ...payments.map((p) => {
            const sub = p.externalReference ? subMap.get(p.externalReference) : null
            const details = resolvePayerDetails(p)
            return {
                kind: 'payment' as const,
                status: p.status,
                date: p.dateCreated,
                value: Number(p.value),
                netValue: Number(p.netValue),
                personName: details.name,
                detail: (sub as any)?.plans?.name || p.description || null,
                linked: details.linked,
                asaasId: p.id,
            }
        }),
        ...transfers.map((t) => {
            const details = resolveTransferDetails(t)
            return {
                kind: 'transfer' as const,
                status: t.status,
                date: t.dateCreated,
                value: Number(t.value),
                netValue: Number(t.netValue),
                personName: details.name,
                detail: t.description,
                linked: details.linked,
                asaasId: t.id,
            }
        }),
    ]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 20)

    // Detalhe por transação (não agregado) "quem pagou" e "quem sacou" —
    // cada linha é um pagamento/transferência de verdade, com nome, foto
    // (quando é gente cadastrada no app), link pro perfil, hora exata
    // (quando a Asaas fornece) e a taxa descontada nessa transação
    // específica, pra dar pra buscar e entender caso a caso em vez de só
    // um total por pessoa.
    const toPersonRow = (details: PersonDetail, value: number, netValue: number) => ({
        name: details.name || 'Sem nome identificado',
        avatarUrl: details.avatarUrl,
        profileSlug: details.profileSlug,
        linked: details.linked,
        date: details.date,
        value,
        netValue,
        fee: value - netValue,
    })
    const payers = receivedPayments
        .map((p) => toPersonRow(resolvePayerDetails(p), Number(p.value), Number(p.netValue)))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    const commissionWithdrawers = doneTransfers
        .filter((t) => withdrawalMap.has(t.id))
        .map((t) => toPersonRow(resolveTransferDetails(t), Number(t.value), Number(t.netValue)))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    const otherWithdrawers = doneTransfers
        .filter((t) => !withdrawalMap.has(t.id))
        .map((t) => toPersonRow(resolveTransferDetails(t), Number(t.value), Number(t.netValue)))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    return NextResponse.json({
        ...data,
        asaasBalance,
        asaasBalanceError,
        isSandbox,
        expense: expenseRow || null,
        receivedGrossTotal,
        receivedNetTotal,
        asaasFeesTotal,
        pendingPaymentsTotal,
        overduePaymentsTotal,
        transfersOutTotal,
        commissionTransfersTotal,
        otherTransfersTotal,
        unexplainedTotal,
        platformProfitTotal,
        totalAsaasCost,
        payers,
        commissionWithdrawers,
        otherWithdrawers,
        asaasActivityError,
        activity,
    })
}
