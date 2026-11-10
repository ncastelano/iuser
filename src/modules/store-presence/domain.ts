// "AGORA NA SUA LOJA" (painel da loja da 3.0): quem está na loja AGORA, sem dizer QUEM é.
// Cada aparelho que abre a página da loja, o catálogo, um produto, a sacola ou o pagamento — e quem está ouvindo/assistindo um conteúdo
// digital da loja — avisa por PRESENÇA do tempo real (Supabase Realtime) num canal da loja: só a ETAPA, o nome do item e a hora.
// Nunca vai nome, @, foto, cidade nem endereço: o painel mostra "Alguém está vendo Pizza X". Puro e testado (npm run test:store-presence).

export type Stage = 'loja' | 'catalogo' | 'produto' | 'sacola' | 'pagando' | 'ouvindo' | 'assistindo' | 'lendo'
export const STAGES: Stage[] = ['loja', 'catalogo', 'produto', 'sacola', 'pagando', 'ouvindo', 'assistindo', 'lendo']
export const STAGE_INFO: Record<Stage, { nome: string; frase: string; cor: string; conteudo: boolean }> = {
    loja: { nome: 'Vendo a loja', frase: 'está vendo a página da loja', cor: '#3b82f6', conteudo: false },
    catalogo: { nome: 'No catálogo', frase: 'está olhando o catálogo', cor: '#6366f1', conteudo: false },
    produto: { nome: 'Vendo um item', frase: 'está vendo', cor: '#0ea5e9', conteudo: false },
    sacola: { nome: 'Na sacola', frase: 'está com itens na sacola', cor: '#f97316', conteudo: false },
    pagando: { nome: 'Pagando', frase: 'está finalizando a compra', cor: '#16a34a', conteudo: false },
    ouvindo: { nome: 'Ouvindo', frase: 'está ouvindo', cor: '#a855f7', conteudo: true },
    assistindo: { nome: 'Assistindo', frase: 'está assistindo', cor: '#ec4899', conteudo: true },
    lendo: { nome: 'Lendo', frase: 'está lendo', cor: '#14b8a6', conteudo: true },
}

export interface PresenceState { stage: Stage; label: string | null; at: number }

export const channelName = (storeId: string) => `loja-agora:${storeId}`

/** limpa o que vai para o canal: etapa válida, rótulo curto (só o NOME do item), hora */
export function sanitizeState(x: unknown): PresenceState | null {
    const o = x as Partial<PresenceState> | null
    if (!o || !STAGES.includes(o.stage as Stage)) return null
    const label = typeof o.label === 'string' ? o.label.replace(/\s+/g, ' ').trim().slice(0, 60) || null : null
    const at = Number(o.at) || 0
    return { stage: o.stage as Stage, label, at }
}

/** o estado do canal → uma linha por aparelho (a mais recente de cada chave) */
export function flatten(state: Record<string, unknown[]>): (PresenceState & { key: string })[] {
    const out: (PresenceState & { key: string })[] = []
    for (const [key, metas] of Object.entries(state || {})) {
        const ok = (metas || []).map(sanitizeState).filter(Boolean) as PresenceState[]
        if (!ok.length) continue
        out.push({ key, ...ok.sort((a, b) => b.at - a.at)[0] })
    }
    return out.sort((a, b) => b.at - a.at)
}

export interface Resumo { total: number; porEtapa: Record<Stage, number>; maisVistos: { label: string; n: number }[]; conteudoAgora: number }
export function resumir(rows: PresenceState[]): Resumo {
    const porEtapa = Object.fromEntries(STAGES.map((s) => [s, 0])) as Record<Stage, number>
    const vistos = new Map<string, number>()
    for (const r of rows) {
        porEtapa[r.stage]++
        if (r.label && (r.stage === 'produto' || STAGE_INFO[r.stage].conteudo)) vistos.set(r.label, (vistos.get(r.label) || 0) + 1)
    }
    return {
        total: rows.length, porEtapa,
        maisVistos: [...vistos.entries()].map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label)).slice(0, 5),
        conteudoAgora: rows.filter((r) => STAGE_INFO[r.stage].conteudo).length,
    }
}

/** a frase anônima do feed */
export const frase = (r: PresenceState) => `Alguém ${STAGE_INFO[r.stage].frase}${r.label && (r.stage === 'produto' || STAGE_INFO[r.stage].conteudo) ? ` “${r.label}”` : ''}`
