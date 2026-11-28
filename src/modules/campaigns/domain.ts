// Regras puras dos avisos (campanhas de push). O banco confere de novo (campaign_create); aqui só se avisa antes.
// Testes: npm run test:campaigns

export const CAMPAIGN_TITLE_MIN = 2
export const CAMPAIGN_TITLE_MAX = 80
export const CAMPAIGN_BODY_MAX = 240
export const CAMPAIGN_URL_MAX = 300

export type CampaignAudience = 'all' | 'lojistas' | 'people' | 'store_followers' | 'store_customers'
export const ADMIN_AUDIENCES: CampaignAudience[] = ['all', 'lojistas', 'people']
export const STORE_AUDIENCES: CampaignAudience[] = ['store_followers', 'store_customers', 'people']

/** Mensagem para a pessoa, ou null quando está certo. */
export function validateCampaign(input: { title: string; body: string; url: string }): string | null {
    const title = input.title.trim()
    const body = input.body.trim()
    const url = input.url.trim()
    if (title.length < CAMPAIGN_TITLE_MIN || title.length > CAMPAIGN_TITLE_MAX) return `O título tem que ter de ${CAMPAIGN_TITLE_MIN} a ${CAMPAIGN_TITLE_MAX} letras.`
    if (body.length < 1 || body.length > CAMPAIGN_BODY_MAX) return `O texto tem até ${CAMPAIGN_BODY_MAX} letras.`
    if (!/^\/[^/]/.test(url) || url.length > CAMPAIGN_URL_MAX) return 'O link tem que ser uma página do iUser (começa com /).'
    return null
}

/** Uma loja só fala com o próprio público. */
export function audienceAllowed(audience: CampaignAudience, asAdmin: boolean): boolean {
    return (asAdmin ? ADMIN_AUDIENCES : STORE_AUDIENCES).includes(audience)
}
