// src/lib/alertSuppression.ts — REGRA ÚNICA de "aviso redundante": se a pessoa já está numa página que MOSTRA a coisa acontecendo (a lista de corridas,
// as entregas...), o aviso do mesmo assunto (faixa/ilha, som de aviso, notificação do aparelho) não deve aparecer por cima — ela já está vendo.
// Para silenciar um aviso em outra área: acrescente o tipo e as páginas aqui, e use `isAlertRedundant` onde o aviso é criado (e, para a
// notificação do aparelho, replique o prefixo em `public/sw.js`, que não importa TS — `npm run test:alert-suppression` confere que os dois batem).
export type SuppressibleAlert = 'new_ride'

/** Prefixos de endereço onde o assunto já está na tela */
export const ALERT_SEEN_ON: Record<SuppressibleAlert, readonly string[]> = {
    // As duas páginas já mostram as corridas/entregas abertas (a lista de /aceitar-corridas aparece sozinha, em tempo real)
    new_ride: ['/aceitar-corridas', '/entregas'],
}

export function isAlertRedundant(kind: SuppressibleAlert, pathname: string | null | undefined): boolean {
    if (!pathname) return false
    return ALERT_SEEN_ON[kind].some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}
