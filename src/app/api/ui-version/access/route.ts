// app/api/ui-version/access/route.ts
//
// A pessoa logada (sessão pelos cookies) pode usar a interface 3.0? { allowed, isAdmin }. A regra é a mesma do proxy.
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getV3Access, identifyUser } from '@/versions/access'

export const dynamic = 'force-dynamic'

export async function GET() {
    const jar = await cookies()
    const user = await identifyUser(jar.getAll())
    const access = await getV3Access(user)
    return NextResponse.json(access)
}
