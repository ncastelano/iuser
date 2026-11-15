// src/lib/r2Cleanup.ts — as operações do R2 que a limpeza (lib/uploadCleanup.ts) usa, montadas com as chaves do servidor. SERVIDOR APENAS. Fica separado para a rotina de limpeza continuar testável sem chaves.
import { r2Delete, r2Head, r2ListAll, type R2Config } from './r2.ts'

export type R2CleanupOps = {
    bucket: string
    list(): Promise<{ key: string; size: number; lastModified: Date }[]>
    remove(key: string): Promise<void>
    exists(key: string): Promise<boolean>
}

export function r2CleanupOps(cfg: R2Config): R2CleanupOps {
    return {
        bucket: cfg.bucket,
        list: async () => (await r2ListAll(cfg)).objects,
        remove: (key) => r2Delete(cfg, key),
        exists: async (key) => (await r2Head(cfg, key)).exists,
    }
}
