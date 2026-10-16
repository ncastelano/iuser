// src/modules/service-requests/domain.ts
//
// Regras puras do pedido de serviço ("Precisa de um profissional?"): o que falta pra poder enviar e como o endereço
// é mostrado. Sem React e sem rede — testável com `npm run test:service-requests`.

export interface ServiceRequestInput {
    /** id do tipo (pintor, eletricista...) ou 'outro' */
    serviceType: string | null
    /** nome escrito pela pessoa quando o tipo é 'outro' */
    customService: string
    address: string
    description: string
    photoCount: number
}

export const MAX_PHOTOS = 20

/** O que ainda falta preencher, na ordem em que a tela pede (vazio = pode enviar). */
export function missingFields(input: ServiceRequestInput): string[] {
    const missing: string[] = []
    if (!input.serviceType || (input.serviceType === 'outro' && !input.customService.trim())) missing.push('serviço')
    if (!input.address.trim()) missing.push('endereço')
    if (!input.description.trim()) missing.push('descrição')
    if (input.photoCount < 1) missing.push('foto')
    return missing
}

/** "Rua A, 12, Centro, Porto Velho - RO" → rua na primeira linha, bairro/cidade na segunda. */
export function splitAddress(address: string): { street: string; area: string } {
    const parts = address.split(',').map((p) => p.trim()).filter(Boolean)
    return { street: parts[0] || '', area: parts.slice(1, 3).join(', ') }
}

/** Só o começo do endereço, cortado (chips de locais recentes). */
export function shortAddress(address: string, max = 28): string {
    const first = address.split(',')[0].trim()
    return first.length > max ? `${first.slice(0, max - 2)}...` : first
}
