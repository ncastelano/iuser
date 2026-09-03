import { supabase } from '@/lib/supabase/client'

/**
 * Lista de rotas e palavras reservadas do sistema que não podem ser usadas como slug
 */
export const RESERVED_SLUGS = new Set([
    'admin',
    'api',
    'auth',
    'sacola',
    'carrinho',
    'cart',
    'criar-loja',
    'criar-loja-com-cadastro',
    'criar-produto',
    'editar-loja',
    'editar-perfil',
    'editar-produto',
    'login',
    'registro',
    'register',
    'recuperar-senha',
    '404',
    '500',
    'lojas-em-destaque',
    'lojas',
    'produtos',
    'publicacoes',
    'radar',
    'convite',
    'compromissos',
    'dashboard',
    'configuracoes',
    'settings',
    'pedidos',
    'avaliacoes',
    'funcionarios',
    'agendamentos',
    'social',
    'comunidade',
    'pedir-motorista',
    'pedir-servico',
    'ser-parceiro-iuser',
    'inicio',
    'catalogo',
    'suporte',
    'ajuda',
    'termos',
    'privacidade',
    'sobre',
    'perfil',
    'profile',
    'store',
    'loja',
    'app',
])

/**
 * Converte qualquer texto para formato de slug válido (kebab-case limpo)
 */
export function sanitizeSlug(text: string): string {
    if (!text) return ''
    return text
        .toString()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // remove acentos
        .replace(/[^a-z0-9]+/g, '-') // substitui caracteres não alfanuméricos por hífen
        .replace(/^-+|-+$/g, '') // remove hífens do início e do final
        .slice(0, 60) // limita tamanho máximo
}

export type SlugConflictType = 'reserved' | 'profile' | 'store' | 'product' | 'publication'

export interface SlugAvailabilityResult {
    available: boolean
    conflictType?: SlugConflictType
    message?: string
}

export interface SlugCheckOptions {
    excludeProfileId?: string | null
    excludeStoreId?: string | null
    excludeProductId?: string | null
}

/**
 * Verifica se um slug está disponível globalmente:
 * - Não pode ser uma rota reservada do sistema
 * - Não pode existir em profiles (profileSlug)
 * - Não pode existir em stores (storeSlug)
 * - Não pode existir em products (slug)
 */
export async function checkSlugAvailability(
    slug: string,
    options?: SlugCheckOptions
): Promise<SlugAvailabilityResult> {
    const clean = sanitizeSlug(slug)

    if (!clean) {
        return { available: false, message: 'Slug inválido ou vazio' }
    }

    // 1. Verificar palavras reservadas
    if (RESERVED_SLUGS.has(clean)) {
        return {
            available: false,
            conflictType: 'reserved',
            message: 'Este endereço é reservado pelo sistema.',
        }
    }

    try {
        // 2. Verificar na tabela profiles (profileSlug)
        let profileQuery = supabase
            .from('profiles')
            .select('id')
            .eq('profileSlug', clean)
            .limit(1)

        if (options?.excludeProfileId) {
            profileQuery = profileQuery.neq('id', options.excludeProfileId)
        }

        const { data: profileData } = await profileQuery.maybeSingle()
        if (profileData) {
            return {
                available: false,
                conflictType: 'profile',
                message: 'Este link já está em uso por um perfil.',
            }
        }

        // 3. Verificar na tabela stores (storeSlug)
        let storeQuery = supabase
            .from('stores')
            .select('id')
            .eq('storeSlug', clean)
            .limit(1)

        if (options?.excludeStoreId) {
            storeQuery = storeQuery.neq('id', options.excludeStoreId)
        }

        const { data: storeData } = await storeQuery.maybeSingle()
        if (storeData) {
            return {
                available: false,
                conflictType: 'store',
                message: 'Este link já está em uso por uma loja.',
            }
        }

        // 4. Verificar na tabela products (slug)
        let productQuery = supabase
            .from('products')
            .select('id, listing_type')
            .eq('slug', clean)
            .limit(1)

        if (options?.excludeProductId) {
            productQuery = productQuery.neq('id', options.excludeProductId)
        }

        const { data: productData } = await productQuery.maybeSingle()
        if (productData) {
            const isPublication = productData.listing_type === 'publication'
            return {
                available: false,
                conflictType: isPublication ? 'publication' : 'product',
                message: isPublication
                    ? 'Este link já está em uso por uma publicação.'
                    : 'Este link já está em uso por um produto.',
            }
        }

        return { available: true }
    } catch (error: any) {
        console.error('Erro ao verificar disponibilidade de slug:', error)
        // Em caso de erro na consulta, não autoriza cegamente
        return {
            available: false,
            message: 'Erro ao verificar disponibilidade. Tente novamente.',
        }
    }
}

/**
 * Gera um slug único no sistema a partir de um texto base.
 * Testa iterativamente sufixos (-1, -2, ...) e números aleatórios até encontrar um disponível globalmente.
 */
export async function generateUniqueGlobalSlug(
    baseName: string,
    options?: SlugCheckOptions
): Promise<string> {
    const baseSlug = sanitizeSlug(baseName) || 'item'

    // Testa o slug base original
    const initialCheck = await checkSlugAvailability(baseSlug, options)
    if (initialCheck.available) {
        return baseSlug
    }

    // Tenta sequencialmente baseSlug-1 até baseSlug-10
    for (let counter = 1; counter <= 10; counter++) {
        const candidate = `${baseSlug}-${counter}`
        const check = await checkSlugAvailability(candidate, options)
        if (check.available) {
            return candidate
        }
    }

    // Se ainda houver colisão, gera com sufixo aleatório
    let attempts = 0
    while (attempts < 20) {
        const randomSuffix = Math.floor(1000 + Math.random() * 9000)
        const candidate = `${baseSlug}-${randomSuffix}`
        const check = await checkSlugAvailability(candidate, options)
        if (check.available) {
            return candidate
        }
        attempts++
    }

    // Fallback de segurança com timestamp
    return `${baseSlug}-${Date.now().toString().slice(-6)}`
}

/**
 * Retorna sugestões de slugs disponíveis baseados no slug solicitado.
 */
export async function getSlugSuggestions(
    baseSlug: string,
    count: number = 3,
    options?: SlugCheckOptions
): Promise<string[]> {
    const clean = sanitizeSlug(baseSlug)
    if (!clean) return []

    const cleanBase = clean.replace(/-?\d+$/, '') || clean
    const suggestions: string[] = []
    let counter = 1

    while (suggestions.length < count && counter < 50) {
        const candidate = `${cleanBase}-${counter}`
        const check = await checkSlugAvailability(candidate, options)
        if (check.available && !suggestions.includes(candidate)) {
            suggestions.push(candidate)
        }
        counter++
    }

    return suggestions
}
