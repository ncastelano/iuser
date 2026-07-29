import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
    try {
        const { referralSlug } = await request.json()

        if (!referralSlug) {
            return NextResponse.json(
                { error: 'Slug não fornecido' },
                { status: 400 }
            )
        }

        const cookieStore = await cookies()

        // Salvar cookie
        cookieStore.set('referral_profileSlug', referralSlug, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: 60 * 60 * 24 * 7, // 7 dias
        })

        return NextResponse.json({
            success: true,
            referralSlug: referralSlug
        })
    } catch (error) {
        console.error('Erro ao salvar cookie:', error)
        return NextResponse.json(
            { error: 'Erro ao salvar cookie' },
            { status: 500 }
        )
    }
}