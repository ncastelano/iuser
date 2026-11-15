// src/modules/missions/domain.ts — regras PURAS das missões da loja (pontuação diária ligada ao Outdoor de lojas).
// Quem decide se uma missão foi cumprida é o BANCO (get_store_missions); aqui só se lê a resposta e se monta o texto da tela.

export type MissionKind = 'once' | 'daily'

export interface Mission {
    code: string
    kind: MissionKind
    title: string
    hint: string | null
    points: number
    dest: string | null
    done: boolean
}

export interface MissionsOutdoor {
    active: boolean
    weight: number
    missionUnits: number
    pointsFromMissions: number
    storePoints: number
    rank: number
    stores: number
}

/** O nível da loja (a moldura do logo): vem do banco junto com as missões */
export interface MissionsLevel {
    enabled: boolean
    level: number
    name: string | null
    nextName: string | null
    nextMin: number
    points: number
}

export interface StoreMissions {
    missions: Mission[]
    todayPoints: number
    todayTotal: number
    weekPoints: number
    streakDays: number
    outdoor: MissionsOutdoor
    /** `null` quando a resposta não traz nível (banco sem a migration dos níveis) */
    level: MissionsLevel | null
}

const int = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0 }
const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0 }

/** Resposta de `get_store_missions` → objeto tipado; qualquer coisa fora do formato vira `null` (a tela esconde o quadro, nunca inventa). */
export function missionsFromRow(row: unknown): StoreMissions | null {
    if (!row || typeof row !== 'object') return null
    const r = row as Record<string, any>
    if (!Array.isArray(r.missions) || !r.today || !r.outdoor) return null
    const missions: Mission[] = []
    for (const m of r.missions) {
        if (!m || typeof m.code !== 'string' || typeof m.title !== 'string') continue
        if (m.kind !== 'once' && m.kind !== 'daily') continue
        missions.push({ code: m.code, kind: m.kind, title: m.title, hint: typeof m.hint === 'string' ? m.hint : null, points: int(m.points), dest: typeof m.dest === 'string' ? m.dest : null, done: m.done === true })
    }
    return {
        missions,
        todayPoints: int(r.today.points),
        todayTotal: int(r.today.total),
        weekPoints: int(r.week_points),
        streakDays: int(r.streak_days),
        outdoor: {
            active: r.outdoor.active === true,
            weight: num(r.outdoor.weight),
            missionUnits: num(r.outdoor.mission_units),
            pointsFromMissions: num(r.outdoor.points_from_missions),
            storePoints: num(r.outdoor.store_points),
            rank: Math.max(1, int(r.outdoor.rank)),
            stores: int(r.outdoor.stores),
        },
        level: r.level && typeof r.level === 'object'
            ? { enabled: r.level.enabled === true, level: int(r.level.level), name: typeof r.level.name === 'string' ? r.level.name : null, nextName: typeof r.level.next_name === 'string' ? r.level.next_name : null, nextMin: int(r.level.next_min), points: int(r.level.points) }
            : null,
    }
}

/** As missões do dia e o cadastro, separados (a ordem do banco já vem certa) */
export function splitMissions(m: StoreMissions): { daily: Mission[]; cadastro: Mission[]; cadastroFeito: number; cadastroPendente: Mission[] } {
    const daily = m.missions.filter((x) => x.kind === 'daily')
    const cadastro = m.missions.filter((x) => x.kind === 'once')
    return { daily, cadastro, cadastroFeito: cadastro.filter((x) => x.done).length, cadastroPendente: cadastro.filter((x) => !x.done) }
}

/** 0–1 do que foi cumprido hoje (para a barra) */
export function todayRatio(m: StoreMissions): number {
    if (m.todayTotal <= 0) return 0
    return Math.min(1, m.todayPoints / m.todayTotal)
}

/** Linha que liga a missão ao Outdoor: quanto as missões valem na loja e onde ela está */
export function outdoorLine(o: MissionsOutdoor): string {
    if (!o.active) return 'As missões estão fora do Outdoor por enquanto'
    const pts = Math.round(o.pointsFromMissions)
    const pos = o.stores > 0 ? ` · ${o.rank}º entre ${o.stores} lojas no Outdoor` : ''
    return `Missões somam ${pts} ${pts === 1 ? 'ponto' : 'pontos'} na loja${pos}`
}

/** "4 dias seguidos" / "sem sequência ainda" */
export function streakLabel(days: number): string {
    if (days <= 0) return 'sem sequência ainda'
    return days === 1 ? '1 dia seguido' : `${days} dias seguidos`
}

/** Para onde leva uma missão do cadastro que falta. Hoje tudo se resolve em Editar loja; cada `dest` poderá abrir a sua folha. */
export function missionPath(storeSlug: string, dest: string | null): string {
    void dest
    return `/editar-loja/${encodeURIComponent(storeSlug)}`
}

/** "Nível 3 · Estrela · faltam 2.300 pontos para Lenda" (`null` = nível desligado ou sem informação: a tela não mostra a linha) */
export function levelLine(l: MissionsLevel | null): string | null {
    if (!l || !l.enabled || !l.name) return null
    const base = `Nível ${l.level} · ${l.name}`
    if (!l.nextName) return `${base} · nível máximo`
    const falta = Math.max(0, l.nextMin - l.points)
    if (falta === 0) return `${base} · subindo para ${l.nextName}`       // já tem os pontos; o nível sobe na próxima rodada (até 5 min)
    return `${base} · faltam ${falta.toLocaleString('pt-BR')} ${falta === 1 ? 'ponto' : 'pontos'} para ${l.nextName}`
}
