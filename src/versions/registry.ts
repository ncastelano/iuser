// src/versions/registry.ts
//
// Fonte única da verdade das VERSÕES DE INTERFACE do iUser. A versão só decide a experiência de apresentação e de
// navegação (layout, navbar, drawer, páginas); identidade, papéis, plano, dados e regras de negócio não dependem dela.
//
// Adicionar uma versão nova: incluir o id em `UiVersion`, uma entrada em `UI_VERSIONS` e, se ela servir URLs que
// outra versão também serve, as rotas em `VERSION_ROUTES`. Nada mais no app precisa saber de condicionais de versão.

export type UiVersion = 'v2' | 'v3'

export interface UiVersionInfo {
    id: UiVersion
    /** Nome mostrado ao usuário (pode mudar sem afetar o id interno) */
    label: string
    /** Página inicial da versão */
    home: string
}

export const UI_VERSIONS: Record<UiVersion, UiVersionInfo> = {
    v2: { id: 'v2', label: 'iUser 2.0', home: '/' },
    v3: { id: 'v3', label: 'iUser 3.0', home: '/' },
}

/** Versão de quem nunca escolheu: a atual (estável). A 3.0 é uma escolha explícita. */
export const DEFAULT_VERSION: UiVersion = 'v2'

/** Cookie que guarda a escolha (funciona para visitantes e para o proxy, que roda antes da página) */
export const VERSION_COOKIE = 'iuser_ui'
export const VERSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

/** Chave em `feature_flags` que liga/desliga a oferta da versão 3.0 (o admin controla). Desligada = todos na v2. */
export const VERSION_FLAG_KEY = 'ui_v3'

/**
 * Rotas que existem nas duas versões com o MESMO endereço público. A v2 serve a página do próprio caminho; as demais
 * versões são servidas internamente por outro caminho (o proxy faz o rewrite, o endereço no navegador não muda).
 */
export const VERSION_ROUTES: Record<string, Partial<Record<UiVersion, string>>> = {
    '/': { v3: '/modeloinicial' },
    '/carrinho': { v3: '/v3/carrinho' },
    '/conversas': { v3: '/v3/conversas' },
}

/** Prefixo interno das implementações alternativas (nunca é o endereço "oficial": o proxy devolve ao canônico) */
export const INTERNAL_PREFIX: Partial<Record<UiVersion, string>> = { v3: '/v3' }

/** Páginas que só existem na v3 (não há equivalente na v2: voltar para a v2 leva à home da v2) */
export const V3_ONLY_ROUTES = ['/modeloinicial', '/painel-perfil', '/modoprestador']
export const V3_ONLY_PREFIXES = ['/painel-loja/', '/veiculo/']
