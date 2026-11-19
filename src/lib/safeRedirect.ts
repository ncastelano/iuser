// lib/safeRedirect.ts
//
// Para onde ir depois de entrar/terminar um cadastro (?redirect=, ?next=): SÓ caminho interno do iUser.
// Sem isso, um link como iuser.com.br/login?redirect=https://site-falso.com levava a pessoa, logo depois de digitar a
// senha, para uma página de golpe que imita o iUser (redirecionamento aberto). Recusa: endereço completo (http:, javascript:),
// "//outro-site" e "/\outro-site" (o navegador os trata como outro site) e caracteres de controle. Testado em npm run test:safe-redirect.
export function safeInternalPath(raw: string | null | undefined, fallback = '/'): string {
    if (typeof raw !== 'string') return fallback
    const p = raw.trim()
    if (!p.startsWith('/') || p.startsWith('//') || p.startsWith('/\\')) return fallback
    if (/[\u0000-\u001f\u007f\\]/.test(p)) return fallback
    if (p.length > 2000) return fallback
    return p
}
