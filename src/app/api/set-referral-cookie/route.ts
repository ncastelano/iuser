import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
    try {
        const { referralSlug, force } = await request.json()

        if (!referralSlug) {
            return NextResponse.json(
                { error: 'Slug não fornecido' },
                { status: 400 }
            )
        }

        const cookieStore = await cookies()

        // Primeiro link clicado vale: uma visita passiva (abrir a loja, o
        // perfil, um produto/serviço ou publicação de alguém) não sobrescreve
        // um convite que a pessoa já carrega de antes - senão navegar por
        // vários links antes de se cadastrar trocaria quem recebe o crédito.
        // Só uma aceitação explícita de convite (força com `force: true`)
        // pode substituir o que já estava salvo.
        if (!force && cookieStore.get('referral_profileSlug')?.value) {
            return NextResponse.json({ success: true, referralSlug, skipped: true })
        }

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