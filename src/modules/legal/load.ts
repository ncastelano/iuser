// src/modules/legal/load.ts — fala com o banco (aceites legais e "Quem vende"; migration 20261130000082).
import { supabase } from '@/lib/supabase/client'
import { parseMyLegal, type LegalDoc, type MyLegal } from './domain'

export async function fetchMyLegal(scope?: string | null): Promise<MyLegal | null> {
    const { data, error } = await supabase.rpc('get_my_legal', { p_scope: scope ?? null })
    if (error) return null
    return parseMyLegal(data)
}

export async function acceptLegal(doc: LegalDoc, scope?: string | null): Promise<void> {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 300) : null
    const { error } = await supabase.rpc('accept_legal', { p_doc: doc, p_scope: scope ?? null, p_user_agent: ua })
    if (error) throw new Error(error.message)
}

export interface StoreSeller { name: string; docType: 'cpf' | 'cnpj'; doc: string; address: string; docPublic: string | null }
export async function fetchStoreSeller(storeId: string): Promise<StoreSeller | null> {
    const { data, error } = await supabase.rpc('get_store_seller', { p_store: storeId })
    if (error || !data) return null
    const r = data as any
    return { name: r.name || '', docType: r.doc_type === 'cpf' ? 'cpf' : 'cnpj', doc: r.doc || '', address: r.address || '', docPublic: r.doc_public ?? null }
}
export async function saveStoreSeller(storeId: string, s: Omit<StoreSeller, 'docPublic'>): Promise<string | null> {
    const { data, error } = await supabase.rpc('set_store_seller', { p_store: storeId, p_name: s.name, p_doc_type: s.docType, p_doc: s.doc, p_address: s.address })
    if (error) throw new Error(error.message)
    return (data as any)?.doc_public ?? null
}
