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
        throw new Error(message)
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
}): Promise<AsaasSubscription> {
    // nextDueDate hoje: cobra o primeiro ciclo imediatamente (Asaas gera o
    // primeiro payment já na criação da assinatura).
    const today = new Date().toISOString().split('T')[0]

    return asaasFetch<AsaasSubscription>('/subscriptions', {
        method: 'POST',
        body: JSON.stringify({
            customer: params.customerId,
            billingType: 'PIX',
            cycle: 'MONTHLY',
            value: params.value,
            nextDueDate: today,
            description: params.description,
            externalReference: params.externalReference,
        }),
    })
}

interface AsaasPayment {
    id: string
    subscription: string | null
    status: string
    value: number
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

export async function getSubscription(subscriptionId: string): Promise<AsaasSubscription> {
    return asaasFetch<AsaasSubscription>(`/subscriptions/${subscriptionId}`)
}
