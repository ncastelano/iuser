// src/modules/store-levels/domain.ts — regras PURAS dos níveis de loja (a moldura do logo). O nível de cada loja vem pronto do banco
// (`stores.store_level`, calculado por `refresh_store_levels()` a partir dos pontos do Outdoor); aqui só se lê a escada e se desenha a moldura.

export interface StoreLevel {
    level: number
    name: string
    minPoints: number
    /** vazio = sem moldura; 1 cor = fio; 2 ou mais = degradê */
    colors: string[]
    animated: boolean
    description: string | null
}

/** A escada de fábrica — só serve enquanto a de verdade (tabela `store_levels`, editada pelo admin) não chegou ou falhou. */
export const DEFAULT_STORE_LEVELS: StoreLevel[] = [
    { level: 0, name: 'Iniciante', minPoints: 0, colors: [], animated: false, description: 'Sem moldura: o logo limpo.' },
    { level: 1, name: 'Ativa', minPoints: 100, colors: ['#22c55e'], animated: false, description: 'Fio verde.' },
    { level: 2, name: 'Destaque', minPoints: 500, colors: ['#38bdf8', '#3b82f6', '#6366f1'], animated: false, description: 'Degradê azul-violeta.' },
    { level: 3, name: 'Estrela', minPoints: 1500, colors: ['#a855f7', '#ec4899', '#f472b6'], animated: false, description: 'Degradê rosa, anel duplo e brilho.' },
    { level: 4, name: 'Lenda', minPoints: 4000, colors: ['#f97316', '#ef4444', '#fbbf24', '#f97316'], animated: true, description: 'Chama laranja que gira devagar e coroa.' },
]

const HEX = /^#[0-9a-fA-F]{3,8}$/

/** Linhas de `store_levels` → escada ordenada; linha ruim é descartada; sem nenhuma boa volta a de fábrica (a moldura nunca some por erro de leitura) */
export function levelsFromRows(rows: unknown): StoreLevel[] {
    if (!Array.isArray(rows)) return DEFAULT_STORE_LEVELS
    const out: StoreLevel[] = []
    for (const r of rows) {
        if (!r || typeof r !== 'object') continue
        const x = r as Record<string, any>
        const level = Number(x.level)
        if (!Number.isInteger(level) || level < 0 || level > 9 || typeof x.name !== 'string' || !x.name) continue
        const colors = Array.isArray(x.colors) ? x.colors.filter((c: unknown): c is string => typeof c === 'string' && HEX.test(c)) : []
        out.push({ level, name: x.name, minPoints: Math.max(0, Math.round(Number(x.min_points) || 0)), colors, animated: x.animated === true, description: typeof x.description === 'string' ? x.description : null })
    }
    if (out.length === 0) return DEFAULT_STORE_LEVELS
    return out.sort((a, b) => a.level - b.level)
}

/** O nível pelo número (que a loja traz em `store_level`); se não existe na escada usa o maior abaixo dele; nada válido = nível 0 */
export function levelOf(levels: StoreLevel[], n: number | null | undefined): StoreLevel {
    const lv = Number.isFinite(Number(n)) ? Number(n) : 0
    const exact = levels.find((l) => l.level === lv)
    if (exact) return exact
    const below = [...levels].reverse().find((l) => l.level <= lv)
    return below ?? levels[0] ?? DEFAULT_STORE_LEVELS[0]
}

/** O degrau seguinte (para "faltam N pontos para ..."); `null` = já está no último */
export function nextLevel(levels: StoreLevel[], n: number | null | undefined): StoreLevel | null {
    const cur = levelOf(levels, n).level
    return levels.find((l) => l.level > cur) ?? null
}

export interface FrameSpec {
    /** espessura da moldura (px) */
    ring: number
    /** raio de fora (px) */
    radius: number
    /** fundo da moldura: cor ou linear-gradient (estática); `null` quando é a chama animada (usa `conic`) */
    background: string | null
    /** conic-gradient da moldura animada (gira por trás do logo) */
    conic: string | null
    glow: string | undefined
    crown: boolean
    animated: boolean
}

/**
 * Como desenhar a moldura de um nível num logo de lado `size` (px). `null` = nível sem moldura.
 * Os efeitos seguem o NÚMERO do nível (o admin edita nome, pontos e cores; o desenho de cada degrau é do app):
 * 1 fio · 2 degradê com sombra suave · 3 degradê + anel duplo + brilho · animado (4) chama girando + coroa (a coroa só em logo de 40 px ou mais).
 */
