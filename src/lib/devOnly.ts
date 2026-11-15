// src/lib/devOnly.ts — ferramentas de DESENVOLVIMENTO (observação em 3 telas): só existem com o app em modo de desenvolvimento apontando
// para o Supabase LOCAL (Docker). Em produção, staging ou preview tudo isto responde 404 / "indisponível". Nada aqui vale para dado real.
export const isLocalDevOnly = (): boolean =>
    process.env.NODE_ENV !== 'production' && /^http:\/\/(127\.0\.0\.1|localhost):\d+/.test(process.env.NEXT_PUBLIC_SUPABASE_URL || '')

/** Senha de teste das contas locais abertas pela página /tres-telas (definida por scripts/local/seed-motoboys.mjs, só no banco local) */
export const DEV_TEST_PASSWORD = 'Teste-local-24h'
export const DEV_STORE_SLUG = 'pizzaria-forno-de-ouro'
export const DEV_FEATURED_CLIENT_EMAIL = 'cliente-007@staging.iuser.test'
