// src/modules/delivery-settings/domain.ts
//
// Configurações administrativas globais da entrega iUser (tabela delivery_dispatch_settings): o que cada campo é,
// em que grupo aparece na tela e a validação de coerência. Regra pura (sem React, sem banco): a MESMA validação roda na
// rota do servidor e na tela do admin; o banco ainda tem constraints equivalentes como última barreira.
//
// Os nomes técnicos (chaves) são os do banco/API; a interface usa os rótulos em português daqui.

export type SearchStrategy = 'EXPANDIR_RAIO_PRIMEIRO' | 'AUMENTAR_PRECO_PRIMEIRO' | 'RAIO_E_PRECO_SIMULTANEAMENTE'

export interface DeliverySettings {
    // precificação (a tarifa base/km/extras fica em platform_tariffs)
    min_freight: number
    freight_rounding_step: number
    freight_rounding_mode: 'NEAREST' | 'UP'
    max_freight: number
    platform_fee_percent: number
    // busca
    initial_radius_km: number
    max_radius_km: number
    radius_step_km: number
    retry_interval_minutes: number
    offer_duration_seconds: number
    max_rounds: number
    max_search_minutes: number
    // aumento do frete
    auto_increase_enabled: boolean
    increase_kind: 'fixed' | 'percent'
    increase_value: number
    max_price_adjustments: number
    price_adjust_interval_minutes: number
    auto_increase_cap_amount: number | null
    auto_increase_cap_percent: number | null
    // autorização do cliente
    customer_authorization_timeout_minutes: number
    // estratégia
    search_strategy: SearchStrategy
    // reserva
    reservation_timeout_minutes: number
    reservation_expiry_action: 'RELEASE_AND_SEARCH_AGAIN' | 'CANCEL_DELIVERY'
    // contraproposta
    driver_counter_enabled: boolean
    driver_counter_max_amount: number | null
    driver_counter_max_percent_over_offer: number
    driver_counter_max_per_ride: number
    // cancelamentos
    cancel_customer_during_search: boolean
    cancel_customer_during_reservation: boolean
    cancel_driver_after_reservation: boolean
    cancel_after_receipt_policy: 'BLOCKED' | 'ADMIN_REVIEW' | 'ALLOWED_WITH_OBLIGATION'
    cancel_reason_required: boolean
    admin_review_after_payment: boolean
    admin_review_after_pickup: boolean
    admin_review_payment_dispute: boolean
    // pendências motorista -> loja
    block_driver_open_obligation: boolean
    obligation_block_min_amount: number
    obligation_unblock_on_settlement: boolean
    obligation_unblock_needs_admin: boolean
    // ativação futura (não liga nesta etapa)
    new_delivery_flow_enabled: boolean
}

export type SettingKey = keyof DeliverySettings

export type FieldKind = 'money' | 'percent' | 'km' | 'minutes' | 'seconds' | 'count' | 'bool' | 'select'

export interface FieldDef {
    key: SettingKey
    group: GroupId
    label: string
    hint?: string
    kind: FieldKind
    nullable?: boolean            // vazio = "sem limite próprio"
    min?: number
    max?: number
    options?: { value: string; label: string }[]
    step?: number
}

export type GroupId =
    | 'precificacao' | 'busca' | 'aumento' | 'autorizacao' | 'estrategia' | 'reserva'
    | 'contraproposta' | 'cancelamentos' | 'pendencias' | 'ativacao'

