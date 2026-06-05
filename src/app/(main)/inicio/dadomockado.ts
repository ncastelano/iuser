// src/app/(main)/inicio/dadomockados.ts

export interface Loja {
    id: number
    nome: string
    descricao: string
    avaliacao: number
    tempo_entrega: string
    distancia: string
    imagem: string
}

export const dadosMockados: Record<string, Loja[]> = {
    restaurantes: [
        {
            id: 1,
            nome: 'Cantina Bella Italia',
            descricao:
                'Massas artesanais, pizzas de forno a lenha e vinhos selecionados',
            avaliacao: 4.8,
            tempo_entrega: '20-30 min',
            distancia: '1.2 km',
            imagem:
                'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800',
        },
        {
            id: 2,
            nome: 'Sabor Oriental',
            descricao:
                'Culinária japonesa e tailandesa com ingredientes frescos',
            avaliacao: 4.6,
            tempo_entrega: '25-35 min',
            distancia: '2.1 km',
            imagem:
                'https://images.unsplash.com/photo-1617196034796-73dfa7b1fd56?w=800',
        },
        {
            id: 3,
            nome: 'Burger Mania',
            descricao: 'Hambúrgueres gourmet, batatas rústicas e milk-shakes',
            avaliacao: 4.5,
            tempo_entrega: '15-25 min',
            distancia: '0.8 km',
            imagem:
                'https://images.unsplash.com/photo-1550547660-d9450f859349?w=800',
        },
        {
            id: 4,
            nome: 'Verde Vida',
            descricao:
                'Comida vegana e saudável, saladas, bowls e sucos naturais',
            avaliacao: 4.7,
            tempo_entrega: '20-30 min',
            distancia: '1.5 km',
            imagem:
                'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800',
        },
    ],

    mercados: [
        {
            id: 5,
            nome: 'Supermercado Preço Bom',
            descricao: 'Hortifrúti, açougue, padaria e produtos de limpeza',
            avaliacao: 4.4,
            tempo_entrega: '30-45 min',
            distancia: '1.0 km',
            imagem:
                'https://images.unsplash.com/photo-1542838132-92c53300491e?w=800',
        },
        {
            id: 6,
            nome: 'Mercado Orgânico Natural',
            descricao:
                'Alimentos orgânicos, grãos a granel e produtos sem glúten',
            avaliacao: 4.7,
            tempo_entrega: '25-40 min',
            distancia: '2.3 km',
            imagem:
                'https://images.unsplash.com/photo-1606787366850-de6330128bfc?w=800',
        },
        {
            id: 7,
            nome: 'Atacadão Express',
            descricao: 'Compras em grande quantidade com preços de atacado',
            avaliacao: 4.3,
            tempo_entrega: '40-60 min',
            distancia: '3.0 km',
            imagem:
                'https://images.unsplash.com/photo-1601598851547-4302969d0614?w=800',
        },
    ],

    farmacias: [
        {
            id: 8,
            nome: 'Farmácia Vida Saudável',
            descricao:
                'Medicamentos, cosméticos e produtos de higiene pessoal',
            avaliacao: 4.9,
            tempo_entrega: '15-25 min',
            distancia: '0.5 km',
            imagem:
                'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=800',
        },
        {
            id: 9,
            nome: 'Drogaria Mais Saúde',
            descricao: 'Genéricos, perfumaria e atendimento 24 horas',
            avaliacao: 4.6,
            tempo_entrega: '20-30 min',
            distancia: '1.8 km',
            imagem:
                'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=800',
        },
        {
            id: 10,
            nome: 'Farmácia Popular',
            descricao:
                'Medicamentos com desconto, convênios e entrega rápida',
            avaliacao: 4.5,
            tempo_entrega: '15-20 min',
            distancia: '1.1 km',
            imagem:
                'https://images.unsplash.com/photo-1585435557343-3b092031a831?w=800',
        },
    ],

    petshops: [
        {
            id: 11,
            nome: 'Pet Shop Au Au',
            descricao: 'Rações, brinquedos, acessórios e banho & tosa',
            avaliacao: 4.8,
            tempo_entrega: '30-45 min',
            distancia: '1.4 km',
            imagem:
                'https://images.unsplash.com/photo-1601758228041-f3b2795255f1?w=800',
        },
        {
            id: 12,
            nome: 'Mundo Pet',
            descricao:
                'Clínica veterinária, medicamentos e alimentos especiais',
            avaliacao: 4.7,
            tempo_entrega: '25-40 min',
            distancia: '2.0 km',
            imagem:
                'https://images.unsplash.com/photo-1583337130417-3346a1be7dee?w=800',
        },
        {
            id: 13,
            nome: 'Bichos & Cia',
            descricao: 'Aquarismo, jardinagem e tudo para seu pet exótico',
            avaliacao: 4.4,
            tempo_entrega: '35-50 min',
            distancia: '3.2 km',
            imagem:
                'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?w=800',
        },
    ],

    fitness: [
        {
            id: 14,
            nome: 'Academia Iron Body',
            descricao:
                'Musculação, aulas de spinning e personal trainer',
            avaliacao: 4.9,
            tempo_entrega: '0 min (presencial)',
            distancia: '0.7 km',
            imagem:
                'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=800',
        },
        {
            id: 15,
            nome: 'Yoga Flow Studio',
            descricao:
                'Aulas de yoga, meditação e pilates para todos os níveis',
            avaliacao: 4.8,
            tempo_entrega: '0 min (presencial)',
            distancia: '1.3 km',
            imagem:
                'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=800',
        },
        {
            id: 16,
            nome: 'PowerFit Suplementos',
            descricao: 'Whey, creatina e acessórios fitness',
            avaliacao: 4.6,
            tempo_entrega: '20-30 min',
            distancia: '2.5 km',
            imagem:
                'https://images.unsplash.com/photo-1599058917212-d750089bc07e?w=800',
        },
    ],

    roupas: [
        {
            id: 17,
            nome: 'Moda Estilo',
            descricao:
                'Roupas femininas e masculinas, calçados e acessórios',
            avaliacao: 4.7,
            tempo_entrega: '25-35 min',
            distancia: '1.6 km',
            imagem:
                'https://images.unsplash.com/photo-1521335629791-ce4aec67dd47?w=800',
        },
        {
            id: 18,
            nome: 'Sport Wear Pro',
            descricao:
                'Roupas esportivas, tênis e equipamentos fitness',
            avaliacao: 4.5,
            tempo_entrega: '20-30 min',
            distancia: '2.2 km',
            imagem:
                'https://images.unsplash.com/photo-1528701800489-20be3c3ea3d6?w=800',
        },
        {
            id: 19,
            nome: 'Kids Fashion',
            descricao:
                'Moda infantil, brinquedos e enxoval para bebês',
            avaliacao: 4.8,
            tempo_entrega: '30-40 min',
            distancia: '1.0 km',
            imagem:
                'https://images.unsplash.com/photo-1607453998774-d533f65dac99?w=800',
        },
    ],

    entregas: [
        {
            id: 20,
            nome: 'Envia Já Express',
            descricao: 'Entregas rápidas de documentos e volumes',
            avaliacao: 4.9,
            tempo_entrega: '30-60 min',
            distancia: '1.0 km',
            imagem:
                'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?w=800',
        },
        {
            id: 21,
            nome: 'Loggi Fácil',
            descricao: 'Coleta e entrega de encomendas',
            avaliacao: 4.7,
            tempo_entrega: '1-3 dias',
            distancia: '5.0 km',
            imagem:
                'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=800',
        },
        {
            id: 22,
            nome: 'MotoBoy Express',
            descricao: 'Motoboy para entregas urgentes',
            avaliacao: 4.6,
            tempo_entrega: '20-45 min',
            distancia: '2.0 km',
            imagem:
                'https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?w=800',
        },
    ],
}