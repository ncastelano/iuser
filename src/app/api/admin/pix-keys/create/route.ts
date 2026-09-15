// app/api/admin/pix-keys/create/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/adminAuth'

const VALID_TYPES = ['cpf', 'email', 'phone', 'random']

export async function POST(req: Request) {
    const admin = await requireSuperAdmin(req)
    if (!admin) {
        return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const { pixKey, pixKeyType, receiverName, setDefault } = await req.json()
    if (!pixKey || typeof pixKey !== 'string' || !pixKey.trim()) {
        return NextResponse.json({ error: 'Informe a chave PIX' }, { status: 400 })
    }
    if (!VALID_TYPES.includes(pixKeyType)) {
        return NextResponse.json({ error: 'Tipo de chave inválido' }, { status: 400 })
    }

    // Primeira chave cadastrada vira padrão automaticamente
    const { count } = await supabaseAdmin
        .from('admin_pix_keys')
        .select('id', { count: 'exact', head: true })
    const shouldBeDefault = !!setDefault || !count

    if (shouldBeDefault) {
        await supabaseAdmin.from('admin_pix_keys').update({ is_default: false }).eq('is_default', true)
    }

    const { data, error } = await supabaseAdmin
        .from('admin_pix_keys')
        .insert({
            pix_key: pixKey.trim(),
            pix_key_type: pixKeyType,
            receiver_name: receiverName?.trim() || null,
            is_default: shouldBeDefault,
            created_by: admin.id,
        })
        .select()
        .single()

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (shouldBeDefault) {
        await supabaseAdmin
            .from('store_access_settings')
            .update({
                pix_key: data.pix_key,
                pix_key_type: data.pix_key_type,
                pix_receiver_name: data.receiver_name,
                updated_at: new Date().toISOString(),
            })
            .eq('id', 1)
    }

    return NextResponse.json({ pixKey: data })
}
