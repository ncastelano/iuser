import type { Metadata } from 'next'

// Página de um agendamento compartilhado: privada por padrão, não deve aparecer em buscadores.
export const metadata: Metadata = {
    title: 'Compromisso | iUser',
    robots: { index: false, follow: false },
}

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
