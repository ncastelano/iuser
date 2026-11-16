// src/versions/registry.ts
//
// O que sobrou do sistema de VERSÕES DA INTERFACE. Desde 14/11/2026 só existe a 3.0 (a 2.0 foi aposentada e o código dela
// apagado em 16/11/2026): toda página abre dentro da casca (ModeShell), menos as listadas aqui. A pasta `versions/` continua
// sendo a camada de APRESENTAÇÃO (casca, barra, telas): `versions/v3/...` e `versions/shared/screens/...`.

/**
 * Mantêm a moldura própria (fora da casca): o link público do entregador (quem abre não é usuário do app) e os laboratórios.
 * Os mapas em tela cheia abrem na casca e começam abaixo dela (`--shell-top`, definido em ModeShell).
 */
export const SHELL_EXCLUDED = ['/entregador', '/paginateste', '/painel-teste']

/** Prefixo dos endereços internos antigos da 3.0 (`/v3/carrinho`...): links guardados são devolvidos ao endereço de verdade. */
export const LEGACY_INTERNAL_PREFIX = '/v3'
