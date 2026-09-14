// src/app/(main)/[ownerSlug]/criar-produto/page.tsx
//
// Client component (não dá pra checar dono no servidor aqui - o cliente
// supabase do projeto é o de browser, sem sessão disponível em Server
// Component; ver CriarProdutoClient.tsx, que resolve a loja e confere o
// dono usando a sessão do próprio navegador, igual todo o resto do app).
import { CriarProdutoClient } from './CriarProdutoClient'

export default function CriarProdutoPage() {
    return <CriarProdutoClient />
}
