// scripts/test-postpaid-store-actions.mjs
// Testa as cobranças pós-pagas de loja (produto, publicação, agenda,
// agendamento) contra o Supabase real; cria dados temporários e apaga no final.
//   node scripts/test-postpaid-store-actions.mjs
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)] }))
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const stamp = Date.now()
const users = {}
let pass = 0, fail = 0
const check = (n, c, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n} ${c ? '' : x}`) }

async function mkUser(key) {
    const { data, error } = await admin.auth.admin.createUser({ email: `bench-${key}-${stamp}@example.invalid`, password: `Tmp-${stamp}A1!`, email_confirm: true })
    if (error) throw error
    await admin.from('profiles').update({ name: `Bench ${key}`, profileSlug: `bench-${key}-${stamp}` }).eq('id', data.user.id)
    users[key] = data.user.id
    return data.user.id
}
const debt = async (k) => Number((await admin.rpc('get_driver_postpaid_debt', { p_driver_id: users[k] })).data)
const mkStore = async (k) => {
    const { data, error } = await admin.from('stores').insert({ name: `Bench ${k}`, storeSlug: `bench-store-${k}-${stamp}`, owner_id: users[k] }).select('id').single()
    if (error) throw error
    return data.id
}
const mkProduct = (storeId, listing) => admin.from('products').insert({ name: 'b', slug: `b-${Math.random().toString(36).slice(2)}-${stamp}`, price: 1, type: 'physical', price_type: 'fixed', listing_type: listing, store_id: storeId }).select('id').single()

try {
    await mkUser('post'); await mkUser('month'); await mkUser('client')
    const { data: plan } = await admin.from('plans').select('id').eq('code', 'pos_pago').single()
    await admin.from('subscriptions').insert({ user_id: users.post, plan_id: plan.id, status: 'active', source: 'postpaid', current_period_end: '2099-12-31' })
    const sPost = await mkStore('post'), sMonth = await mkStore('month')

    console.log('Produto e publicação')
    await mkProduct(sPost, 'sale'); check('produto novo cobra R$ 0,50', (await debt('post')) === 0.5, `dívida ${await debt('post')}`)
    await mkProduct(sPost, 'publication'); check('publicação nova cobra R$ 0,50 (total 1,00)', (await debt('post')) === 1, `dívida ${await debt('post')}`)
    await mkProduct(sMonth, 'sale'); check('quem não é pós-pago não é cobrado', (await debt('month')) === 0)

    console.log('Agenda')
    await admin.from('stores').update({ allow_scheduling: true }).eq('id', sPost)
    check('ativar agenda cobra R$ 0,50 (total 1,50)', (await debt('post')) === 1.5, `dívida ${await debt('post')}`)
    await admin.from('stores').update({ allow_scheduling: false }).eq('id', sPost)
    await admin.from('stores').update({ allow_scheduling: true }).eq('id', sPost)
    check('desligar e ligar de novo NÃO cobra outra vez', (await debt('post')) === 1.5, `dívida ${await debt('post')}`)
    await admin.from('stores').update({ allow_scheduling: false, scheduling_activated_at: null }).eq('id', sPost)
    await admin.from('stores').update({ allow_scheduling: true, scheduling_activated_at: null }).eq('id', sPost)
    check('apagar o carimbo pelo cliente não burla a cobrança única', (await debt('post')) === 1.5, `dívida ${await debt('post')}`)
    await admin.from('stores').update({ allow_scheduling: true }).eq('id', sMonth)
    check('agenda de quem não é pós-pago não cobra', (await debt('month')) === 0)

    console.log('Agendamento')
    const base = { store_slug: 'x', store_name: 'x', customer_slug: 'c', owner_slug: 'x', date: '2099-01-01', time: '10:00', duration_minutes: 30, service_name: 's', service_type: 'service', people_count: 1, status: 'pending' }
    const ap = await admin.from('appointments').insert({ ...base, store_id: sPost, customer_id: users.client, owner_id: users.post, provider_profile_id: users.post, direction: 'outgoing' })
    check('cliente agenda na loja: cobra R$ 0,50 (total 2,00)', !ap.error && (await debt('post')) === 2, `${ap.error?.message} dívida ${await debt('post')}`)
    await admin.from('appointments').insert({ ...base, store_id: sPost, customer_id: users.client, owner_id: users.post, provider_profile_id: users.post, direction: 'incoming' })
    check('convite feito pela própria loja NÃO cobra', (await debt('post')) === 2, `dívida ${await debt('post')}`)

    console.log('Bloqueio por dívida (R$ 50)')
    await admin.from('stores').update({ allow_scheduling: false }).eq('id', sPost)
    await admin.from('driver_postpaid_charges').insert({ driver_id: users.post, type: 'ride_fee', amount: 48 })
    check('dívida chegou a R$ 50', (await debt('post')) === 50, `dívida ${await debt('post')}`)
    check('bloqueia (re)ativar a agenda', !!(await admin.from('stores').update({ allow_scheduling: true }).eq('id', sPost)).error)
    check('bloqueia produto novo', !!(await mkProduct(sPost, 'sale')).error)
    check('bloqueia publicação nova', !!(await mkProduct(sPost, 'publication')).error)
    const ap2 = await admin.from('appointments').insert({ ...base, store_id: sPost, customer_id: users.client, owner_id: users.post, provider_profile_id: users.post, direction: 'outgoing' })
    check('bloqueia cliente de agendar na loja', !!ap2.error)
    check('a dívida não mudou com os bloqueios', (await debt('post')) === 50)
    await admin.from('driver_postpaid_charges').insert({ driver_id: users.post, type: 'payment', amount: -10, asaas_payment_id: `bench-${stamp}` })
    check('depois de quitar parte, volta a poder criar produto', !(await mkProduct(sPost, 'sale')).error)
} catch (e) {
    fail++; console.log('ERRO', e.message || e)
} finally {
    const ids = Object.values(users)
    for (const id of ids) await admin.rpc('admin_delete_profile', { p_user_id: id }).then(() => {}, () => {})
    for (const id of ids) await admin.auth.admin.deleteUser(id)
    console.log(`\n${pass} passaram, ${fail} falharam`)
    process.exit(fail ? 1 : 0)
}
