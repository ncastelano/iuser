// lib/asaas.ts
//
// Wrapper server-only pra API da Asaas (assinatura recorrente + PIX).
// Nunca importar isso de um arquivo 'use client' — usa ASAAS_API_KEY, que é
// segredo de servidor (mesma convenção de SUPABASE_SERVICE_ROLE_KEY).

const ASAAS_API_KEY = process.env.ASAAS_API_KEY
const ASAAS_API_BASE_URL = process.env.ASAAS_API_BASE_URL || 'https://sandbox.asaas.com/api/v3'

async function asaasFetch<T>(path: string, init?: RequestInit): Promise<T> {
    if (!ASAAS_API_KEY) throw new Error('ASAAS_API_KEY não configurada')

    const res = await fetch(`${ASAAS_API_BASE_URL}${path}`, {
        ...init,
        headers: {
            'Content-Type': 'application/json',
            access_token: ASAAS_API_KEY,
            ...init?.headers,
        },
    })

    const data = await res.json().catch(() => null)
    if (!res.ok) {
        const message = data?.errors?.[0]?.description || `Asaas ${path} falhou (${res.status})`
        throw Object.assign(new Error(message), { status: res.status })
    }
    return data as T
}

interface AsaasCustomer {
    id: string
    name: string
    email: string | null
    cpfCnpj: string | null
}

// Reaproveita um customer existente pelo cpfCnpj (se informado) antes de
// criar um novo — a Asaas não deduplica automaticamente.
export async function createOrGetCustomer(params: {
    name: string
    email?: string | null
    cpfCnpj?: string | null
    externalReference?: string // profile_id, pra rastrear de volta
}): Promise<AsaasCustomer> {
    if (params.cpfCnpj) {
        const existing = await asaasFetch<{ data: AsaasCustomer[] }>(
            `/customers?cpfCnpj=${encodeURIComponent(params.cpfCnpj)}`
        )
        if (existing.data?.length > 0) return existing.data[0]
    }

    return asaasFetch<AsaasCustomer>('/customers', {
        method: 'POST',
        body: JSON.stringify({
            name: params.name,
            email: params.email || undefined,
            cpfCnpj: params.cpfCnpj || undefined,
            externalReference: params.externalReference,
        }),
    })
}

// Garante que um customer já existente tenha CPF/CNPJ preenchido — precisa
// disso pra criar cobrança de verdade. Sem isso, reaproveitar um customer
// criado antes de a gente coletar o CPF (ex: em testes) trava toda
// assinatura futura desse usuário com o mesmo erro, mesmo já tendo o CPF
// salvo no perfil, porque quem falta o CPF é o registro na Asaas, não a
// chamada de criar assinatura.
export async function ensureCustomerCpfCnpj(customerId: string, cpfCnpj: string): Promise<void> {
    await asaasFetch(`/customers/${customerId}`, {
        method: 'PUT',
        body: JSON.stringify({ cpfCnpj }),
    })
}

interface AsaasSubscription {
    id: string
    customer: string
    status: string
    value: number
    nextDueDate: string
}

export async function createSubscription(params: {
    customerId: string
    value: number
    description: string
    externalReference?: string // subscriptions.id (nossa tabela), pro webhook achar de volta
    cycle?: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUALLY' | 'YEARLY'
}): Promise<AsaasSubscription> {
    // nextDueDate hoje: cobra o primeiro ciclo imediatamente (Asaas gera o
    // primeiro payment já na criação da assinatura).
    const today = new Date().toISOString().split('T')[0]

    // 'UNDEFINED' em vez de 'PIX' fixo: a mesma cobrança aceita tanto PIX
    // (QR embutido, via getPixQrCodeForPayment) quanto Cartão/Boleto (via
    // payment.invoiceUrl, a fatura hospedada pela própria Asaas — nunca
    // tocamos em número de cartão, fica fora do escopo de PCI-compliance).
    // Testado direto na sandbox: os dois convivem na mesma cobrança.
    return asaasFetch<AsaasSubscription>('/subscriptions', {
        method: 'POST',
        body: JSON.stringify({
            customer: params.customerId,
            billingType: 'UNDEFINED',
            cycle: params.cycle || 'MONTHLY',
            value: params.value,
            nextDueDate: today,
            description: params.description,
            externalReference: params.externalReference,
        }),
    })
}

