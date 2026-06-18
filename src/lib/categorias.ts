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
} from 'lucide-react'

export interface Categoria {
    slug: string
    nome: string
    desc: string
    color: string
    icone: any // Componente do lucide-react
}

export const categorias: Categoria[] = [
    { slug: 'alimentacao', nome: 'Alimentação', desc: 'Restaurantes, mercados', color: '#f97316', icone: UtensilsCrossed },
    { slug: 'saude', nome: 'Saúde e Bem-estar', desc: 'Farmácias, fitness', color: '#eab308', icone: Heart },
    { slug: 'moda', nome: 'Moda e Beleza', desc: 'Roupas, salões', color: '#ec4899', icone: Shirt },
    { slug: 'casa', nome: 'Casa e Decoração', desc: 'Móveis, decoração', color: '#a855f7', icone: Home },
    { slug: 'eletronicos', nome: 'Eletrônicos e Tecnologia', desc: 'Celulares, acessórios', color: '#06b6d4', icone: Smartphone },
    { slug: 'servicos', nome: 'Serviços', desc: 'Mecânica, consertos', color: '#8b5cf6', icone: Wrench },
    { slug: 'pets', nome: 'Pet', desc: 'Pet shops e serviços', color: '#84cc16', icone: PawPrint },
    { slug: 'transporte', nome: 'Transporte e Logística', desc: 'Entregas, fretes', color: '#64748b', icone: Truck },
    { slug: 'social', nome: 'Social', desc: 'Perfis de pessoas', color: '#3b82f6', icone: Users },
]

// Mapa para acesso rápido por slug (útil nas páginas)
export const categoriasMap = Object.fromEntries(
    categorias.map(cat => [cat.slug, cat])
)