// app/api/admin/delivery-rules/route.ts
//
// Admin → Entregas → "Prazos e limites da operação" (18/11/2026): lê e muda os prazos e limites que antes só mudavam por SQL (ciclo do pedido, pedido esperando
// entregador, caixa do entregador, liberação do dinheiro e Pós-pago). Só o administrador geral; o id dele vem do login, nunca do corpo. A mesma validação da tela
// (modules/delivery-rules) roda aqui e o banco ainda confere (admin_update_delivery_rules + os CHECKs de cada tabela; cada valor mudado vai para a auditoria).
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/adminAuth'
import { RULE_GROUPS, validateRules, type RulesGroup, type RulesValues } from '@/modules/delivery-rules'

export async function POST(req: Request) {
    const admin = await requireSuperAdmin(req)
    if (!admin) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    const body = await req.json().catch(() => ({}))
    if (body?.action === 'load') {
        const { data, error } = await supabaseAdmin.rpc('admin_get_delivery_rules')
        if (error) return NextResponse.json({ error: 'Não foi possível carregar.' }, { status: 500 })
        return NextResponse.json({ rules: data })
    }
    if (body?.action !== 'update') return NextResponse.json({ error: 'Ação inválida' }, { status: 400 })
    const group = String(body.group || '') as RulesGroup
    const def = RULE_GROUPS.find((g) => g.id === group)
    if (!def || !body.patch || typeof body.patch !== 'object') return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 })
    // só os campos do grupo, com valor número/booleano/nulo
    const patch: RulesValues = {}
    for (const f of def.fields) {
        if (!(f.key in body.patch)) continue
        const v = body.patch[f.key]
        if (v !== null && typeof v !== 'number' && typeof v !== 'boolean') return NextResponse.json({ error: `Valor inválido em ${f.label}` }, { status: 400 })
        patch[f.key] = v
    }
    if (!Object.keys(patch).length) return NextResponse.json({ error: 'Nada para mudar' }, { status: 400 })
    // valida o grupo inteiro já com as mudanças (as regras que comparam campos precisam dos dois)
    const { data: cur } = await supabaseAdmin.rpc('admin_get_delivery_rules')
    const merged = { ...((cur as any)?.[group] || {}), ...patch } as RulesValues
    const errors = validateRules(group, merged)
    if (Object.keys(errors).length) return NextResponse.json({ error: 'Há campos para corrigir', errors }, { status: 400 })
    const { data, error } = await supabaseAdmin.rpc('admin_update_delivery_rules', { p_group: group, p_patch: patch, p_admin: admin.id })
    if (error) return NextResponse.json({ error: error.code === '22023' ? error.message : 'Não foi possível salvar. Tente de novo.' }, { status: error.code === '22023' ? 400 : 500 })
    return NextResponse.json({ ok: true, changed: (data as any)?.changed ?? 0, rules: (data as any)?.rules })
}
