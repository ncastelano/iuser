// app/api/admin/whoami/route.ts
import { NextResponse } from 'next/server'
import { getAuthedUser, SUPER_ADMIN_EMAIL } from '@/lib/adminAuth'

export async function POST(req: Request) {
    const user = await getAuthedUser(req)
    if (!user) {
        return NextResponse.json({ isSuperAdmin: false })
    }

    return NextResponse.json({ isSuperAdmin: user.email === SUPER_ADMIN_EMAIL })
}