export const GROUPS: { id: GroupId; title: string; description: string }[] = [
    { id: 'precificacao', title: 'Precificação', description: 'Limites e arredondamento do frete. A tarifa base e o valor por km ficam na aba Tarifas.' },
    { id: 'busca', title: 'Busca de entregadores', description: 'Até onde e por quanto tempo procurar um motorista.' },
    { id: 'aumento', title: 'Aumento do frete', description: 'Como o frete sobe sozinho enquanto ninguém aceita.' },
    { id: 'autorizacao', title: 'Autorização do cliente', description: 'Quanto tempo o cliente tem para autorizar um aumento acima do limite automático.' },
    { id: 'estrategia', title: 'Estratégia da busca', description: 'O que vem primeiro: ampliar a distância ou subir o valor.' },
    { id: 'reserva', title: 'Reserva do motorista', description: 'Quanto tempo o motorista fica reservado esperando o cliente finalizar.' },
    { id: 'contraproposta', title: 'Contraproposta do motorista', description: '“Minha tarifa” como proposta de valor, com limites. O motorista nunca muda o preço sozinho.' },
    { id: 'cancelamentos', title: 'Cancelamentos', description: 'Quando cada pessoa pode cancelar e quando o administrador precisa analisar.' },
    { id: 'pendencias', title: 'Pendências e bloqueios', description: 'Consequência de o motorista ficar devendo à loja. Não é a dívida com o iUser.' },
    { id: 'ativacao', title: 'Novo fluxo de entrega', description: 'Ativação do novo fluxo. Ainda em preparação: não pode ser ligado.' },
]

const yesNo = undefined

