export interface Product {
    id: string
    store_id: string

    name: string
    description: string | null

    image_url: string | null

    price: number
    old_price: number | null

    is_available: boolean

    category: string | null

    likes_count: number
    comments_count: number
    views_count: number

    created_at: string
}

/**
 * PRODUTOS BASEADOS NAS LOJAS DO dadoDeLojas.ts
 */

export const dadosDosProdutos: Record<string, Product[]> = {

    /**
     * =========================
     * RESTAURANTES
     * =========================
     */

    'cantina-bella-italia': [
        {
            id: 'prod-001',
            store_id: '00000000-0000-0000-0000-000000000001',
            name: 'Lasanha à Bolonhesa',
            description: 'Camadas de massa fresca com molho artesanal da casa',
            image_url: 'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=800',
            price: 42.9,
            old_price: 55,
            is_available: true,
            category: 'Massas',
            likes_count: 120,
            comments_count: 34,
            views_count: 1500,
            created_at: '2026-01-01T10:00:00Z',
        },
        {
            id: 'prod-002',
            store_id: '00000000-0000-0000-0000-000000000001',
            name: 'Pizza Margherita',
            description: 'Molho artesanal, mozzarella e manjericão fresco',
            image_url: 'https://images.unsplash.com/photo-1548365328-9f547c1a2a42?w=800',
            price: 39.9,
            old_price: null,
            is_available: true,
            category: 'Pizzas',
            likes_count: 210,
            comments_count: 52,
            views_count: 3200,
            created_at: '2026-01-02T10:00:00Z',
        }
    ],

    'sabor-oriental': [
        {
            id: 'prod-003',
            store_id: '00000000-0000-0000-0000-000000000002',
            name: 'Sushi Combo 20 peças',
            description: 'Seleção especial com salmão, atum e hot roll',
            image_url: 'https://images.unsplash.com/photo-1553621042-f6e147245754?w=800',
            price: 69.9,
            old_price: 89.9,
            is_available: true,
            category: 'Japonesa',
            likes_count: 340,
            comments_count: 88,
            views_count: 4100,
            created_at: '2026-01-03T10:00:00Z',
        }
    ],

    'burger-mania': [
        {
            id: 'prod-004',
            store_id: '00000000-0000-0000-0000-000000000003',
            name: 'Double Bacon Burger',
            description: '2 carnes, cheddar duplo e bacon crocante',
            image_url: 'https://images.unsplash.com/photo-1550547660-d9450f859349?w=800',
            price: 28.9,
            old_price: 35,
            is_available: true,
            category: 'Burgers',
            likes_count: 530,
            comments_count: 120,
            views_count: 8000,
            created_at: '2026-01-03T10:00:00Z',
        },
        {
            id: 'prod-005',
            store_id: '00000000-0000-0000-0000-000000000003',
            name: 'Cheddar Supreme',
            description: 'Burger artesanal com cheddar cremoso',
            image_url: 'https://images.unsplash.com/photo-1550317138-10000687a72b?w=800',
            price: 24.9,
            old_price: null,
            is_available: true,
            category: 'Burgers',
            likes_count: 210,
            comments_count: 45,
            views_count: 3200,
            created_at: '2026-01-04T10:00:00Z',
        }
    ],

    'verde-vida': [
        {
            id: 'prod-006',
            store_id: '00000000-0000-0000-0000-000000000004',
            name: 'Bowl Detox Verde',
            description: 'Mix de folhas, quinoa e abacate',
            image_url: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800',
            price: 32.9,
            old_price: null,
            is_available: true,
            category: 'Saudável',
            likes_count: 180,
            comments_count: 22,
            views_count: 2100,
            created_at: '2026-01-05T10:00:00Z',
        }
    ],

    /**
     * =========================
     * MERCADOS
     * =========================
     */

    'supermercado-preco-bom': [
        {
            id: 'prod-007',
            store_id: '00000000-0000-0000-0000-000000000005',
            name: 'Arroz 5kg',
            description: 'Arroz branco tipo 1',
            image_url: 'https://images.unsplash.com/photo-1604909052743-94e838b7d4b5?w=800',
            price: 28.9,
            old_price: 32.9,
            is_available: true,
            category: 'Alimentos',
            likes_count: 90,
            comments_count: 10,
            views_count: 900,
            created_at: '2026-01-01T10:00:00Z',
        }
    ],

    'mercado-organico-natural': [
        {
            id: 'prod-008',
            store_id: '00000000-0000-0000-0000-000000000006',
            name: 'Granola Orgânica',
            description: 'Sem açúcar, rica em fibras',
            image_url: 'https://images.unsplash.com/photo-1606787366850-de6330128bfc?w=800',
            price: 19.9,
            old_price: null,
            is_available: true,
            category: 'Orgânicos',
            likes_count: 130,
            comments_count: 18,
            views_count: 1400,
            created_at: '2026-01-02T10:00:00Z',
        }
    ],

    'atacadao-express': [
        {
            id: 'prod-009',
            store_id: '00000000-0000-0000-0000-000000000007',
            name: 'Kit Limpeza Econômico',
            description: 'Pacote com detergente, sabão e desinfetante',
            image_url: 'https://images.unsplash.com/photo-1583947215259-38e31be8751f?w=800',
            price: 49.9,
            old_price: 59.9,
            is_available: true,
            category: 'Limpeza',
            likes_count: 70,
            comments_count: 9,
            views_count: 800,
            created_at: '2026-01-03T10:00:00Z',
        }
    ]
}