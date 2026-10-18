// Prova de exposição por REST (Etapa 2.7.1): o que anon — e, se EXPOSURE_USER_JWT for dado, um usuário logado SEM
// vínculo — consegue ler/escrever em profiles/stores/Pix/RPCs pela API pública (PostgREST), como um atacante faria.
// Não imprime nenhum valor de dado: só status, contagem e código de erro. Usa só a chave PÚBLICA (anon/publishable).
//   node scripts/test-security-exposure-rest.mjs                       (anon)
//   EXPOSURE_USER_JWT=<token de um usuário de teste> node scripts/...   (anon + estranho)
// Credenciais: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY do ambiente ou de .env.local. Nada fica no repo.
import fs from 'node:fs'
const fileEnv = fs.existsSync('.env.local') ? Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>[l.slice(0,l.indexOf('=')), l.slice(l.indexOf('=')+1).trim().replace(/^"|"$/g,'')])) : {}
const env = { ...fileEnv, ...process.env }
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
const get = async (p) => { const r = await fetch(`${URL_}/rest/v1/${p}`, { headers: H }); const t = await r.text(); let n = null; try { const j = JSON.parse(t); n = Array.isArray(j) ? j.length : null; return { s: r.status, n, code: j.code } } catch { return { s: r.status, n } } }
const send = async (m, p, body) => { const r = await fetch(`${URL_}/rest/v1/${p}`, { method: m, headers: { ...H, Prefer: 'return=minimal' }, body: body ? JSON.stringify(body) : undefined }); return r.status }
const rows = []
const t = (name, res, ok) => rows.push(`${ok(res) ? 'PASS' : 'FAIL'}  ${name}  ->  ${JSON.stringify(res)}`)
const deny = (r) => r.s === 401 || r.s === 403
// descobre um id/slug público real
const pub = await get('profiles?select=id,profileSlug&limit=1'); 
const one = JSON.parse(await (await fetch(`${URL_}/rest/v1/profiles?select=id,profileSlug&limit=1`, { headers: H })).text())[0]
const store = JSON.parse(await (await fetch(`${URL_}/rest/v1/stores?select=id,storeSlug&limit=1`, { headers: H })).text())[0]
t('anon: profiles público (id,name,slug) funciona', await get('profiles?select=id,name,profileSlug,avatar_url,public_address&limit=3'), (r) => r.s === 200 && r.n > 0)
for (const c of ['pix_key','pix_key_type','email','cpf_cnpj','whatsapp','address','address_number','address_complement','store_lat','store_lng','location','available_balance','is_admin','cart_data','privacy_settings']) t(`anon: profiles.${c}`, await get(`profiles?select=${c}&limit=1`), deny)
t('anon: profiles select=*', await get('profiles?select=*&limit=1'), deny)
t('anon: filtrar profiles por email (oráculo)', await get('profiles?select=id&email=eq.x@y.z'), deny)
t('anon: filtrar profiles por cpf_cnpj (oráculo)', await get('profiles?select=id&cpf_cnpj=eq.00000000000'), deny)
t('anon: ordenar profiles por pix_key', await get('profiles?select=id&order=pix_key'), deny)
t('anon: enumeração por UUID só devolve campos públicos', await get(`profiles?select=id,name,profileSlug&id=eq.${one.id}`), (r) => r.s === 200 && r.n === 1)
t('anon: enumeração por UUID pedindo pix_key', await get(`profiles?select=pix_key&id=eq.${one.id}`), deny)
t('anon: enumeração por slug pedindo email', await get(`profiles?select=email&profileSlug=eq.${one.profileSlug}`), deny)
t('anon: stores público funciona', await get('stores?select=id,name,storeSlug,logo_url&limit=3'), (r) => r.s === 200 && r.n > 0)
for (const c of ['pix_key','pix_key_type','whatsapp','whatsapp_bot_phone_number_id','access_expires_at','access_grant_id']) t(`anon: stores.${c}`, await get(`stores?select=${c}&limit=1`), deny)
t('anon: stores select=*', await get('stores?select=*&limit=1'), deny)
t('anon: stores por id pedindo pix_key', await get(`stores?select=pix_key&id=eq.${store.id}`), deny)
t('anon: stores filtrar por pix_key', await get('stores?select=id&pix_key=eq.x'), deny)
t('anon: my_profile', await get('my_profile?select=*'), deny)
t('anon: my_stores', await get('my_stores?select=*'), deny)
t('anon: driver_payout_keys', await get('driver_payout_keys?select=*'), (r) => deny(r) || r.n === 0)
t('anon: admin_pix_keys', await get('admin_pix_keys?select=*'), (r) => deny(r) || r.n === 0)
t('anon: store_access_settings', await get('store_access_settings?select=*'), (r) => deny(r) || r.n === 0)
t('anon: withdrawal_requests', await get('withdrawal_requests?select=*'), (r) => deny(r) || r.n === 0)
t('anon: employees', await get('employees?select=*'), (r) => deny(r) || r.n === 0)
t('anon: native_push_tokens', await get('native_push_tokens?select=*'), (r) => deny(r) || r.n === 0)
for (const [fn, body] of [['get_profile_whatsapp', { p_profile: one.id }], ['get_store_whatsapp', { p_store: store.id }], ['get_store_order_whatsapp', { p_store: store.id }], ['get_ride_applicant_locations', { p_ride: store.id }], ['get_delivery_payment_view', { p_dispatch: store.id }], ['get_employee_deliveries', { p_employee_id: one.id, p_token: 'x' }], ['get_downline_with_commissions', { user_id: one.id, max_depth: 2 }]]) {
  const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, { method: 'POST', headers: H, body: JSON.stringify(body) }); rows.push(`${[401,403,404].includes(r.status) ? 'PASS' : 'FAIL'}  anon: rpc ${fn}  ->  ${r.status}`)
}
t('anon: PATCH profiles', { s: await send('PATCH', `profiles?id=eq.${one.id}`, { name: 'x' }) }, (r) => [401,403].includes(r.s))
t('anon: PATCH stores', { s: await send('PATCH', `stores?id=eq.${store.id}`, { name: 'x' }) }, (r) => [401,403].includes(r.s))
t('anon: DELETE profiles', { s: await send('DELETE', `profiles?id=eq.${one.id}`) }, (r) => [401,403].includes(r.s))
t('anon: busca pública (rpc search_profiles_unaccented) sem campo privado', await (async () => { const r = await fetch(`${URL_}/rest/v1/rpc/search_profiles_unaccented`, { method: 'POST', headers: H, body: JSON.stringify({ search_term: 'a' }) }); const j = await r.json(); const keys = new Set(j.flatMap((x) => Object.keys(x))); return { s: r.status, hasPrivate: ['pix_key','email','cpf_cnpj','whatsapp','address'].filter((k) => keys.has(k)) } })(), (r) => r.s === 200 && r.hasPrivate.length === 0)