export interface AsaasPayment {
    id: string
    subscription: string | null
    status: string
    value: number
    invoiceUrl: string
}

// Cobrança avulsa (não-recorrente) — usada pra quitar dívida de pós-pago
// (motorista) ou qualquer outra cobrança pontual fora do ciclo de
// assinatura. Diferente de createSubscription, essa cobrança não se repete
// sozinha. externalReference é o jeito do webhook identificar de volta o
// que essa cobrança avulsa está quitando (ex: 'driver_debt:<driver_id>').
export async function createOnePixPayment(params: {
    customerId: string
    value: number
    description: string
    externalReference?: string
}): Promise<AsaasPayment> {
    const today = new Date().toISOString().split('T')[0]
    return asaasFetch<AsaasPayment>('/payments', {
        method: 'POST',
        body: JSON.stringify({
            customer: params.customerId,
            billingType: 'PIX',
            value: params.value,
            dueDate: today,
            description: params.description,
            externalReference: params.externalReference,
        }),
    })
}

// A assinatura não devolve o payment direto na criação — precisa listar os
// pagamentos dela e pegar o primeiro (mais recente, já que acabou de criar).
export async function getFirstPaymentForSubscription(subscriptionId: string): Promise<AsaasPayment | null> {
    const result = await asaasFetch<{ data: AsaasPayment[] }>(
        `/payments?subscription=${encodeURIComponent(subscriptionId)}&limit=1`
    )
    return result.data?.[0] || null
}

interface AsaasPixQrCode {
    encodedImage: string // base64 do QR code, pronto pra <img src="data:image/png;base64,...">
    payload: string // PIX copia-e-cola
    expirationDate: string | null
}

export async function getPixQrCodeForPayment(paymentId: string): Promise<AsaasPixQrCode> {
    return asaasFetch<AsaasPixQrCode>(`/payments/${paymentId}/pixQrCode`)
}

// Cancela a assinatura recorrente na Asaas — usado ao excluir a conta, pra
// não continuar cobrando de quem já não existe mais.
export async function cancelSubscription(subscriptionId: string): Promise<void> {
    try {
        await asaasFetch(`/subscriptions/${subscriptionId}`, { method: 'DELETE' })
    } catch (err: any) {
        // Já não existe na Asaas (cancelada/removida) = objetivo cumprido.
        if (err?.status === 404) return
        throw err
    }
}

export async function getSubscription(subscriptionId: string): Promise<AsaasSubscription> {
    return asaasFetch<AsaasSubscription>(`/subscriptions/${subscriptionId}`)
}

// Muda o valor de uma assinatura Asaas já existente — usado quando o admin
// reajusta o preço de um plano (promoção, aumento etc), pra quem já é
// assinante também passar a pagar o valor novo, em vez de ficar travado no
// valor de quando assinou. updatePendingPayments:true também atualiza uma
// cobrança pendente que já tinha sido gerada (senão ela cobraria o valor
// antigo mesmo depois do reajuste).
export async function updateSubscriptionValue(subscriptionId: string, value: number): Promise<AsaasSubscription> {
    return asaasFetch<AsaasSubscription>(`/subscriptions/${subscriptionId}`, {
        method: 'PUT',
        body: JSON.stringify({ value, updatePendingPayments: true }),
    })
}

export type AsaasPixKeyType = 'CPF' | 'CNPJ' | 'EMAIL' | 'PHONE' | 'EVP'

interface AsaasTransfer {
    id: string
    status: string
    value: number
}

// Saque automático: manda o dinheiro de verdade pra chave PIX da pessoa,
// sem o admin precisar clicar em nada. A Asaas cobra uma taxa fixa por
// transferência enviada (não é a mesma taxa de receber cobrança).
export async function createTransfer(params: {
    value: number
    pixKey: string
    pixKeyType: AsaasPixKeyType
    description?: string
}): Promise<AsaasTransfer> {
    return asaasFetch<AsaasTransfer>('/transfers', {
        method: 'POST',
        body: JSON.stringify({
            value: params.value,
            pixAddressKey: params.pixKey,
            pixAddressKeyType: params.pixKeyType,
            description: params.description,
        }),
    })
}
