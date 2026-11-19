// src/modules/delivery-rules/domain.ts — os PRAZOS E LIMITES da operação de entrega que o Admin edita (Admin → Entregas → "Prazos e limites da operação"; 18/11/2026).
// Uma lista só de campos (rótulo, unidade, faixa) usada pela tela e pela rota /api/admin/delivery-rules, e a mesma validação nos dois lados.
// O banco ainda confere tudo (CHECKs de cada tabela; admin_update_delivery_rules, migration 20261130000078). Testado em scripts/test-delivery-rules.mjs.

export type RulesGroup = 'cycle' | 'hold' | 'dues' | 'trust' | 'postpaid'
export type FieldKind = 'int' | 'money' | 'decimal' | 'bool'

export interface RuleField { key: string; label: string; help?: string; kind: FieldKind; unit?: string; min?: number; max?: number; nullable?: boolean }
export interface RuleGroupDef { id: RulesGroup; title: string; desc: string; fields: RuleField[] }

export const RULE_GROUPS: RuleGroupDef[] = [
    {
        id: 'cycle', title: 'Ciclo do pedido', desc: 'Loja que não aceita, entregador que demora e pedido atrasado.',
        fields: [
            { key: 'enabled', label: 'Ligado', kind: 'bool' },
            { key: 'store_accept_warn_min', label: 'Avisar a loja que não aceitou após', kind: 'int', unit: 'min', min: 1, max: 120 },
            { key: 'store_accept_timeout_min', label: 'Cancelar o pedido que a loja não aceitou após', kind: 'int', unit: 'min', min: 2, max: 240 },
            { key: 'driver_idle_min', label: 'Passar adiante o entregador que não saiu após', kind: 'int', unit: 'min', min: 3, max: 240 },
            { key: 'driver_wait_warn_min', label: 'Avisar a loja quando o entregador espera há', kind: 'int', unit: 'min', min: 2, max: 240 },
            { key: 'transit_late_min', label: 'Atraso a caminho: no mínimo', kind: 'int', unit: 'min', min: 5, max: 600 },
            { key: 'transit_late_factor', label: 'Atraso a caminho: vezes o tempo previsto', kind: 'decimal', unit: '×', min: 1, max: 10 },
            { key: 'quit_limit', label: 'Desistências que pausam o entregador', kind: 'int', min: 1, max: 50 },
            { key: 'quit_window_days', label: '… contadas em', kind: 'int', unit: 'dias', min: 1, max: 90 },
            { key: 'quit_block_hours', label: 'Pausa do entregador', kind: 'int', unit: 'h', min: 1, max: 720 },
            { key: 'store_reject_limit', label: 'Recusas da loja (com entregador) que geram aviso', kind: 'int', min: 1, max: 50 },
            { key: 'store_reject_window_days', label: '… contadas em', kind: 'int', unit: 'dias', min: 1, max: 90 },
        ],
    },
    {
        id: 'hold', title: 'Pedido esperando entregador', desc: 'A loja só recebe o pedido de entrega depois que um entregador aceita.',
        fields: [
            { key: 'enabled', label: 'Ligado', kind: 'bool' },
            { key: 'suggest_after_minutes', label: 'Sugerir "Retirar na loja" após', kind: 'int', unit: 'min', min: 1, max: 120 },
            { key: 'timeout_minutes', label: 'Cancelar sem entregador após', kind: 'int', unit: 'min', min: 2, max: 240 },
        ],
    },
    {
        id: 'dues', title: 'Caixa do entregador', desc: 'Dinheiro recebido na porta, maquininha da loja, fretes e contestações.',
        fields: [
            { key: 'cash_max_open', label: 'Dinheiro de lojas que ele pode segurar', kind: 'money', unit: 'R$', min: 1, max: 100000 },
            { key: 'cash_due_hours', label: 'Prazo para repassar o dinheiro (e pagar o frete)', kind: 'int', unit: 'h', min: 1, max: 168 },
            { key: 'machine_due_hours', label: 'Prazo para devolver a maquininha', kind: 'int', unit: 'h', min: 1, max: 48 },
            { key: 'dispute_window_hours', label: 'Prazo do cliente para contestar a entrega', kind: 'int', unit: 'h', min: 1, max: 168 },
            { key: 'debt_due_hours', label: 'Prazo para pagar dívida de contestação', kind: 'int', unit: 'h', min: 1, max: 336 },
            { key: 'strike_limit', label: 'Culpas em contestação que travam o entregador', kind: 'int', min: 1, max: 100 },
            { key: 'strike_days', label: '… contadas em', kind: 'int', unit: 'dias', min: 1, max: 365 },
            { key: 'abuse_limit', label: 'Contestações recusadas que travam o cliente', kind: 'int', min: 1, max: 100 },
            { key: 'abuse_days', label: '… contadas em', kind: 'int', unit: 'dias', min: 1, max: 365 },
        ],
    },
    {
        id: 'trust', title: 'Liberação do dinheiro e da maquininha', desc: 'Entregador novo só leva pedido pago antes; depois, aos poucos.',
        fields: [
            { key: 'enabled', label: 'Ligado', kind: 'bool' },
            { key: 'min_deliveries', label: 'Entregas concluídas para começar', kind: 'int', min: 0, max: 1000 },
            { key: 'min_account_days', label: 'Dias de conta', kind: 'int', unit: 'dias', min: 0, max: 365 },
            { key: 'min_rating', label: 'Nota mínima', kind: 'decimal', min: 1, max: 5 },
            { key: 'min_reviews_for_rating', label: 'Avaliações para a nota valer', kind: 'int', min: 1, max: 100 },
            { key: 'require_pix', label: 'Exigir chave Pix', kind: 'bool' },
            { key: 'require_selfie', label: 'Exigir selfie', kind: 'bool' },
            { key: 'lookback_days', label: 'Olhar o histórico de', kind: 'int', unit: 'dias', min: 1, max: 365 },
            { key: 'starter_per_order', label: 'Iniciante: até por entrega', kind: 'money', unit: 'R$', min: 0, max: 100000 },
            { key: 'starter_open_max', label: 'Iniciante: até com ele ao mesmo tempo', kind: 'money', unit: 'R$', min: 0, max: 100000 },
            { key: 'full_after_deliveries', label: 'Liberado depois de', kind: 'int', unit: 'entregas', min: 0, max: 5000 },
        ],
    },
    {
        id: 'postpaid', title: 'Pós-pago', desc: 'R$ 0,50 por uso: quando trava e o teto do mês.',
        fields: [
            { key: 'debt_limit', label: 'Trava ao dever', kind: 'money', unit: 'R$', min: 1, max: 100000 },
            { key: 'monthly_cap', label: 'Nunca cobrar mais que, no mês', kind: 'money', unit: 'R$', min: 1, max: 100000, nullable: true, help: 'Vazio = sem teto. Hoje é o preço do Pré-pago.' },
        ],
    },
]