// ---------------- usuário logado SEM vínculo (opcional) ----------------
if (env.EXPOSURE_USER_JWT) {
  const AH = { ...H, Authorization: `Bearer ${env.EXPOSURE_USER_JWT}` }
  const ag = async (p) => { const r = await fetch(`${URL_}/rest/v1/${p}`, { headers: AH }); const x = await r.text(); let n = null, code; try { const j = JSON.parse(x); n = Array.isArray(j) ? j.length : null; code = j.code } catch {} return { s: r.status, n, code } }
  const me = JSON.parse(await (await fetch(`${URL_}/rest/v1/my_profile?select=id`, { headers: AH })).text())[0]
  const other = JSON.parse(await (await fetch(`${URL_}/rest/v1/profiles?select=id&id=neq.${me.id}&limit=1`, { headers: AH })).text())[0]
  for (const c of ['pix_key','email','cpf_cnpj','whatsapp','address','store_lat','available_balance','is_admin']) t(`estranho: profiles.${c} de outro`, await ag(`profiles?select=${c}&id=eq.${other.id}`), deny)
  t('estranho: profiles select=*', await ag('profiles?select=*&limit=1'), deny)
  t('estranho: filtra profiles por pix_key', await ag('profiles?select=id&pix_key=eq.x'), deny)
  for (const c of ['pix_key','whatsapp','whatsapp_bot_phone_number_id','access_expires_at']) t(`estranho: stores.${c}`, await ag(`stores?select=${c}&limit=1`), deny)
  t('estranho: stores select=*', await ag('stores?select=*&limit=1'), deny)
  t('estranho: my_profile só a própria linha', await ag('my_profile?select=id'), (r) => r.s === 200 && r.n === 1)
  for (const c of ['is_admin','available_balance','level','status_id','is_blocked','pix_key']) {
    const r = await fetch(`${URL_}/rest/v1/profiles?id=eq.${me.id}`, { method: 'PATCH', headers: { ...AH, Prefer: 'return=minimal' }, body: JSON.stringify({ [c]: c.startsWith('is_') ? true : 1 }) })
    rows.push(`${[401,403].includes(r.status) ? 'PASS' : 'FAIL'}  dono: PATCH próprio ${c}  ->  ${r.status}`)
  }
  for (const tb of ['driver_payout_keys','admin_pix_keys','employees']) t(`estranho: ${tb}`, await ag(`${tb}?select=*`), (r) => deny(r) || r.n === 0)
}
console.log(rows.join('\n')); const fails = rows.filter((x) => x.startsWith('FAIL')).length
console.log(`\nTOTAL fails=${fails} passes=${rows.length - fails}`)
process.exit(fails ? 1 : 0)
