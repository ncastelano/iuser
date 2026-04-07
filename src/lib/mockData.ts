export interface MockStore {
  id: string
  name: string
  storeSlug: string
  logo_url: string | null
  description: string | null
  owner_id: string
  is_open: boolean
  location: string | null
  store_stats: {
    ratings_count: number
    ratings_avg: number
    prep_time_min: number | null
    prep_time_max: number | null
    price_min: number | null
    price_max: number | null
  }
}

export interface MockProduct {
  id: string
  store_id: string
  name: string
  description: string | null
  price: number | null
  category: string | null
  type?: string | null
  image_url: string | null
  is_active: boolean
  created_at: string
}

// Generate 100+ stores
export function getMockStores(): MockStore[] {
  const stores: MockStore[] = []
  const prefixes = ['Super', 'Mega', 'Hyper', 'Mercado', 'Empório', 'Cantina', 'Padaria', 'Restaurante', 'Bistrô', 'Lanchonete']
  const suffixes = ['do Bairro', 'Central', 'Premium', 'Express', 'da Família', 'Delivery', 'Gourmet', 'Vip', 'Sabor', 'Bom']

  for (let i = 1; i <= 120; i++) {
    const prefix = prefixes[i % prefixes.length]
    const suffix = suffixes[(i * 3) % suffixes.length]
    const name = `${prefix} ${suffix} ${i}`

    // Lat -8.76, Lng -63.90 as base (Porto Velho offset)
    const lat = -8.76 + (Math.random() * 0.1 - 0.05)
    const lng = -63.90 + (Math.random() * 0.1 - 0.05)

    stores.push({
      id: `store-${i}`,
      name,
      storeSlug: `loja-${i}`,
      logo_url: null,
      description: `Uma descrição genérica para a loja ${name}, servindo os melhores produtos da região.`,
      owner_id: `owner-${i}`,
      is_open: Math.random() > 0.3, // 70% chance of being open
      location: `POINT(${lng} ${lat})`,
      store_stats: {
        ratings_count: Math.floor(Math.random() * 500),
        ratings_avg: 3 + Math.random() * 2, // 3 to 5
        prep_time_min: 10 + Math.floor(Math.random() * 20),
        prep_time_max: 30 + Math.floor(Math.random() * 30),
        price_min: Math.floor(Math.random() * 20),
        price_max: 50 + Math.floor(Math.random() * 50),
      }
    })
  }
  return stores
}

// Generate 1000+ products, we distribute them among stores based on store_id
export function getMockProducts(storeId: string): MockProduct[] {
  const products: MockProduct[] = []

  // Extrai o ID numérico da store_id: 'store-1', 'store-2', etc..
  let storeNum = 1
  if (storeId.includes('-')) {
    storeNum = parseInt(storeId.split('-')[1]) || 1
  }

  const categories = ['Lanches', 'Bebidas', 'Sobremesas', 'Pratos Feitos', 'Porções', 'Pizzas']
  const productNames = ['Hambúrguer Caseiro', 'Pizza de Calabresa', 'Coca-Cola 2L', 'Batata Frita Média', 'Açaí 500ml', 'Sanduíche Natural', 'Suco de Laranja', 'Marmita P', 'Pastel de Vento', 'Bolo de Pote']

  // Cada loja terá cerca de 10 a 20 produtos (totalizando ~ 1200 a 2400 produtos no geral)
  const numProducts = 10 + (storeNum % 10)

  for (let j = 1; j <= numProducts; j++) {
    const baseName = productNames[(storeNum + j) % productNames.length]

    products.push({
      id: `prod-${storeNum}-${j}`,
      store_id: storeId,
      name: `${baseName} (Variação ${j})`,
      description: `Um delicioso ${baseName.toLowerCase()} feito com os melhores ingredientes da cidade.`,
      price: 5 + Math.floor(Math.random() * 80) + (Math.random() > 0.5 ? 0.99 : 0.50),
      category: categories[(storeNum + j) % categories.length],
      image_url: null,
      is_active: true,
      created_at: new Date().toISOString()
    })
  }

  return products
}

// Para busca global de todos os produtos de todas as lojas
export function getAllMockProducts(): MockProduct[] {
  let all: MockProduct[] = []
  for (let i = 1; i <= 120; i++) {
    all = [...all, ...getMockProducts(`store-${i}`)]
  }
  return all
}