export type RulesValues = Record<string, number | boolean | null>

/** Os valores que mudaram (só os campos do grupo); vazio = nada a salvar */
export function rulesDiff(group: RulesGroup, before: RulesValues, after: RulesValues): RulesValues {
    const def = RULE_GROUPS.find((g) => g.id === group)
    const out: RulesValues = {}
    for (const f of def?.fields || []) {
        const a = before[f.key] ?? null, b = after[f.key] ?? null
        if (a !== b && !(typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 1e-9)) out[f.key] = b
    }
    return out
}

/** Erros por campo (vazio = pode salvar). Confere a faixa de cada um e as regras que comparam campos. `values` = o grupo inteiro já com as mudanças. */
export function validateRules(group: RulesGroup, values: RulesValues): Record<string, string> {
    const def = RULE_GROUPS.find((g) => g.id === group)
    if (!def) return { _: 'Grupo inválido' }
    const err: Record<string, string> = {}
    for (const f of def.fields) {
        const v = values[f.key]
        if (f.kind === 'bool') { if (typeof v !== 'boolean') err[f.key] = 'Escolha sim ou não'; continue }
        if (v == null) { if (!f.nullable) err[f.key] = 'Preencha'; continue }
        if (typeof v !== 'number' || !Number.isFinite(v)) { err[f.key] = 'Número inválido'; continue }
        if (f.kind === 'int' && !Number.isInteger(v)) { err[f.key] = 'Use um número inteiro'; continue }
        if (f.min != null && v < f.min) err[f.key] = `Mínimo ${f.min}`
        else if (f.max != null && v > f.max) err[f.key] = `Máximo ${f.max}`
    }
    const n = (k: string) => (typeof values[k] === 'number' ? (values[k] as number) : null)
    if (group === 'cycle' && n('store_accept_warn_min') != null && n('store_accept_timeout_min') != null && n('store_accept_warn_min')! >= n('store_accept_timeout_min')!)
        err.store_accept_warn_min = 'O aviso precisa vir antes do cancelamento'
    if (group === 'hold' && n('suggest_after_minutes') != null && n('timeout_minutes') != null && n('suggest_after_minutes')! >= n('timeout_minutes')!)
        err.suggest_after_minutes = 'A sugestão precisa vir antes do cancelamento'
    if (group === 'trust' && n('full_after_deliveries') != null && n('min_deliveries') != null && n('full_after_deliveries')! < n('min_deliveries')!)
        err.full_after_deliveries = 'Precisa ser pelo menos as entregas para começar'
    return err
}

/** Converte o que veio do formulário (texto) no valor do campo */
export function parseField(f: RuleField, raw: string | boolean): number | boolean | null {
    if (f.kind === 'bool') return !!raw
    const t = String(raw).trim().replace(/\./g, '').replace(',', '.')
    if (t === '') return null
    const v = Number(t)
    return Number.isFinite(v) ? v : NaN
}