export const FIELDS: FieldDef[] = [
    // precificação
    { key: 'min_freight', group: 'precificacao', label: 'Valor mínimo do frete', hint: 'Nenhuma entrega custa menos que isso.', kind: 'money', min: 0 },
    { key: 'max_freight', group: 'precificacao', label: 'Teto máximo do frete', hint: 'Nenhum reajuste ou proposta passa desse valor.', kind: 'money', min: 1, max: 10000 },
    { key: 'freight_rounding_step', group: 'precificacao', label: 'Arredondar o frete de', kind: 'select', options: [
        { value: '0.01', label: 'R$ 0,01 (sem arredondar)' }, { value: '0.05', label: 'R$ 0,05' }, { value: '0.1', label: 'R$ 0,10' },
        { value: '0.25', label: 'R$ 0,25' }, { value: '0.5', label: 'R$ 0,50' }, { value: '1', label: 'R$ 1,00' }] },
    { key: 'freight_rounding_mode', group: 'precificacao', label: 'Sentido do arredondamento', kind: 'select', options: [
        { value: 'NEAREST', label: 'Para o mais próximo' }, { value: 'UP', label: 'Sempre para cima' }] },
    { key: 'platform_fee_percent', group: 'precificacao', label: 'Taxa da plataforma sobre o frete', hint: 'Contabilizada à parte; não reduz o frete do motorista nesta etapa.', kind: 'percent', min: 0, max: 100 },
    // busca
    { key: 'initial_radius_km', group: 'busca', label: 'Raio inicial', hint: 'Distância da loja em que a busca começa.', kind: 'km', min: 0.5, max: 200 },
    { key: 'max_radius_km', group: 'busca', label: 'Raio máximo', hint: 'A busca nunca passa dessa distância.', kind: 'km', min: 0.5, max: 200 },
    { key: 'radius_step_km', group: 'busca', label: 'Aumento do raio a cada rodada', kind: 'km', min: 0.1, max: 200 },
    { key: 'retry_interval_minutes', group: 'busca', label: 'Tempo de cada rodada', hint: 'Depois disso o raio é ampliado.', kind: 'minutes', min: 1, max: 240 },
    { key: 'offer_duration_seconds', group: 'busca', label: 'Tempo que cada oferta fica aberta', hint: 'Não pode ser maior que a rodada.', kind: 'seconds', min: 10, max: 3600 },
    { key: 'max_rounds', group: 'busca', label: 'Número máximo de rodadas', kind: 'count', min: 1, max: 50 },
    { key: 'max_search_minutes', group: 'busca', label: 'Tempo total máximo de busca', hint: 'Depois disso a entrega fica sem entregador.', kind: 'minutes', min: 1, max: 720 },
    // aumento
    { key: 'auto_increase_enabled', group: 'aumento', label: 'Aumentar o frete automaticamente', kind: 'bool' },
    { key: 'increase_kind', group: 'aumento', label: 'Como aumentar', kind: 'select', options: [{ value: 'fixed', label: 'Valor fixo (R$)' }, { value: 'percent', label: 'Percentual (%)' }] },
    { key: 'increase_value', group: 'aumento', label: 'Valor de cada aumento', hint: 'Em R$ se for valor fixo, em % se for percentual.', kind: 'money', min: 0, max: 10000 },
    { key: 'max_price_adjustments', group: 'aumento', label: 'Número máximo de reajustes', kind: 'count', min: 0, max: 50 },
    { key: 'price_adjust_interval_minutes', group: 'aumento', label: 'Intervalo entre reajustes', kind: 'minutes', min: 1, max: 240 },
    { key: 'auto_increase_cap_amount', group: 'aumento', label: 'Limite automático em R$', hint: 'Quanto o frete pode subir sozinho. Vazio = sem limite em R$.', kind: 'money', nullable: true, min: 0 },
    { key: 'auto_increase_cap_percent', group: 'aumento', label: 'Limite automático em %', hint: 'Sobre a estimativa. Vazio = sem limite em %.', kind: 'percent', nullable: true, min: 0, max: 200 },
    // autorização
    { key: 'customer_authorization_timeout_minutes', group: 'autorizacao', label: 'Tempo para o cliente responder', hint: 'Passando do limite automático, o cliente decide se continua procurando.', kind: 'minutes', min: 1, max: 240 },
    // estratégia
    { key: 'search_strategy', group: 'estrategia', label: 'Ordem da busca', kind: 'select', options: [
        { value: 'EXPANDIR_RAIO_PRIMEIRO', label: 'Ampliar a distância primeiro, depois subir o valor' },
        { value: 'AUMENTAR_PRECO_PRIMEIRO', label: 'Subir o valor primeiro, depois ampliar a distância' },
        { value: 'RAIO_E_PRECO_SIMULTANEAMENTE', label: 'Ampliar e subir o valor juntos a cada rodada' }] },
    // reserva
    { key: 'reservation_timeout_minutes', group: 'reserva', label: 'Tempo da reserva', hint: 'Quanto o motorista espera o cliente finalizar.', kind: 'minutes', min: 1, max: 60 },
    { key: 'reservation_expiry_action', group: 'reserva', label: 'Se o tempo acabar', kind: 'select', options: [
        { value: 'RELEASE_AND_SEARCH_AGAIN', label: 'Liberar o motorista e procurar outro' }, { value: 'CANCEL_DELIVERY', label: 'Cancelar a entrega' }] },
    // contraproposta
    { key: 'driver_counter_enabled', group: 'contraproposta', label: 'Permitir contraproposta do motorista', kind: 'bool' },
    { key: 'driver_counter_max_amount', group: 'contraproposta', label: 'Valor máximo da contraproposta', hint: 'Vazio = vale o teto máximo do frete.', kind: 'money', nullable: true, min: 0.01 },
    { key: 'driver_counter_max_percent_over_offer', group: 'contraproposta', label: 'Quanto acima da oferta', hint: 'Percentual máximo sobre a oferta atual.', kind: 'percent', min: 0, max: 200 },
    { key: 'driver_counter_max_per_ride', group: 'contraproposta', label: 'Contrapropostas por entrega', kind: 'count', min: 1, max: 20 },
    // cancelamentos
    { key: 'cancel_customer_during_search', group: 'cancelamentos', label: 'Cliente pode cancelar durante a busca', kind: 'bool' },
    { key: 'cancel_customer_during_reservation', group: 'cancelamentos', label: 'Cliente pode cancelar durante a reserva', kind: 'bool' },
    { key: 'cancel_driver_after_reservation', group: 'cancelamentos', label: 'Motorista pode cancelar depois da reserva', kind: 'bool' },
    { key: 'cancel_after_receipt_policy', group: 'cancelamentos', label: 'Cancelar depois de o motorista confirmar o recebimento', kind: 'select', options: [
        { value: 'BLOCKED', label: 'Não permitir' }, { value: 'ADMIN_REVIEW', label: 'Permitir, mas o administrador analisa' }, { value: 'ALLOWED_WITH_OBLIGATION', label: 'Permitir e registrar o que o motorista deve à loja' }] },
    { key: 'cancel_reason_required', group: 'cancelamentos', label: 'Exigir o motivo do cancelamento', kind: 'bool' },
    { key: 'admin_review_after_payment', group: 'cancelamentos', label: 'Analisar cancelamento depois do pagamento', kind: 'bool' },
    { key: 'admin_review_after_pickup', group: 'cancelamentos', label: 'Analisar cancelamento depois da retirada', kind: 'bool' },
    { key: 'admin_review_payment_dispute', group: 'cancelamentos', label: 'Analisar quando houver divergência de pagamento', kind: 'bool' },
    // pendências
    { key: 'block_driver_open_obligation', group: 'pendencias', label: 'Bloquear motorista que deve à loja', kind: 'bool' },
    { key: 'obligation_block_min_amount', group: 'pendencias', label: 'Bloquear só a partir de', hint: 'R$ 0 = qualquer valor em aberto.', kind: 'money', min: 0 },
    { key: 'obligation_unblock_on_settlement', group: 'pendencias', label: 'Desbloquear quando regularizar', kind: 'bool' },
    { key: 'obligation_unblock_needs_admin', group: 'pendencias', label: 'Desbloqueio só com decisão do administrador', kind: 'bool' },
    // ativação
    { key: 'new_delivery_flow_enabled', group: 'ativacao', label: 'Ativar o novo fluxo de entrega', hint: 'Em preparação: ainda não pode ser ligado.', kind: 'bool' },
]

