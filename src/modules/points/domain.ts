// src/modules/points/domain.ts — regras puras da PONTUAÇÃO (Placar do perfil e painel do admin). Sem React nem rede;
// testado em scripts/test-points.mjs (npm run test:points). A fonte da verdade dos pontos é o BANCO (migration 20261130000051):
// aqui só ficam nomes, validação de entrada e a conta do bônus de diversidade (espelho da do banco, para o admin simular).

export type PointsArea = 'pessoa' | 'lojas' | 'servicos' | 'produtos' | 'digitais' | 'imoveis' | 'motoristas'
export const POINTS_AREAS: PointsArea[] = ['pessoa', 'lojas', 'servicos', 'produtos', 'digitais', 'imoveis', 'motoristas']
/** as áreas que têm sinais (pesos sobre números do banco); "pessoa" é feita de eventos */
export const SIGNAL_AREAS = POINTS_AREAS.filter((a) => a !== 'pessoa') as Exclude<PointsArea, 'pessoa'>[]

export const AREA_INFO: Record<PointsArea, { label: string; color: string; hint: string }> = {
    pessoa:     { label: 'Pessoa',     color: '#8b5cf6', hint: 'Seguir, publicar, convidar, comprar, avaliar' },
    lojas:      { label: 'Lojas',      color: '#f97316', hint: 'Vendas, clientes, notas e seguidores das suas lojas' },
    servicos:   { label: 'Serviços',   color: '#0d9488', hint: 'Serviços feitos e notas' },
    produtos:   { label: 'Produtos',   color: '#ef4444', hint: 'Produtos vendidos e avaliados' },
    digitais:   { label: 'Digitais',   color: '#7c3aed', hint: 'Cursos, músicas e programas' },
    imoveis:    { label: 'Imóveis',    color: '#2563eb', hint: 'Visitas feitas aos seus imóveis' },
    motoristas: { label: 'Motorista',  color: '#16a34a', hint: 'Corridas, entregas e notas' },
}

export interface Scoreboard {
    areas: Record<PointsArea, number>
    /** soma das áreas (nunca negativa) */
    raw: number
    /** bônus de diversidade (0.2 = +20%) */
    bonusPct: number
    total: number
    /** o que vale hoje no ranking público (livro-caixa ou total, conforme a chave do admin) */
    rankingPoints: number
    useTotal: boolean
}

const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0 }

/** Resposta de get_profile_scoreboard → Placar. Resposta vazia ou sem áreas = null (a tela esconde o bloco). */
export function scoreboardFromRow(r: any): Scoreboard | null {
    if (!r || typeof r !== 'object' || !r.areas || typeof r.areas !== 'object') return null
    const areas = Object.fromEntries(POINTS_AREAS.map((a) => [a, Math.round(num(r.areas[a]))])) as Record<PointsArea, number>
    return { areas, raw: Math.max(0, Math.round(num(r.raw))), bonusPct: Math.max(0, num(r.bonus_pct)), total: Math.max(0, Math.round(num(r.total))), rankingPoints: Math.max(0, Math.round(num(r.ranking_points))), useTotal: !!r.use_total }
}

/** Áreas que renderam algo, da maior para a menor, com a parte de cada uma (0..1) no total das positivas */
export function areaShares(areas: Record<PointsArea, number>): { area: PointsArea; points: number; share: number }[] {
    const pos = POINTS_AREAS.filter((a) => areas[a] > 0)
    const sum = pos.reduce((s, a) => s + areas[a], 0)
    return pos.map((a) => ({ area: a, points: areas[a], share: sum > 0 ? areas[a] / sum : 0 })).sort((x, y) => y.points - x.points)
}

export interface DiversitySettings { step: number; max: number; maxShare: number; minPoints: number }
export const DEFAULT_DIVERSITY: DiversitySettings = { step: 0.1, max: 0.3, maxShare: 0.6, minPoints: 10 }

/** O total do perfil. MESMA conta do banco (refresh_outdoor_scores): +step por área ativa além da primeira, no máximo `max`,
 *  e só se a maior área não passa de `maxShare` do total. Área "ativa" = pelo menos `minPoints`. */
export function computeScore(areas: Record<PointsArea, number>, s: DiversitySettings = DEFAULT_DIVERSITY): { raw: number; bonusPct: number; total: number; activeAreas: number } {
    const vals = POINTS_AREAS.map((a) => num(areas[a]))
    const raw = Math.max(0, vals.reduce((x, y) => x + y, 0))
    const n = vals.filter((v) => v >= s.minPoints).length
    const top = Math.max(...vals)
    const bonusPct = n > 1 && raw > 0 && top / raw <= s.maxShare ? Math.min(s.max, s.step * (n - 1)) : 0
    return { raw, bonusPct, total: Math.round(raw * (1 + bonusPct)), activeAreas: n }
}

