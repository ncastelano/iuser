// app/api/admin/whoami/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getAuthedUser, SUPER_ADMIN_EMAIL } from '@/lib/adminAuth'

export async function POST(req: Request) {
    const user = await getAuthedUser(req)
    if (!user) {
        return NextResponse.json({ isSuperAdmin: false, canGenerateCodes: false })
    }

    if (user.email === SUPER_ADMIN_EMAIL) {
        return NextResponse.json({ isSuperAdmin: true, canGenerateCodes: true })
    }

    const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('can_generate_store_codes')
        .eq('id', user.id)
        .single()

    return NextResponse.json({ isSuperAdmin: false, canGenerateCodes: !!profile?.can_generate_store_codes })
}
