// src/lib/uploadCleanup.ts
//
// A ROTINA de limpeza de arquivos órfãos (migration 20261130000022, docs/CONTROLE-DE-UPLOADS.md, Camada 6). O banco decide o que é órfão (busca em todas as colunas, quarentena, disjuntor);
// aqui só se ORQUESTRA: conferir o que sumiu, marcar, pedir ao banco a lista do que já pode ser apagado, apagar pela API do Storage (o Storage proíbe DELETE direto em storage.objects) e CONFIRMAR
// ao banco só o que de fato sumiu. Roda pela rota agendada /api/internal/uploads-cleanup e pelo botão do painel Admin → Uploads.
//
// APAGAR É IRREVERSÍVEL. Por isso, aqui: (1) só apaga se a limpeza estiver LIGADA no painel E a chamada não for simulação; (2) o limite por rodada vem do banco e nunca passa de 1000;
// (3) cada linha devolvida é conferida de novo (bucket e nome seguros) antes de ir para a API; (4) erro numa parte nunca vira "apagado": o banco só confirma o que sumiu do Storage;
// (5) o disjuntor do banco aborta a rodada inteira. O cliente é injetado (testável sem Storage de verdade); sem imports com alias, roda nos testes de Node.

type DbError = { message: string; code?: string } | null
export interface CleanupClient {
    rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: DbError }>
    storage: { from(bucket: string): { remove(paths: string[]): PromiseLike<{ data: unknown; error: { message: string } | null }> } }
}

export type CleanupSource = 'cron' | 'admin'
export interface CleanupFile { bucket: string; key: string; bytes: number }
export interface CleanupResult {
    ok: boolean
    dryRun: boolean              // true = nada foi apagado (simulação, ou a limpeza está desligada)
    enabled: boolean             // a chave "apagar de verdade" do painel
    scanned: number; marked: number; cleared: number; reconciled: number
    due: number                  // quantos já poderiam ser apagados agora
    deleted: number; bytesFreed: number; errors: number
    wouldFreeBytes: number       // o que seria liberado (só faz sentido quando dryRun)
    files: CleanupFile[]         // até 20 dos que seriam/foram apagados (para o painel mostrar)
    notes: string[]
}

const BUCKET_RE = /^[a-z0-9][a-z0-9-]{0,62}$/
const KEY_RE = /^[A-Za-z0-9._/-]+$/
export const MAX_REMOVE_CHUNK = 100
export const HARD_MAX_PER_RUN = 1000

/** Linha vinda do banco que pode ir para a API de apagar (nome seguro e sem "..": confere de novo antes de qualquer exclusão). */
export function isSafeToRemove(f: { bucket?: unknown; key?: unknown }): f is { bucket: string; key: string } {
    return typeof f.bucket === 'string' && typeof f.key === 'string' && BUCKET_RE.test(f.bucket) && KEY_RE.test(f.key) && !/(^|\/)\.\.(\/|$)/.test(f.key) && !f.key.startsWith('/') && f.key.length <= 400
}

const rows = <T>(d: unknown): T[] => (Array.isArray(d) ? (d as T[]) : [])
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0)

