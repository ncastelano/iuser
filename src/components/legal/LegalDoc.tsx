// components/legal/LegalDoc.tsx
//
// Moldura dos textos legais (/termos e /privacidade): cartão claro e legível em qualquer tema, com índice.
// Os dados da EMPRESA (razão social, CNPJ, endereço, encarregado) moram em LEGAL_ENTITY: enquanto estiverem vazios a linha
// simplesmente não aparece — PREENCHA antes de comercializar (e passe os textos por um advogado).
import type { ReactNode } from 'react'

export const LEGAL_ENTITY = {
    /** razão social de quem opera o iUser (pessoa jurídica) */
    company: '',
    /** CNPJ */
    cnpj: '',
    /** endereço da sede */
    address: '',
    /** nome do encarregado de dados (DPO, LGPD art. 41) — pode ser o próprio dono */
    dpoName: '',
    /** canal de contato (privacidade, suporte, notificações) */
    email: 'contato@iuser.com.br',
    /** cidade do foro, para quem NÃO é consumidor (o consumidor sempre pode usar o foro da casa dele) */
    forumCity: 'Porto Velho/RO',
}

export function LegalDoc({ title, updated, intro, children }: { title: string; updated: string; intro: ReactNode; children: ReactNode }) {
    const e = LEGAL_ENTITY
    const who = [e.company, e.cnpj && `CNPJ ${e.cnpj}`, e.address].filter(Boolean).join(' · ')
    return (
        <main className="px-4 py-6 sm:py-10" style={{ background: 'transparent' }}>
            <article className="max-w-3xl mx-auto rounded-3xl px-5 py-8 sm:px-10 sm:py-10 shadow-sm" style={{ background: '#ffffff', color: '#262626', border: '1px solid #e5e5e5' }}>
                <h1 className="text-2xl sm:text-3xl font-black mb-1">{title}</h1>
                <p className="text-xs mb-6" style={{ color: '#737373' }}>Última atualização: {updated}{who ? ` · ${who}` : ''}</p>
                <div className="text-[15px] leading-relaxed mb-6">{intro}</div>
                <div className="flex flex-col gap-6 text-[15px] leading-relaxed">{children}</div>
                <p className="text-sm mt-10 pt-6" style={{ borderTop: '1px solid #e5e5e5', color: '#525252' }}>
                    Dúvidas, pedidos ou notificações: <a href={`mailto:${e.email}`} className="font-bold underline" style={{ color: '#ea580c' }}>{e.email}</a>.
                    {' '}Veja também: <a href="/termos" className="underline">Termos de Uso</a> · <a href="/privacidade" className="underline">Política de Privacidade</a>.
                </p>
            </article>
        </main>
    )
}

export function Sec({ n, title, children }: { n: number | string; title: string; children: ReactNode }) {
    return (
        <section id={`s${n}`}>
            <h2 className="text-lg font-black mb-2">{n}. {title}</h2>
            <div className="flex flex-col gap-2">{children}</div>
        </section>
    )
}

export function Ul({ children }: { children: ReactNode }) {
    return <ul className="list-disc pl-5 flex flex-col gap-1.5">{children}</ul>
}
