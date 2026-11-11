// app/(main)/modeloinicial/page.tsx
//
// Endereço antigo da página inicial da 3.0 (hoje servida em /v3 pelo rewrite de `/`): quem ainda tem o link salvo cai na home.
import { redirect } from 'next/navigation'

export default function ModeloInicialRedirect() {
    redirect('/')
}