export function frameSpec(l: StoreLevel, size: number, opts: { radius?: number; ring?: number; bg?: string } = {}): FrameSpec | null {
    if (l.level <= 0 || l.colors.length === 0) return null
    const bg = opts.bg ?? '#ffffff'
    const ring = opts.ring ?? Math.max(2, Math.round(size * (l.animated ? 0.07 : 0.055)))
    const radius = opts.radius ?? Math.round(size * 0.26)
    const c0 = l.colors[0], c1 = l.colors[1] ?? l.colors[0]
    const background = l.animated ? null : l.colors.length > 1 ? `linear-gradient(135deg, ${l.colors.join(', ')})` : c0
    const conic = l.animated ? `conic-gradient(${[...l.colors, l.colors[0]].join(', ')})` : null
    let glow: string | undefined
    if (l.animated) glow = `0 6px 20px ${c0}66`
    else if (l.level >= 3) glow = `0 0 0 ${Math.max(2, Math.round(size * 0.04))}px ${bg}, 0 0 0 ${Math.max(3, Math.round(size * 0.07))}px ${c0}55, 0 6px 18px ${c1}66`
    else if (l.level === 2) glow = `0 4px 12px ${c1}44`
    return { ring, radius, background, conic, glow, crown: l.animated && size >= 40, animated: l.animated }
}

/** Borda de UM elemento só (marcador de mapa, miniaturas): o mesmo desenho como `border` em degradê, sem camadas nem animação. `null` = sem moldura. */
export function borderCss(l: StoreLevel, ring: number, bg = '#ffffff'): { border: string; background: string } | null {
    if (l.level <= 0 || l.colors.length === 0) return null
    const grad = l.colors.length > 1 ? `linear-gradient(135deg, ${l.colors.join(', ')})` : `linear-gradient(${l.colors[0]}, ${l.colors[0]})`
    return { border: `${ring}px solid transparent`, background: `linear-gradient(${bg}, ${bg}) padding-box, ${grad} border-box` }
}

/** "Faltam 520 pontos para Lenda" / "Nível máximo" */
export function progressLabel(levels: StoreLevel[], n: number | null | undefined, points: number): string {
    const next = nextLevel(levels, n)
    if (!next) return 'Nível máximo'
    const falta = Math.max(0, Math.ceil(next.minPoints - points))
    return `Faltam ${falta.toLocaleString('pt-BR')} ${falta === 1 ? 'ponto' : 'pontos'} para ${next.name}`
}

// ===== Edição pelo admin (a mesma validação na tela e na rota; o banco ainda tem os CHECKs) =====
export interface LevelEdit { level: number; name: string; minPoints: number; colors: string[]; animated: boolean; isActive: boolean }

/** Uma linha da escada. `null` = ok; senão a frase para mostrar. */
export function validateLevelEdit(e: LevelEdit): string | null {
    if (!Number.isInteger(e.level) || e.level < 0 || e.level > 9) return 'Nível inválido.'
    const name = (e.name || '').trim()
    if (name.length < 2 || name.length > 24) return 'O nome tem de 2 a 24 letras.'
    if (!Number.isInteger(e.minPoints) || e.minPoints < 0 || e.minPoints > 1_000_000) return 'Os pontos mínimos têm de ser um número inteiro de 0 a 1.000.000.'
    if (e.colors.length > 6) return 'No máximo 6 cores.'
    if (e.colors.some((c) => !HEX.test(c))) return 'Cada cor tem de ser um código como #f97316.'
    if (e.level === 0) {
        if (e.minPoints !== 0) return 'O nível 0 começa em 0 pontos.'
        if (!e.isActive) return 'O nível 0 não pode ser desligado.'
    } else if (e.isActive && e.colors.length === 0) return 'Um nível com moldura precisa de ao menos uma cor.'
    return null
}

/** A escada inteira: os níveis ligados têm de subir (mais pontos a cada degrau). `null` = ok. */
export function validateLadder(levels: LevelEdit[]): string | null {
    const on = levels.filter((l) => l.isActive).sort((a, b) => a.level - b.level)
    if (on.length === 0 || on[0].level !== 0) return 'O nível 0 precisa existir e estar ligado.'
    for (let i = 1; i < on.length; i++) {
        if (on[i].minPoints <= on[i - 1].minPoints) return `${on[i].name} precisa de mais pontos que ${on[i - 1].name} (${on[i - 1].minPoints.toLocaleString('pt-BR')}).`
    }
    return null
}

export function validateLevelSettings(s: { dropAfterDays: number }): string | null {
    if (!Number.isInteger(s.dropAfterDays) || s.dropAfterDays < 1 || s.dropAfterDays > 90) return 'Os dias para descer têm de ser de 1 a 90.'
    return null
}

/** "#f97316, #ef4444" (campo de texto) → lista de cores limpa; o que não for cor fica de fora para a validação acusar */
export function parseColorsInput(text: string): string[] {
    return text.split(/[\s,;]+/).map((c) => c.trim()).filter(Boolean)
}
