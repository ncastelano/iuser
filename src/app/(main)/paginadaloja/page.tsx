// app/paginadaloja/page.tsx
'use client'

import { useState, useMemo } from 'react'
import Image from 'next/image'
import {
    ArrowLeft,
    Share2,
    MapPin,
    Settings,
    Eye,
    Clock,
    Calendar,
    Search,
    ShoppingBag,
    Plus,
    Star,
    X,
    MessageCircle,
} from 'lucide-react'

// ---------- Tipos ----------
type Product = {
    id: string
    name: string
    description?: string
    price: number
    price_type?: 'fixed' | 'hourly'
    image_url?: string
    category: string
    type: 'physical' | 'service' | 'digital'
    slug?: string
}

export type Rating = {
    id: string
    rating: number
    comment?: string | null   // ← alterado de string | undefined para string | null
    is_anonymous?: boolean
    profile_id: string
    created_at: string
    user_name?: string
    user_avatar?: string
    product_name?: string
}

type Store = {
    id: string
    name: string
    storeSlug: string
    description?: string
    address?: string
    is_open: boolean
    logo_url?: string
    ratings_avg?: number
    ratings_count?: number
    owner_id: string
    business_hours?: Record<string, { open: string; close: string }>
    view_count?: number
}

// ---------- Dados simulados (mock) ----------
const MOCK_STORE: Store = {
    id: '1',
    name: 'Café & Arte',
    storeSlug: 'cafe-arte',
    description:
        'Um espaço acolhedor para apreciar cafés especiais, doces artesanais e arte local. Oferecemos também workshops e eventos culturais. Nosso ambiente é perfeito para trabalhar ou encontrar amigos.',
    address: 'Rua das Flores, 123, Jardim Paulista, São Paulo - SP',
    is_open: true,
    logo_url: '',
    ratings_avg: 4.7,
    ratings_count: 128,
    owner_id: 'owner1',
    business_hours: {
        mon: { open: '08:00', close: '20:00' },
        tue: { open: '08:00', close: '20:00' },
        wed: { open: '08:00', close: '20:00' },
        thu: { open: '08:00', close: '22:00' },
        fri: { open: '08:00', close: '22:00' },
        sat: { open: '09:00', close: '18:00' },
        sun: { open: '', close: '' },
    },
    view_count: 3456,
}

const MOCK_PRODUCTS: Product[] = [
    {
        id: 'p1',
        name: 'Café Espresso',
        description: 'Café espresso encorpado com grãos selecionados',
        price: 8.9,
        price_type: 'fixed',
        category: 'Bebidas Quentes',
        type: 'physical',
        image_url: '',
    },
    {
        id: 'p2',
        name: 'Cappuccino Italiano',
        description: 'Cappuccino cremoso com canela e chocolate',
        price: 12.5,
        price_type: 'fixed',
        category: 'Bebidas Quentes',
        type: 'physical',
        image_url: '',
    },
    {
        id: 'p3',
        name: 'Bolo de Cenoura',
        description: 'Fatia de bolo de cenoura com cobertura de chocolate',
        price: 10.0,
        price_type: 'fixed',
        category: 'Doces',
        type: 'physical',
        image_url: '',
    },
    {
        id: 'p4',
        name: 'Consultoria de Cafés',
        description: 'Aprenda a preparar o café perfeito em casa',
        price: 150.0,
        price_type: 'hourly',
        category: 'Serviços',
        type: 'service',
        image_url: '',
    },
]

const MOCK_RATINGS: Rating[] = [
    {
        id: 'r1',
        rating: 5,
        comment: 'Ambiente incrível e café delicioso!',
        is_anonymous: false,
        profile_id: 'u1',
        created_at: '2025-05-12T10:30:00Z',
        user_name: 'Marina Silva',
        user_avatar: '',
        product_name: 'Café Espresso',
    },
    {
        id: 'r2',
        rating: 4,
        comment: 'Bolo de cenoura muito bom, mas achei um pouco caro.',
        is_anonymous: false,
        profile_id: 'u2',
        created_at: '2025-05-10T14:15:00Z',
        user_name: 'Carlos Pereira',
        user_avatar: '',
        product_name: 'Bolo de Cenoura',
    },
    {
        id: 'r3',
        rating: 5,
        comment: null,   // agora é aceito
        is_anonymous: true,
        profile_id: 'u3',
        created_at: '2025-05-08T09:00:00Z',
    },
]

const DAY_LABELS: Record<string, string> = {
    sun: 'Domingo',
    mon: 'Segunda-feira',
    tue: 'Terça-feira',
    wed: 'Quarta-feira',
    thu: 'Quinta-feira',
    fri: 'Sexta-feira',
    sat: 'Sábado',
}

