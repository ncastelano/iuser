// src/app/(main)/[ownerSlug]/[slug]/editar/page.tsx
//
// Client component (não dá pra checar dono no servidor aqui - o cliente
// supabase do projeto é o de browser, sem sessão disponível em Server
// Component; ver EditProductClient.tsx, que busca o produto e confere o
// dono usando a sessão do próprio navegador, igual todo o resto do app).
import { EditProductClient } from './EditProductClient'

export default function EditProductPage() {
    return <EditProductClient />
}
