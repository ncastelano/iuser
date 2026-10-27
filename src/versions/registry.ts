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

/** Chave em `feature_flags`: 3.0 liberada para TODOS (o admin controla). Desligada, só quem o admin liberou (tabela ui_v3_access) a vê. */
export const VERSION_FLAG_KEY = 'ui_v3'

/**
 * Rotas que existem nas duas versões com o MESMO endereço público. A v2 serve a página do próprio caminho; as demais
 * versões são servidas internamente por outro caminho (o proxy faz o rewrite, o endereço no navegador não muda).
 */
export const VERSION_ROUTES: Record<string, Partial<Record<UiVersion, string>>> = {
    '/': { v3: '/v3' },
    '/carrinho': { v3: '/v3/carrinho' },
    '/conversas': { v3: '/v3/conversas' },
    '/lojas': { v3: '/v3/lojas' },
    '/solicitar-servico': { v3: '/v3/solicitar-servico' },
    '/pedir-motorista': { v3: '/v3/pedir-motorista' },
    '/radar': { v3: '/v3/radar' },
}

/** Prefixo interno das implementações alternativas (nunca é o endereço "oficial": o proxy devolve ao canônico) */
export const INTERNAL_PREFIX: Partial<Record<UiVersion, string>> = { v3: '/v3' }

/**
 * Mantêm a moldura própria mesmo na 3.0: só o link público do entregador (quem abre não é usuário do app). Os mapas
 * em tela cheia abrem na casca e começam abaixo da navbar (`--shell-top`, definido em ShellFrame).
 */
export const SHELL_EXCLUDED = ['/entregador']

/** Páginas que só existem na v3 (não há equivalente na v2: voltar para a v2 leva à home da v2) */
export const V3_ONLY_ROUTES = ['/painel-perfil', '/modoprestador', '/comprar', '/imoveis', '/anunciar-imovel', '/meus-imoveis', '/flash', '/pessoas']
export const V3_ONLY_PREFIXES = ['/painel-loja/', '/editar-loja/', '/veiculo/', '/imoveis/']
