// app/api/admin/iuser-status/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/adminAuth'
import { getAvatarUrl } from '@/lib/avatar'

// Admin → iUser status: POR QUE cada pessoa tem os pontos que tem. Só leitura (nenhuma ação altera pontos).
//   action 'list'   → todo mundo que pontuou, do que tem mais pro que tem menos (avatar, nome, total, nº de eventos, último ganho)
//   action 'events' → o extrato de uma pessoa: dia e hora, o que foi, quantos pontos e a que se refere (quem convidou, quem seguiu, qual publicação)
// O extrato vem do livro-caixa profile_points_events (o peso fica congelado na linha, então o que já foi ganho não muda se a regra mudar).
export async function POST(req: Request) {
    const admin = await requireSuperAdmin(req)
    if (!admin) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

    const body = await req.json().catch(() => ({}))
    const avatar = (p: string | null) => (p ? (getAvatarUrl(supabaseAdmin as any, p) || null) : null)

    if (body.action === 'events') {
        const profileId = String(body.profileId || '')
        if (!/^[0-9a-f-]{36}$/i.test(profileId)) return NextResponse.json({ error: 'Perfil inválido' }, { status: 400 })

        const [{ data: events, error }, { data: rules }] = await Promise.all([
            supabaseAdmin.from('profile_points_events').select('id, action, points, ref, created_at')
                .eq('profile_id', profileId).order('created_at', { ascending: false }).limit(500),
            supabaseAdmin.from('point_rules').select('action, label, description'),
        ])
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })

        const ruleBy = new Map((rules || []).map((r: any) => [r.action, r]))
        const refs = Array.from(new Set((events || []).map((e: any) => e.ref).filter((r: string | null) => r && /^[0-9a-f-]{36}$/i.test(r)))) as string[]
        // O "ref" é o id da outra ponta: perfil (convidado/seguidor), loja (seguida) ou publicação/serviço.
        const [{ data: profs }, { data: stores }, { data: prods }] = refs.length ? await Promise.all([
            supabaseAdmin.from('profiles').select('id, name, "profileSlug"').in('id', refs),
            supabaseAdmin.from('stores').select('id, name, "storeSlug"').in('id', refs),
            supabaseAdmin.from('products').select('id, name').in('id', refs),
        ]) : [{ data: [] as any[] }, { data: [] as any[] }, { data: [] as any[] }]
        const detail = new Map<string, string>()
        for (const p of prods || []) detail.set(p.id, p.name)
        for (const s of stores || []) detail.set(s.id, `Loja ${s.name}${s.storeSlug ? ` (@${s.storeSlug})` : ''}`)
        for (const p of profs || []) detail.set(p.id, `${p.name || 'Perfil'}${p.profileSlug ? ` (@${p.profileSlug})` : ''}`)

        return NextResponse.json({
            events: (events || []).map((e: any) => ({
                id: e.id,
                at: e.created_at,
                action: e.action,
                label: ruleBy.get(e.action)?.label || e.action,
                points: e.points,
                detail: e.ref ? (detail.get(e.ref) || null) : null,
            })),
        })
    }

    // list
    const { data: totals, error } = await supabaseAdmin.from('profile_points').select('profile_id, total').gt('total', 0).order('total', { ascending: false }).limit(500)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const ids = (totals || []).map((t: any) => t.profile_id)
    const [{ data: profiles }, { data: evs }] = ids.length ? await Promise.all([
        supabaseAdmin.from('profiles').select('id, name, "profileSlug", avatar_url').in('id', ids),
        supabaseAdmin.from('profile_points_events').select('profile_id, created_at').in('profile_id', ids),
    ]) : [{ data: [] as any[] }, { data: [] as any[] }]
    const byId = new Map((profiles || []).map((p: any) => [p.id, p]))
    const stat = new Map<string, { n: number; last: string }>()
    for (const e of evs || []) {
        const s = stat.get(e.profile_id)
        if (!s) stat.set(e.profile_id, { n: 1, last: e.created_at })
        else { s.n++; if (e.created_at > s.last) s.last = e.created_at }
    }
    return NextResponse.json({
        ranking: (totals || []).map((t: any, i: number) => {
            const p: any = byId.get(t.profile_id)
            return {
                position: i + 1, profileId: t.profile_id, total: t.total, name: p?.name || null, slug: p?.profileSlug || null,
                avatarUrl: avatar(p?.avatar_url || null), events: stat.get(t.profile_id)?.n || 0, lastAt: stat.get(t.profile_id)?.last || null,
            }
        }),
    })
}
