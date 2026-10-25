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
    // Sem usuário validado aqui pode ser só uma falha passageira (a tela já sabe que a pessoa está logada): `unknown` avisa para não
    // tratar como "acesso revogado" (isso apagaria o cookie da 3.0).
    return NextResponse.json(user ? access : { ...access, unknown: true })
}
