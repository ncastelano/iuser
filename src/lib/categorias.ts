// lib/categorias.ts
import {
    UtensilsCrossed,
    Heart,
    Shirt,
    Home,
    Smartphone,
    Wrench,
    PawPrint,
    Truck,
    Users,
    Pill,
    MessageCircle,
} from 'lucide-react'

export interface Categoria {
    slug: string
    nome: string
    desc: string
    color: string
    icone: any // Componente do lucide-react
}

export const categorias: Categoria[] = [
    {
        slug: 'alimentacao',
        nome: 'Alimentação',
        desc: 'Restaurantes, mercados',
        color: '#f97316',
        icone: UtensilsCrossed
    },
    {
        slug: 'saude',
        nome: 'Saúde e Bem-estar',
        desc: 'Farmácias, fitness',
        color: '#eab308',   // amarelo
        icone: Pill        // agora é uma pílula
    },
    {
        slug: 'moda',
        nome: 'Moda e Beleza',
        desc: 'Roupas, salões',
        color: '#ec4899',
        icone: Shirt
    },
    {
        slug: 'casa',
        nome: 'Casa e Decoração',
        desc: 'Móveis, decoração',
        color: '#a855f7',
        icone: Home
    },
    {
        slug: 'eletronicos',
        nome: 'Eletrônicos e Tecnologia',
        desc: 'Celulares, acessórios',
        color: '#06b6d4',
        icone: Smartphone
    },
    {
        slug: 'servicos',
        nome: 'Serviços',
        desc: 'Mecânica, consertos',
        color: '#8b5cf6',
        icone: Wrench
    },
    {
        slug: 'pets',
        nome: 'Pet',
        desc: 'Pet shops e serviços',
        color: '#84cc16',
        icone: PawPrint
    },
    {
        slug: 'transporte',
        nome: 'Transporte e Logística',
        desc: 'Entregas, fretes',
        color: '#64748b',
        icone: Truck
    },
    {
        slug: 'social',
        nome: 'Social',
        desc: 'Perfis de pessoas',
        color: '#3b82f6',
        icone: Users
    },
    {
        slug: 'comunidades',
        nome: 'Comunidades',
        desc: 'Salas de conversa por cidade',
        color: '#14b8a6',
        icone: MessageCircle
    }
]

// Mapa para acesso rápido por slug (útil nas páginas)
export const categoriasMap = Object.fromEntries(
    categorias.map(cat => [cat.slug, cat])
)

// stores.category às vezes foi salvo como slug ("servicos") e às vezes como
// nome de exibição ("Serviços"), dependendo de qual tela criou a loja. Usar
// só categoriasMap[store.category] falha silenciosamente pra metade dos
// casos — isso resolve os dois formatos pra sempre cair na mesma Categoria
// canônica (essencial pra deduplicar filtros e badges).
export function resolveCategoria(value?: string | null): Categoria | undefined {
    if (!value) return undefined
    if (categoriasMap[value]) return categoriasMap[value]
    const normalized = value.trim().toLowerCase()
    return categorias.find(cat => cat.nome.toLowerCase() === normalized)
}