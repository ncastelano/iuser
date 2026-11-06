// Massa LOCAL para "o que está em alta" na busca da home: ~700 buscas de pessoas reais do banco, com palavras de comércio, serviço e gente
// (as mais populares aparecem mais). Idempotente: apaga as buscas anteriores marcadas pelo script e refaz. Só roda no banco LOCAL (docker).
//   node scripts/local/seed-buscas.mjs
import { execFileSync } from 'node:child_process'
const psql = (sql) => execFileSync('docker', ['exec', '-i', 'supabase_db_iuser-local', 'psql', '-U', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8' })
const TERMS = [['pizza', 30], ['farmacia', 24], ['eletricista', 22], ['marmita', 18], ['pintor', 16], ['diarista', 15], ['cabeleireiro', 14], ['mecanico', 13], ['acai', 12], ['pet shop', 11],
    ['bolo', 10], ['gas', 10], ['motoboy', 9], ['hamburguer', 9], ['encanador', 8], ['manicure', 8], ['mercado', 8], ['barbeiro', 7], ['aluguel', 7], ['cesta basica', 6], ['padaria', 6],
    ['dentista', 5], ['frete', 5], ['chaveiro', 5], ['pedreiro', 4], ['sorvete', 4], ['lanche', 4], ['agua', 3], ['conserto de celular', 3], ['personal trainer', 3]]
const pool = TERMS.flatMap(([t, w]) => Array(w).fill(t))
const R = (a) => a[Math.floor(Math.random() * a.length)]
psql(`delete from public.search_events where created_at > now() - interval '30 days'`)
const users = psql(`select id from profiles where is_active and address is not null order by random() limit 120`).trim().split('\n').filter(Boolean)
const vals = []
for (let i = 0; i < 700; i++) {
    const u = R(users)
    vals.push(`('${u}', '${R(pool)}', now() - (random() * interval '13 days'))`)
}
psql(`insert into public.search_events (user_id, term, city, state, created_at) select v.u::uuid, v.t, p.city, p.state, v.at from (values ${vals.join(',')}) v(u,t,at) cross join lateral public._search_place(v.u::uuid) p`)
console.log(psql(`select count(*) || ' buscas registradas' from public.search_events`).trim())