export const FIELD_BY_KEY = Object.fromEntries(FIELDS.map((f) => [f.key, f])) as Record<SettingKey, FieldDef>
void yesNo

export type ValidationResult =
    | { ok: true; values: DeliverySettings; errors: Record<string, never> }
    | { ok: false; values: null; errors: Partial<Record<SettingKey, string>> }

const STRATEGIES: SearchStrategy[] = ['EXPANDIR_RAIO_PRIMEIRO', 'AUMENTAR_PRECO_PRIMEIRO', 'RAIO_E_PRECO_SIMULTANEAMENTE']
const ROUNDING_STEPS = [0.01, 0.05, 0.1, 0.25, 0.5, 1]

const toNumber = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null
    const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
    return Number.isFinite(n) ? n : NaN
}

// Valida e normaliza. `input` precisa trazer TODAS as chaves editáveis (a tela manda o formulário inteiro).
export function validateDeliverySettings(input: Record<string, unknown>): ValidationResult {
    const errors: Partial<Record<SettingKey, string>> = {}
    const out: Record<string, unknown> = {}

    for (const f of FIELDS) {
        const raw = input[f.key]
        if (f.kind === 'bool') {
            if (typeof raw !== 'boolean') { errors[f.key] = 'Valor inválido.'; continue }
            out[f.key] = raw
            continue
        }
        if (f.kind === 'select') {
            const s = String(raw)
            const allowed = f.options!.map((o) => o.value)
            // o passo de arredondamento chega como número (0.1) ou texto ("0.10")
            const ok = f.key === 'freight_rounding_step'
                ? ROUNDING_STEPS.includes(Number(raw))
                : allowed.includes(s)
            if (!ok) { errors[f.key] = 'Escolha uma opção da lista.'; continue }
            out[f.key] = f.key === 'freight_rounding_step' ? Number(raw) : s
            continue
        }
        const n = toNumber(raw)
        if (n === null) {
            if (f.nullable) { out[f.key] = null; continue }
            errors[f.key] = 'Informe um valor.'
            continue
        }
        if (Number.isNaN(n)) { errors[f.key] = 'Informe um número válido.'; continue }
        if (n < 0) { errors[f.key] = 'Não pode ser negativo.'; continue }
        if (f.min !== undefined && n < f.min) { errors[f.key] = `Mínimo: ${f.min}.`; continue }
        if (f.max !== undefined && n > f.max) { errors[f.key] = `Máximo: ${f.max}.`; continue }
        if ((f.kind === 'count' || f.kind === 'minutes' || f.kind === 'seconds') && !Number.isInteger(n)) { errors[f.key] = 'Use um número inteiro.'; continue }
        out[f.key] = f.kind === 'money' || f.kind === 'percent' || f.kind === 'km' ? Math.round(n * 100) / 100 : n
    }
    if (Object.keys(errors).length > 0) return { ok: false, values: null, errors }

    const v = out as unknown as DeliverySettings

    if (!STRATEGIES.includes(v.search_strategy)) errors.search_strategy = 'Estratégia inexistente.'
    if (v.max_radius_km < v.initial_radius_km) errors.max_radius_km = 'O raio máximo não pode ser menor que o raio inicial.'
    if (v.max_freight < v.min_freight) errors.max_freight = 'O teto não pode ser menor que o valor mínimo.'
    if (v.offer_duration_seconds > v.retry_interval_minutes * 60) errors.offer_duration_seconds = 'A oferta não pode durar mais que a rodada.'
    if (v.max_search_minutes < v.retry_interval_minutes) errors.max_search_minutes = 'O tempo total precisa caber pelo menos uma rodada.'
    if (v.increase_kind === 'percent' && v.increase_value > 100) errors.increase_value = 'Aumento percentual acima de 100% não faz sentido.'
    if (v.increase_kind === 'fixed' && v.increase_value > v.max_freight) errors.increase_value = 'O aumento não pode ser maior que o teto do frete.'
    if (v.auto_increase_enabled && v.max_price_adjustments < 1) errors.max_price_adjustments = 'Com o aumento automático ligado, permita pelo menos 1 reajuste.'
    if (v.auto_increase_cap_amount !== null && v.auto_increase_cap_amount > v.max_freight - v.min_freight) {
        errors.auto_increase_cap_amount = 'O limite automático não pode passar do teto do frete.'
    }
    if (v.driver_counter_max_amount !== null && v.driver_counter_max_amount > v.max_freight) {
        errors.driver_counter_max_amount = 'A contraproposta não pode passar do teto do frete.'
    }
    if (v.new_delivery_flow_enabled) errors.new_delivery_flow_enabled = 'O novo fluxo ainda não pode ser ligado.'

    if (Object.keys(errors).length > 0) return { ok: false, values: null, errors }
    return { ok: true, values: v, errors: {} as Record<string, never> }
}

// Texto curto de um valor para o histórico de alterações
export function formatSettingValue(key: string, value: unknown): string {
    const f = (FIELD_BY_KEY as Record<string, FieldDef | undefined>)[key]
    if (value === null || value === undefined) return 'sem limite'
    if (!f) return String(value)
    if (f.kind === 'bool') return value ? 'ligado' : 'desligado'
    if (f.kind === 'select') return f.options?.find((o) => Number(o.value) === Number(value) || o.value === String(value))?.label ?? String(value)
    const n = Number(value)
    if (f.kind === 'money') return `R$ ${n.toFixed(2).replace('.', ',')}`
    if (f.kind === 'percent') return `${n}%`
    if (f.kind === 'km') return `${n} km`
    if (f.kind === 'minutes') return `${n} min`
    if (f.kind === 'seconds') return `${n} s`
    return String(n)
}

export function labelOfSetting(key: string): string {
    return (FIELD_BY_KEY as Record<string, FieldDef | undefined>)[key]?.label ?? key
}