// ---------- Funções auxiliares ----------
function getOpenStatus(businessHours?: Record<string, { open: string; close: string }>) {
    const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
    const today = days[new Date().getDay()]
    const todayHours = businessHours?.[today]
    if (!todayHours || !todayHours.open || !todayHours.close) return false
    const now = new Date()
    const current = now.getHours() * 60 + now.getMinutes()
    const [oh, om] = todayHours.open.split(':').map(Number)
    let [ch, cm] = todayHours.close.split(':').map(Number)
    if (ch === 0 && cm === 0) ch = 24
    return current >= oh * 60 + om && current <= ch * 60 + cm
}

// ---------- Página principal ----------
export default function StorePage() {
    const [store] = useState<Store>(MOCK_STORE)
    const [products] = useState<Product[]>(MOCK_PRODUCTS)
    const [ratings] = useState<Rating[]>(MOCK_RATINGS)
    const [isOwner] = useState(false)
    const [totalVisitors] = useState(MOCK_STORE.view_count || 0)

    const [searchQuery, setSearchQuery] = useState('')
    const [activeTab, setActiveTab] = useState<'products' | 'reviews'>('products')
    const [showAllHours, setShowAllHours] = useState(false)
    const [expandedDesc, setExpandedDesc] = useState(false)

    const open = getOpenStatus(store.business_hours)

    const filteredProducts = useMemo(() => {
        if (!searchQuery.trim()) return products
        const q = searchQuery.toLowerCase()
        return products.filter(
            (p) => p.name.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q)
        )
    }, [products, searchQuery])

    const groupedProducts = useMemo(() => {
        const groups: Record<string, Product[]> = {}
        filteredProducts.forEach((p) => {
            const cat = p.category || 'Geral'
            if (!groups[cat]) groups[cat] = []
            groups[cat].push(p)
        })
        return groups
    }, [filteredProducts])

    const entries = Object.entries(groupedProducts)

    const handleShare = () => {
        navigator.share?.({ title: store.name, url: window.location.href }).catch(() => { })
    }
    const handleOpenMaps = () => {
        if (store.address)
            window.open(
                `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(store.address)}`,
                '_blank'
            )
    }
    const handleSchedule = () => alert('Agendamento ainda não implementado')
    const handleAddToCart = (product: Product) => alert(`${product.name} adicionado à sacola`)
    const handleEditProduct = (product: Product) => alert(`Editar produto ${product.name}`)
    const handleAddProduct = () => alert('Adicionar produto (modo edição)')
    const handleEditStore = () => alert('Editar loja (modo edição)')

    return (
        <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-50 dark:from-gray-900 dark:to-gray-800 pb-24">
            {/* ----- Header ----- */}
            <header className="sticky top-0 z-50 backdrop-blur-2xl bg-white/60 dark:bg-black/40 border-b border-white/20 dark:border-white/10 px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <button className="p-2 rounded-full hover:bg-white/30 transition">
                        <ArrowLeft size={20} />
                    </button>
                    <div className="relative w-12 h-12 rounded-full overflow-hidden border-2 border-white shadow-md">
                        {store.logo_url ? (
                            <Image src={store.logo_url} alt={store.name} fill className="object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center bg-amber-600 text-white text-xl font-bold">
                                {store.name.charAt(0)}
                            </div>
                        )}
                    </div>
                    <div>
                        <h1 className="text-lg font-bold tracking-tight">{store.name}</h1>
                        <div className="flex items-center gap-1 text-xs text-gray-500">
                            <Eye size={12} />
                            <span>{totalVisitors} visitantes</span>
                            <span className="mx-1">•</span>
                            <span
                                className={`flex items-center gap-1 font-medium ${open ? 'text-green-500' : 'text-red-500'
                                    }`}
                            >
                                <Clock size={12} /> {open ? 'Aberto' : 'Fechado'}
                            </span>
                        </div>
                    </div>
                </div>
                <div className="flex gap-1">
                    <button onClick={handleShare} className="p-2 rounded-full hover:bg-white/30 transition">
                        <Share2 size={18} />
                    </button>
                    <button onClick={handleOpenMaps} className="p-2 rounded-full hover:bg-white/30 transition">
                        <MapPin size={18} />
                    </button>
                    {isOwner && (
                        <button onClick={handleEditStore} className="p-2 rounded-full hover:bg-white/30 transition">
                            <Settings size={18} />
                        </button>
                    )}
                </div>
            </header>

            <main className="w-full px-4 md:px-6 py-6 space-y-6">
                {/* ----- Descrição ----- */}
                {store.description && (
                    <div>
                        <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                            {expandedDesc || store.description.length <= 120
                                ? store.description
                                : store.description.slice(0, 120) + '...'}
                        </p>
                        {store.description.length > 120 && (
                            <button
                                onClick={() => setExpandedDesc(!expandedDesc)}
                                className="text-amber-600 text-xs font-bold mt-1 underline-offset-2 hover:underline"
                            >
                                {expandedDesc ? 'Ver menos' : 'Ver mais'}
                            </button>
                        )}
                    </div>
                )}

                {/* ----- Ações rápidas ----- */}
                <div className="flex flex-wrap gap-2">
                    {store.address && (
                        <button
                            onClick={handleOpenMaps}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-full text-xs font-bold shadow-lg hover:scale-105 transition-transform"
                        >
                            <MapPin size={14} />
                            {store.address.split(',')[0]}
                        </button>
                    )}
                    <button
                        onClick={handleSchedule}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-full text-xs font-bold shadow-lg hover:scale-105 transition-transform"
                    >
                        <Calendar size={14} />
                        Agendar
                    </button>
                    {store.business_hours && (
                        <button
                            onClick={() => setShowAllHours(true)}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-white/40 dark:bg-white/10 backdrop-blur-md border border-white/30 rounded-full text-xs font-bold"
                        >
                            <Clock size={14} />
                            Horários
                        </button>
                    )}
                </div>

                {/* ----- Tabs ----- */}
                <div className="flex p-1 bg-white/30 dark:bg-white/5 backdrop-blur-md rounded-xl">
                    {['products', 'reviews'].map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab as typeof activeTab)}
                            className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === tab
                                ? 'bg-amber-600 text-white shadow-lg'
                                : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
                                }`}
                        >
                            {tab === 'products' ? 'Produtos' : 'Avaliações'}
                        </button>
                    ))}
                </div>

                {/* ----- Conteúdo: Produtos ----- */}
                {activeTab === 'products' && (
                    <div className="space-y-6">
                        <div className="relative">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                            <input
                                type="text"
                                placeholder="Buscar produtos..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 bg-white/40 dark:bg-white/10 backdrop-blur-md border border-white/30 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                            />
                        </div>

                        {products.length === 0 ? (
                            <div className="text-center py-16 text-gray-500">
                                <ShoppingBag size={48} className="mx-auto opacity-30" />
                                <p className="mt-4">Nenhum produto cadastrado</p>
                                {isOwner && (
                                    <button
                                        onClick={handleAddProduct}
                                        className="mt-4 inline-flex items-center gap-2 px-6 py-2 bg-amber-600 text-white rounded-full text-sm font-bold"
                                    >
                                        <Plus size={18} /> Adicionar Produto
                                    </button>
                                )}
                            </div>
                        ) : entries.length === 0 ? (
                            <div className="text-center py-16 text-gray-500">
                                <Search size={48} className="mx-auto opacity-30" />
                                <p className="mt-4">Nenhum produto encontrado para "{searchQuery}"</p>
                            </div>
                        ) : (
                            entries.map(([category, items]) => (
                                <section key={category} className="space-y-3">
                                    <h3 className="text-xs font-black uppercase tracking-widest text-amber-600 ml-1">
                                        {category}
                                    </h3>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                        {items.map((product) => (
                                            <div
                                                key={product.id}
                                                className="group relative bg-white/20 dark:bg-black/20 backdrop-blur-xl border border-white/30 dark:border-white/10 rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300"
                                            >
                                                <div className="aspect-square relative overflow-hidden">
                                                    {product.image_url ? (
                                                        <Image
                                                            src={product.image_url}
                                                            alt={product.name}
                                                            fill
                                                            className="object-cover transition-transform duration-500 group-hover:scale-110"
                                                        />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-amber-200 to-amber-100 dark:from-amber-800 dark:to-amber-700 text-4xl font-black text-amber-700 dark:text-amber-200">
                                                            {product.name.charAt(0)}
                                                        </div>
                                                    )}
                                                    <span className="absolute top-2 left-2 px-2 py-0.5 bg-black/50 backdrop-blur-md text-white text-[10px] font-bold rounded-full uppercase">
                                                        {product.type === 'physical'
                                                            ? 'Físico'
                                                            : product.type === 'service'
                                                                ? 'Serviço'
                                                                : 'Digital'}
                                                    </span>
                                                    {!isOwner && (
                                                        <button
                                                            onClick={() => handleAddToCart(product)}
                                                            className="absolute bottom-2 right-2 w-8 h-8 bg-amber-600 text-white rounded-full flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                                                        >
                                                            <Plus size={18} />
                                                        </button>
                                                    )}
                                                    {isOwner && (
                                                        <button
                                                            onClick={() => handleEditProduct(product)}
                                                            className="absolute top-2 right-2 w-8 h-8 bg-white/90 dark:bg-black/50 rounded-full flex items-center justify-center shadow"
                                                        >
                                                            <Settings size={14} />
                                                        </button>
                                                    )}
                                                </div>
                                                <div className="p-3">
                                                    <h4 className="font-bold text-sm line-clamp-1">{product.name}</h4>
                                                    <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1 mt-0.5">
                                                        {product.description || 'Sem descrição'}
                                                    </p>
                                                    <div className="mt-2">
                                                        <span className="text-base font-extrabold text-amber-600">
                                                            R$ {product.price.toFixed(2)}
                                                            {product.price_type === 'hourly' && (
                                                                <span className="text-xs font-normal">/h</span>
                                                            )}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            ))
                        )}
                    </div>
                )}

                {/* ----- Conteúdo: Avaliações ----- */}
                {activeTab === 'reviews' && (
                    <div className="space-y-3">
                        {ratings.length === 0 ? (
                            <div className="text-center py-16 text-gray-500">
                                <Star size={48} className="mx-auto opacity-30" />
                                <p className="mt-4">Nenhuma avaliação ainda</p>
                            </div>
                        ) : (
                            ratings.map((r) => (
                                <div
                                    key={r.id}
                                    className="flex gap-3 p-4 bg-white/20 dark:bg-black/20 backdrop-blur-xl border border-white/30 dark:border-white/10 rounded-2xl"
                                >
                                    <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-white shrink-0">
                                        {r.user_avatar ? (
                                            <Image
                                                src={r.user_avatar}
                                                alt=""
                                                width={40}
                                                height={40}
                                                className="object-cover"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center bg-amber-100 dark:bg-amber-800 text-amber-700 dark:text-amber-200 font-bold text-sm">
                                                {(r.user_name || '?').charAt(0).toUpperCase()}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between">
                                            <p className="font-bold text-sm">
                                                {r.is_anonymous ? 'Anônimo' : r.user_name}
                                            </p>
                                            <p className="text-[10px] text-gray-500">
                                                {new Date(r.created_at).toLocaleDateString('pt-BR')}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-1 my-1">
                                            {Array.from({ length: 5 }).map((_, i) => (
                                                <Star
                                                    key={i}
                                                    size={12}
                                                    className={
                                                        i < r.rating
                                                            ? 'text-yellow-400 fill-yellow-400'
                                                            : 'text-gray-300'
                                                    }
                                                />
                                            ))}
                                            {r.product_name && (
                                                <span className="ml-2 text-[10px] bg-amber-100 dark:bg-amber-800 text-amber-700 dark:text-amber-200 px-2 py-0.5 rounded-full">
                                                    {r.product_name}
                                                </span>
                                            )}
                                        </div>
                                        {r.comment && (
                                            <p className="text-xs italic text-gray-500 mt-1">"{r.comment}"</p>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </main>

            {/* ----- Botões flutuantes ----- */}
            <div className="fixed bottom-6 right-6 flex gap-3 z-50">
                <button className="w-14 h-14 rounded-full bg-amber-600 text-white shadow-2xl shadow-amber-600/30 flex items-center justify-center hover:scale-105 transition-transform">
                    <ShoppingBag size={24} />
                </button>
                <button className="w-14 h-14 rounded-full bg-white/80 dark:bg-black/50 backdrop-blur-md border border-white/30 flex items-center justify-center shadow-lg hover:scale-105 transition-transform">
                    <MessageCircle size={24} />
                </button>
            </div>

            {/* ----- Modal de horários ----- */}
            {showAllHours && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
                    onClick={() => setShowAllHours(false)}
                >
                    <div
                        className="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold">Horários</h3>
                            <button onClick={() => setShowAllHours(false)}>
                                <X size={20} />
                            </button>
                        </div>
                        <ul className="space-y-2">
                            {Object.entries(DAY_LABELS).map(([key, label]) => {
                                const h = store.business_hours?.[key]
                                return (
                                    <li key={key} className="flex justify-between text-sm">
                                        <span>{label}</span>
                                        <span className="font-mono">
                                            {h?.open ? `${h.open.slice(0, 5)} - ${h.close.slice(0, 5)}` : 'Fechado'}
                                        </span>
                                    </li>
                                )
                            })}
                        </ul>
                        <button
                            onClick={() => setShowAllHours(false)}
                            className="mt-6 w-full py-2 bg-amber-600 text-white rounded-xl font-bold"
                        >
                            Fechar
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}