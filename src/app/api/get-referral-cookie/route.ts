import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const cookieStore = await cookies()
    const referralSlug = cookieStore.get('referral_profileSlug')?.value

    return NextResponse.json({
      referralSlug: referralSlug || null
    })
  } catch (error) {
    console.error('Erro ao ler cookie:', error)
    return NextResponse.json(
      { error: 'Erro ao ler cookie' },
      { status: 500 }
    )
  }
}