/** "+20%" (ou null se não há bônus) */
export function bonusLabel(bonusPct: number): string | null {
    return bonusPct > 0 ? `+${Math.round(bonusPct * 100)}%` : null
}

// ===== validação do que o admin digita (a mesma regra roda na tela e na rota; o banco ainda tem os CHECKs) =====
export interface RuleInput {
    label?: string
    points: unknown
    dailyLimit?: unknown
    maxTotal?: unknown
    startsAt?: string | null
    endsAt?: string | null
}
const MAX_POINTS = 100000

/** Mensagem de erro em português, ou null se está tudo certo */
export function validateRule(r: RuleInput, opts: { requireLabel?: boolean } = {}): string | null {
    if (opts.requireLabel && !(r.label || '').trim()) return 'Dê um nome para a tarefa'
    if ((r.label || '').length > 80) return 'O nome pode ter até 80 letras'
    const points = Number(r.points)
    if (r.points === '' || r.points === null || r.points === undefined || !Number.isFinite(points) || !Number.isInteger(points)) return 'Os pontos precisam ser um número inteiro'
    if (points < -MAX_POINTS || points > MAX_POINTS) return `Pontos de -${MAX_POINTS} a ${MAX_POINTS}`
    for (const [v, name] of [[r.dailyLimit, 'O limite por dia'], [r.maxTotal, 'O limite total']] as [unknown, string][]) {
        if (v === null || v === undefined || v === '') continue
        const n = Number(v)
        if (!Number.isInteger(n) || n < 1) return `${name} precisa ser 1 ou mais (ou vazio, sem limite)`
    }
    if (r.startsAt && r.endsAt) {
        const a = Date.parse(r.startsAt), b = Date.parse(r.endsAt)
        if (!Number.isFinite(a) || !Number.isFinite(b)) return 'Datas inválidas'
        if (b <= a) return 'O fim da campanha precisa ser depois do começo'
    } else {
        for (const d of [r.startsAt, r.endsAt]) if (d && !Number.isFinite(Date.parse(d))) return 'Data inválida'
    }
    return null
}

export function validateSignal(s: { weight: unknown; maxUnits?: unknown }): string | null {
    const w = Number(s.weight)
    if (s.weight === '' || s.weight === null || s.weight === undefined || !Number.isFinite(w)) return 'O peso precisa ser um número'
    if (w < -1000 || w > 1000) return 'Peso de -1000 a 1000'
    if (s.maxUnits !== null && s.maxUnits !== undefined && s.maxUnits !== '') {
        const m = Number(s.maxUnits)
        if (!Number.isFinite(m) || m <= 0) return 'O teto de unidades precisa ser maior que zero (ou vazio, sem teto)'
    }
    return null
}

export function validateDiversity(s: DiversitySettings): string | null {
    if (!(s.step >= 0 && s.step <= 1)) return 'O bônus por área vai de 0% a 100%'
    if (!(s.max >= 0 && s.max <= 2)) return 'O bônus máximo vai de 0% a 200%'
    if (!(s.maxShare > 0 && s.maxShare <= 1)) return 'A parte máxima de uma área vai de 1% a 100%'
    if (!Number.isInteger(s.minPoints) || s.minPoints < 1) return 'Os pontos mínimos de uma área precisam ser 1 ou mais'
    return null
}

/** Situação de uma regra de evento hoje */
export type RuleState = 'ligada' | 'desligada' | 'agendada' | 'encerrada'
export function ruleState(r: { is_active: boolean; starts_at?: string | null; ends_at?: string | null }, now = Date.now()): RuleState {
    if (!r.is_active) return 'desligada'
    if (r.starts_at && Date.parse(r.starts_at) > now) return 'agendada'
    if (r.ends_at && Date.parse(r.ends_at) < now) return 'encerrada'
    return 'ligada'
}

/** Código interno de uma regra nova (só letras minúsculas, números e _; o admin nunca vê) */
export function newRuleId(event: string, rand: () => number = Math.random): string {
    const suffix = Array.from({ length: 6 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(rand() * 36)]).join('')
    return `t_${event.replace(/[^a-z0-9_]/g, '').slice(0, 20)}_${suffix}`
}

/** "+10", "−4" e "+1 a cada 20" (para pesos pequenos), no jeito que a tela lê */
export function signedPoints(points: number): string {
    if (points < 0) return `−${Math.abs(points).toLocaleString('pt-BR')}`
    if (points > 0 && points < 1) return `+${points.toLocaleString('pt-BR')} (1 a cada ${Math.round(1 / points)})`
    return `+${points.toLocaleString('pt-BR')}`
}
