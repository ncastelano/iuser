//app/(main)/inicio/dadoDeLojas.ts

export interface Store {
    id: string;
    name: string;
    storeSlug: string;
    description: string | null;
    logo_url: string | null;
    banner_url: string | null;
    owner_id: string | null;
    is_open: boolean;
    is_active: boolean;
    opening_hours: Record<string, any> | null;
    meta_title: string | null;
    meta_description: string | null;
    ratings_avg: number;
    ratings_count: number;
    prep_time_min: number | null;
    prep_time_max: number | null;
    price_min: number | null;
    price_max: number | null;
    created_at: string;
    location: any | null;
    calendar_url: string | null;
    whatsapp: string | null;
    address: string | null;
    business_hours: Record<string, any> | null;
}

/**
 * PROFILES (referência dos donos)
 */
const NATAN_ID = "550e8400-e29b-41d4-a716-446655440001";
const LUCAS_ID = "550e8400-e29b-41d4-a716-446655440002";
const MARIANA_ID = "550e8400-e29b-41d4-a716-446655440003";
const JOAO_ID = "550e8400-e29b-41d4-a716-446655440004";
const BEATRIZ_ID = "550e8400-e29b-41d4-a716-446655440005";
const CARLOS_ID = "550e8400-e29b-41d4-a716-446655440006";
const FERNANDA_ID = "550e8400-e29b-41d4-a716-446655440007";
const RAFAEL_ID = "550e8400-e29b-41d4-a716-446655440008";
const JULIANA_ID = "550e8400-e29b-41d4-a716-446655440009";
const DIEGO_ID = "550e8400-e29b-41d4-a716-446655440010";

export const dadosMockados: Record<string, Store[]> = {
    restaurantes: [
        {
            id: "00000000-0000-0000-0000-000000000001",
            name: "Cantina Bella Italia",
            storeSlug: "cantina-bella-italia",
            description: "Massas artesanais, pizzas de forno a lenha e vinhos selecionados",
            logo_url: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800",
            banner_url: null,
            owner_id: NATAN_ID,
            is_open: true,
            is_active: true,
            opening_hours: null,
            meta_title: null,
            meta_description: null,
            ratings_avg: 4.8,
            ratings_count: 152,
            prep_time_min: 20,
            prep_time_max: 30,
            price_min: 30.0,
            price_max: 120.0,
            created_at: "2025-01-15T10:30:00.000Z",
            location: null,
            calendar_url: null,
            whatsapp: null,
            address: null,
            business_hours: null,
        },
        {
            id: "00000000-0000-0000-0000-000000000002",
            name: "Sabor Oriental",
            storeSlug: "sabor-oriental",
            description: "Culinária japonesa e tailandesa com ingredientes frescos",
            logo_url: "https://images.unsplash.com/photo-1617196034796-73dfa7b1fd56?w=800",
            owner_id: LUCAS_ID,
            banner_url: null,
            is_open: true,
            is_active: true,
            opening_hours: null,
            meta_title: null,
            meta_description: null,
            ratings_avg: 4.6,
            ratings_count: 98,
            prep_time_min: 25,
            prep_time_max: 35,
            price_min: 25.0,
            price_max: 95.0,
            created_at: "2025-01-15T10:30:00.000Z",
            location: null,
            calendar_url: null,
            whatsapp: null,
            address: null,
            business_hours: null,
        },
        {
            id: "00000000-0000-0000-0000-000000000003",
            name: "Burger Mania",
            storeSlug: "burger-mania",
            description: "Hambúrgueres gourmet, batatas rústicas e milk-shakes",
            logo_url: "https://images.unsplash.com/photo-1550547660-d9450f859349?w=800",
            owner_id: MARIANA_ID,
            banner_url: null,
            is_open: true,
            is_active: true,
            opening_hours: null,
            meta_title: null,
            meta_description: null,
            ratings_avg: 4.5,
            ratings_count: 210,
            prep_time_min: 15,
            prep_time_max: 25,
            price_min: 15.0,
            price_max: 50.0,
            created_at: "2025-01-15T10:30:00.000Z",
            location: null,
            calendar_url: null,
            whatsapp: null,
            address: null,
            business_hours: null,
        },
        {
            id: "00000000-0000-0000-0000-000000000004",
            name: "Verde Vida",
            storeSlug: "verde-vida",
            description: "Comida vegana e saudável, saladas, bowls e sucos naturais",
            logo_url: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800",
            owner_id: NATAN_ID,
            banner_url: null,
            is_open: true,
            is_active: true,
            opening_hours: null,
            meta_title: null,
            meta_description: null,
            ratings_avg: 4.7,
            ratings_count: 134,
            prep_time_min: 20,
            prep_time_max: 30,
            price_min: 20.0,
            price_max: 65.0,
            created_at: "2025-01-15T10:30:00.000Z",
            location: null,
            calendar_url: null,
            whatsapp: null,
            address: null,
            business_hours: null,
        },
    ],

    mercados: [
        {
            id: "00000000-0000-0000-0000-000000000005",
            name: "Supermercado Preço Bom",
            storeSlug: "supermercado-preco-bom",
            description: "Hortifrúti, açougue, padaria e produtos de limpeza",
            logo_url: null,
            owner_id: JOAO_ID,
            banner_url: null,
            is_open: true,
            is_active: true,
            opening_hours: null,
            meta_title: null,
            meta_description: null,
            ratings_avg: 4.4,
            ratings_count: 320,
            prep_time_min: 30,
            prep_time_max: 45,
            price_min: 5.0,
            price_max: 300.0,
            created_at: "2025-01-15T10:30:00.000Z",
            location: null,
            calendar_url: null,
            whatsapp: null,
            address: null,
            business_hours: null,
        },
        {
            id: "00000000-0000-0000-0000-000000000006",
            name: "Mercado Orgânico Natural",
            storeSlug: "mercado-organico-natural",
            description: "Alimentos orgânicos, grãos a granel e produtos sem glúten",
            logo_url: null,
            owner_id: BEATRIZ_ID,
            banner_url: null,
            is_open: true,
            is_active: true,
            opening_hours: null,
            meta_title: null,
            meta_description: null,
            ratings_avg: 4.7,
            ratings_count: 175,
            prep_time_min: 25,
            prep_time_max: 40,
            price_min: 10.0,
            price_max: 200.0,
            created_at: "2025-01-15T10:30:00.000Z",
            location: null,
            calendar_url: null,
            whatsapp: null,
            address: null,
            business_hours: null,
        },
        {
            id: "00000000-0000-0000-0000-000000000007",
            name: "Atacadão Express",
            storeSlug: "atacadao-express",
            description: "Compras em grande quantidade com preços de atacado",
            logo_url: null,
            owner_id: NATAN_ID,
            banner_url: null,
            is_open: true,
            is_active: true,
            opening_hours: null,
            meta_title: null,
            meta_description: null,
            ratings_avg: 4.3,
            ratings_count: 89,
            prep_time_min: 40,
            prep_time_max: 60,
            price_min: 20.0,
            price_max: 500.0,
            created_at: "2025-01-15T10:30:00.000Z",
            location: null,
            calendar_url: null,
            whatsapp: null,
            address: null,
            business_hours: null,
        },
    ],
};