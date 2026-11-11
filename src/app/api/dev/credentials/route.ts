// GET /api/dev/credentials?as=owner|client|driver-<chave> — só no ambiente LOCAL de desenvolvimento: e-mail + senha de teste da conta que uma das telas da
// página /tres-telas deve abrir (dono da pizzaria ou cliente em destaque). Em qualquer outro ambiente: 404.
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { DEV_FEATURED_CLIENT_EMAIL, DEV_STORE_SLUG, DEV_TEST_PASSWORD, isLocalDevOnly } from '@/lib/devOnly'

export async function GET(req: Request) {
    if (!isLocalDevOnly()) return new NextResponse(null, { status: 404 })
    const who = new URL(req.url).searchParams.get('as')
    if (who === 'client') return NextResponse.json({ email: DEV_FEATURED_CLIENT_EMAIL, password: DEV_TEST_PASSWORD })
    if (who === 'owner') {
        const { data: store } = await supabaseAdmin.from('stores').select('owner_id').eq('storeSlug', DEV_STORE_SLUG).maybeSingle()
        if (!store) return NextResponse.json({ error: 'loja não encontrada' }, { status: 404 })
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(store.owner_id)
        if (!u?.user?.email) return NextResponse.json({ error: 'dono sem e-mail' }, { status: 404 })
        return NextResponse.json({ email: u.user.email, password: DEV_TEST_PASSWORD })
    }
    // profile-<slug>: qualquer perfil do banco LOCAL (a senha de teste vem de seed-motoboys.mjs / set-dev-password)
    const prof = who?.match(/^profile-([a-z0-9-]+)$/)
    if (prof) {
        const { data: pr } = await supabaseAdmin.from('profiles').select('id').eq('profileSlug', prof[1]).maybeSingle()
        if (!pr) return NextResponse.json({ error: 'perfil não encontrado' }, { status: 404 })
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(pr.id)
        if (!u?.user?.email) return NextResponse.json({ error: 'perfil sem e-mail' }, { status: 404 })
        return NextResponse.json({ email: u.user.email, password: DEV_TEST_PASSWORD })
    }
    const drv = who?.match(/^driver-([a-z]+)$/)
    if (drv) return NextResponse.json({ email: `entregador-${drv[1]}@staging.iuser.test`, password: DEV_TEST_PASSWORD })   // motoristas iUser (seed-entregadores.mjs)
    return NextResponse.json({ error: 'as=owner|client|driver-<chave>|profile-<slug>' }, { status: 400 })
}
