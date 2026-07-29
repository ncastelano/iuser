import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST() {
  try {
    const cookieStore = await cookies()
    cookieStore.delete('referral_profileSlug')

    return NextResponse.json({
      success: true,
      message: 'Cookie removido com sucesso'
    })
  } catch (error) {
    console.error('Erro ao limpar cookie:', error)
    return NextResponse.json(
      { error: 'Erro ao limpar cookie' },
      { status: 500 }
    )
  }
}