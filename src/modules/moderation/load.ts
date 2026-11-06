// src/modules/moderation/load.ts — conversa com o banco (denunciar). A regra de ocultar mora no banco (report_content).
import { supabase } from '@/lib/supabase/client'
import type { ReportReason, ReportResult, ReportTarget } from './domain'

export async function reportContent(type: ReportTarget, id: string, reason: ReportReason, note: string): Promise<ReportResult> {
    const { data, error } = await supabase.rpc('report_content', { p_type: type, p_id: id, p_reason: reason, p_note: note || null })
    if (error) throw new Error(error.message || 'Não foi possível denunciar.')
    return (data as ReportResult) || 'reported'
}
