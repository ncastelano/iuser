// Ir a um endereço com FOCO (?pedido=, ?corrida=, ?secao=) — inclusive quando a pessoa JÁ está nessa página: o Next só troca o endereço e
// as telas que leem o foco direto da URL não ficariam sabendo. Por isso, depois de navegar, avisa com o evento `iuser-urlchange`.
export const URL_CHANGE_EVENT = 'iuser-urlchange'

export function goWithFocus(router: { push: (href: string) => void }, path: string) {
    router.push(path)
    for (const t of [60, 250, 600]) setTimeout(() => window.dispatchEvent(new Event(URL_CHANGE_EVENT)), t)
}