export async function runUploadCleanup(client: CleanupClient, opts: { source: CleanupSource; dryRun?: boolean }): Promise<CleanupResult> {
    const startedAt = new Date().toISOString()
    const r: CleanupResult = { ok: true, dryRun: true, enabled: false, scanned: 0, marked: 0, cleared: 0, reconciled: 0, due: 0, deleted: 0, bytesFreed: 0, errors: 0, wouldFreeBytes: 0, files: [], notes: [] }
    const fail = (note: string) => { r.errors++; r.ok = false; r.notes.push(note) }

    // configuração (o "enabled" é a chave de apagar de verdade; vem do banco, nunca de quem chamou)
    const st = await client.rpc('admin_upload_cleanup_settings', { p_patch: {}, p_admin: null })
    if (st.error || !st.data) { fail(`Não foi possível ler a configuração da limpeza: ${st.error?.message || 'vazia'}`); return r }
    const s = st.data as { enabled?: boolean; max_per_run?: number }
    r.enabled = s.enabled === true
    r.dryRun = !r.enabled || opts.dryRun === true
    const limit = Math.min(Math.max(Math.trunc(num(s.max_per_run)) || 1, 1), HARD_MAX_PER_RUN)

    // 1) o que sumiu do Storage por outro caminho
    const rec = await client.rpc('media_assets_reconcile')
    if (rec.error) fail(`Conferência dos arquivos que sumiram: ${rec.error.message}`); else r.reconciled = num(rec.data)

    // 2) marcar / desmarcar
    const scan = await client.rpc('upload_cleanup_scan', { p_limit: limit })
    if (scan.error) fail(`Busca de arquivos sem uso: ${scan.error.message}`)
    else { const d = (scan.data || {}) as Record<string, unknown>; r.scanned = num(d.scanned); r.marked = num(d.marked); r.cleared = num(d.cleared) }

    // 3) o que já pode ser apagado (o banco confere de novo e aplica o disjuntor)
    let due: { id: string; bucket: string; key: string; bytes: number }[] = []
    if (!scan.error) {
        const d = await client.rpc('upload_cleanup_due', { p_limit: limit })
        if (d.error) {
            if (/circuit_breaker/.test(d.error.message)) fail(`Disjuntor acionado: ${d.error.message.replace(/^.*circuit_breaker:\s*/, '')}. Nada foi apagado.`)
            else fail(`Lista do que pode ser apagado: ${d.error.message}`)
        } else due = rows<{ id: string; bucket: string; key: string; bytes: number }>(d.data).slice(0, limit)
    }
    const unsafe = due.filter((f) => !isSafeToRemove(f))
    if (unsafe.length) { fail(`${unsafe.length} arquivo(s) com nome fora do padrão seguro foram ignorados.`); due = due.filter((f) => isSafeToRemove(f)) }
    r.due = due.length
    r.wouldFreeBytes = due.reduce((n, f) => n + num(f.bytes), 0)
    r.files = due.slice(0, 20).map((f) => ({ bucket: f.bucket, key: f.key, bytes: num(f.bytes) }))

    // 4) apagar de verdade (só ligado e sem simulação), por bucket, em lotes; confirmar ao banco só o que sumiu
    if (!r.dryRun && due.length) {
        const byBucket = new Map<string, typeof due>()
        for (const f of due) byBucket.set(f.bucket, [...(byBucket.get(f.bucket) || []), f])
        for (const [bucket, list] of byBucket) {
            for (let i = 0; i < list.length; i += MAX_REMOVE_CHUNK) {
                const chunk = list.slice(i, i + MAX_REMOVE_CHUNK)
                try {
                    const rm = await client.storage.from(bucket).remove(chunk.map((f) => f.key))
                    if (rm.error) fail(`Não foi possível apagar ${chunk.length} arquivo(s) de ${bucket}: ${rm.error.message}`)
                } catch (e) { fail(`Erro ao apagar em ${bucket}: ${(e as Error).message}`) }
                const cf = await client.rpc('upload_cleanup_confirm', { p_ids: chunk.map((f) => f.id) })
                if (cf.error) { fail(`Não foi possível confirmar a exclusão em ${bucket}: ${cf.error.message}`); continue }
                const got = rows<{ deleted: number; bytes: number }>(cf.data)[0]
                r.deleted += num(got?.deleted); r.bytesFreed += num(got?.bytes)
            }
        }
        if (r.deleted < due.length) r.notes.push(`${due.length - r.deleted} arquivo(s) continuam no Storage e ficam marcados para a próxima rodada.`)
    }

    // 5) registrar a rodada
    const note = r.notes.join(' | ') || null
    await client.rpc('upload_cleanup_record_run', {
        p_source: opts.source, p_dry: r.dryRun, p_started: startedAt,
        p_stats: { scanned: r.scanned, marked: r.marked, cleared: r.cleared, due: r.due, deleted: r.deleted, bytes_freed: r.bytesFreed, reconciled: r.reconciled, errors: r.errors },
        p_note: note,
    })
    return r
}
