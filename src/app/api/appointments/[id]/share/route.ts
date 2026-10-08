// GET /api/appointments/[id]/share
//
// Dados de UM agendamento pra página compartilhável /compromisso/<id>:
//  - público (is_public = true): qualquer pessoa vê, logada ou não;
//  - privado: só quem participa vê (cliente, dono, prestador ou dono da loja) e precisa estar logado.
// Não devolve contato nenhum (e-mail/telefone) — só o que a agenda já mostra: quando, o quê, com quem.
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getAuthedUser } from '@/lib/adminAuth'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function avatarPublicUrl(path: string | null | undefined): string | null {
    if (!path) return null
    if (path.startsWith('http')) return path
    return supabaseAdmin.storage.from('avatars').getPublicUrl(path).data.publicUrl
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    if (!UUID_RE.test(id)) return NextResponse.json({ error: 'not_found' }, { status: 404 })

    const { data: appt } = await supabaseAdmin
        .from('appointments')
        .select('id, store_id, store_name, store_slug, store_logo_url, customer_id, owner_id, provider_profile_id, date, time, duration_minutes, service_name, status, is_public')
        .eq('id', id)
        .maybeSingle()
    if (!appt) return NextResponse.json({ error: 'not_found' }, { status: 404 })

    const viewer = await getAuthedUser(req)
    let participant = false
    if (viewer) {
        participant = [appt.customer_id, appt.owner_id, appt.provider_profile_id].includes(viewer.id)
        if (!participant && appt.store_id) {
            const { data: store } = await supabaseAdmin.from('stores').select('owner_id').eq('id', appt.store_id).maybeSingle()
            participant = store?.owner_id === viewer.id
        }
    }

    if (!appt.is_public) {
        if (!viewer) return NextResponse.json({ error: 'login_required' }, { status: 401 })
        if (!participant) return NextResponse.json({ error: 'private' }, { status: 403 })
    }

    // Quem participa: o cliente e, fora de loja, quem convidou / o prestador (sem repetir ninguém)
    const ids = Array.from(new Set([appt.customer_id, ...(appt.store_id ? [] : [appt.owner_id, appt.provider_profile_id])].filter(Boolean))) as string[]
    const { data: profiles } = await supabaseAdmin.from('profiles').select('id, name, profileSlug, avatar_url').in('id', ids)
    const people = ids.map((pid) => {
        const p = profiles?.find((x) => x.id === pid)
        return {
            id: pid,
            name: p?.name ?? null,
            profileSlug: p?.profileSlug ?? null,
            avatarUrl: avatarPublicUrl(p?.avatar_url),
            isViewer: viewer?.id === pid,
        }
    })

    const logo = appt.store_logo_url
        ? (appt.store_logo_url.startsWith('http') ? appt.store_logo_url : supabaseAdmin.storage.from('store-logos').getPublicUrl(appt.store_logo_url).data.publicUrl)
        : null

    return NextResponse.json({
        id: appt.id,
        date: appt.date,
        time: appt.time,
        durationMinutes: appt.duration_minutes ?? null,
        title: appt.service_name,
        status: appt.status,
        isPublic: !!appt.is_public,
        store: appt.store_id ? { name: appt.store_name, slug: appt.store_slug, logoUrl: logo } : null,
        people,
        viewerIsParticipant: participant,
    })
}
