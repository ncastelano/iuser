// src/app/(main)/page.tsx
'use client'

import { useState, useEffect, useMemo, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { User, Store, Home, MapPin, LayoutDashboard, X, Car } from 'lucide-react'

import CategoriasSection from './inicio/sections/CanIhelp'
import RadarSection from './inicio/sections/RadarSection'
import MotoristaSection from './inicio/sections/MotoristaSection'
import AcceptARider from './inicio/sections/AcceptARider'
import MyServiceRequests from './inicio/sections/MyServiceRequests'
import OfferAService from './inicio/sections/OfferAService'
import NeedAService from './inicio/sections/NeedAService'
import SortableSection from './inicio/sections/SortableSection'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import { useProfile } from '../contexts/ProfileContext'
import { useTheme } from '@/app/contexts/theme'
import OrderSection from '@/components/OrderSection'
import SearchResultsSection from './inicio/SearchResultsSection'
import LastSearched from '@/components/LastSearched'
import { supabase } from '@/lib/supabase/client'
import Header from '@/components/Header'
import CreateStoreAndRegisterProfile from './inicio/CreateStoreAndRegisterProfile'
import LoginAndRegister from '@/components/LoginAndRegister/LoginAndRegister'
import ProfileDashboard from '@/components/ProfileDashboard/ProfileDashboard'
import { useMyVehicles, buildVehicleTabs } from '@/lib/vehicleHeaderTabs'
import { useAdminHeaderTab } from '@/lib/adminHeaderTab'
import { useMerchantStore } from '@/store/useMerchantStore'
import { isStoreOpenNow, type BusinessHours } from '@/lib/storeHours'
import { isProfileOpenNow } from '@/lib/profileHours'
import { useNavProgressStore } from '@/store/useNavProgressStore'
import ProductShowcase from './inicio/sections/ProductShowcase'
import FeaturedPublications from './inicio/sections/FeaturePublications'
import AddMenuFab from '@/components/AddMenuFab'
import CommunitiesPreview from './inicio/sections/CommunitiesPreview'
import FeaturedProfiles from './inicio/sections/FeaturedProfiles'
import LocationPicker from '@/components/LocationPicker'
import StoreList from './inicio/sections/StoreList'
import StoreDashboard from '@/components/StoreDashboard/StoreDashboard'
import CareerPlans from './inicio/sections/CareerPlans'

// ===== GRADIENTE FIXO LARANJA-VERMELHO =====
const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

// ===== TODAS AS SEÇÕES DISPONÍVEIS (INCLUINDO AS "EM BREVE") =====
// Pra onde a home deve deslizar ao voltar de outra tela (guardado fora do componente: sobrevive a uma montagem dupla)
const pendingHomeReturn: { value: { saved: string | null; anchor: string | null } | null } = { value: null }

const DEFAULT_SECTIONS = [
    'categorias',
    'meusPedidos',
    'servicosOferecidos',
    'radar',
    'servicosProcurados',
    'storeList',
    'canalMotorista',
    'productShowcase',
    'publicationShowcase',
    'communities',
    'profileShowcase',
    'motorista',
    'careerPlans',
    'orderSection',
]

const ORDER_STORAGE_KEY = 'homepage_sections_order'
const RADAR_MOVED_KEY = 'homepage_radar_between_services_v1'
// Visitante (sem conta) também pode definir um local: fica só neste aparelho e serve apenas
// pra calcular o que está perto (Radar). Quem tem conta salva o local no perfil.
const DEVICE_LOCATION_KEY = 'iuser_device_location'

// ---------- Função para formatar endereço ----------
function formatAddress(address: string, addressNumber?: string): string {
    if (!address) return 'Definir local'

    const displayAddress = addressNumber ? `${address.split(',')[0]}, ${addressNumber}` : address
    const firstPart = displayAddress.split(',')[0].trim()
    const match = firstPart.match(/^(.+?)(\s+\d+)/)

    if (match) {
        let result = match[0].trim()
        result = result
            .replace(/^Avenida\s/, 'Av. ')
            .replace(/^Rua\s/, 'R. ')
            .replace(/^Travessa\s/, 'Tv. ')
            .replace(/^Praça\s/, 'Pç. ')
            .replace(/^Alameda\s/, 'Al. ')
            .replace(/^Rodovia\s/, 'Rod. ')
            .replace(/^Estrada\s/, 'Estr. ')

        if (result.length > 28) {
            return result.substring(0, 25) + '...'
        }
        return result
    }

    if (firstPart.length > 28) {
        return firstPart.substring(0, 25) + '...'
    }
    return firstPart
}

export interface StoreInfo {
    id: string
    slug: string
    logoUrl: string | null
    name: string
    business_hours?: BusinessHours | null
}

function HomePageContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const startNavProgress = useNavProgressStore((s) => s.start)
    const {
        userId,
        profileSlug,
        avatarUrl,
        bgMode,
        customBgUrl,
        loading,
    } = useProfile()

    const { colors } = useTheme()

    const [sections, setSections] = useState<string[]>(DEFAULT_SECTIONS)
    const [editMode, setEditMode] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [searchFocused, setSearchFocused] = useState(false)
    const [hasInteractedWithSearch, setHasInteractedWithSearch] = useState(false)
    const [stores, setStores] = useState<StoreInfo[]>([])
    const adminTab = useAdminHeaderTab(userId)
    const { vehicles: myVehicles } = useMyVehicles(userId)
    const [showCreateStore, setShowCreateStore] = useState(false)
    const [showLogin, setShowLogin] = useState(false)
    const [showProfile, setShowProfile] = useState(false)
    const [showStoreDashboard, setShowStoreDashboard] = useState<{ slug: string; name: string } | null>(null)

    const [savedLocation, setSavedLocation] = useState<{ lat: number; lng: number; address: string; addressNumber?: string; addressComplement?: string } | null>(null)
    const [showLocationDialog, setShowLocationDialog] = useState(false)
    const [isSavingLocation, setIsSavingLocation] = useState(false)

    const [loadingStores, setLoadingStores] = useState(true)

    const [breveMap, setBreveMap] = useState<Record<string, boolean>>({})
    const [motoristaUrgent, setMotoristaUrgent] = useState(false)
    const [canalMotoristaUrgent, setCanalMotoristaUrgent] = useState(false)
    const [servicoUrgent, setServicoUrgent] = useState(false)

    const storeOrderCounts = useMerchantStore(s => s.storeOrderCounts)
    const setMerchantStoreOrderCounts = useMerchantStore(s => s.setStoreOrderCounts)

    const breveCallbacks = useMemo(() => ({
        motorista: (isBreve: boolean) => {
            setBreveMap(prev => ({ ...prev, motorista: isBreve }))
        },
    }), [])

    // REFS
    const lastSearchedRef = useRef<HTMLDivElement>(null)
    const searchInputRef = useRef<HTMLInputElement>(null)

    const pendingInvitesCount = useMerchantStore(s => s.pendingInvitesCount)
    const [profileOpenNow, setProfileOpenNow] = useState(false)

    // ---------- VOLTAR AO PONTO DA PÁGINA (movimento suave) ----------
    // Quem saiu da home por um componente (ex: Quem procura serviço → /procurar-servico) volta e a tela desliza até ELE
    // (ou, sem componente marcado, até onde estava), em vez de pular.
    useEffect(() => {
        // Lê uma vez e guarda fora do componente: a home pode montar duas vezes seguidas (dev/Suspense) e o segundo
        // efeito não pode achar a chave já apagada
        if (!pendingHomeReturn.value) {
            try {
                const sv = sessionStorage.getItem('iuser_home_scroll')
                const an = sessionStorage.getItem('iuser_home_anchor')
                sessionStorage.removeItem('iuser_home_scroll')
                sessionStorage.removeItem('iuser_home_anchor')
                if (sv || an) pendingHomeReturn.value = { saved: sv, anchor: an }
            } catch { /* ok */ }
        }
        if (!pendingHomeReturn.value) return
        const { saved, anchor } = pendingHomeReturn.value
        const savedY = Number(saved)
        const prev = window.history.scrollRestoration
        window.history.scrollRestoration = 'manual'
        const targetY = (): number | null => {
            const el = anchor ? document.querySelector<HTMLElement>(`[data-home-anchor="${anchor}"]`) : null
            if (el) return Math.max(0, el.getBoundingClientRect().top + window.scrollY - 150)
            // Sem componente marcado: só vale quando a página já cresceu o bastante pra chegar lá
            if (!anchor && Number.isFinite(savedY) && savedY >= 50 && document.documentElement.scrollHeight >= savedY + window.innerHeight * 0.6) return savedY
            return null
        }
        // A home monta por partes (a altura cresce): espera o componente (ou a altura) existir e então desliza uma vez;
        // depois confere de novo, caso algo acima tenha mudado a posição
        let glided = false
        let recheck: ReturnType<typeof setTimeout> | null = null
        const started = Date.now()
        const poll = setInterval(() => {
            const y = targetY()
            if (y != null) {
                clearInterval(poll)
                glided = true
                window.scrollTo({ top: y, behavior: 'smooth' })
                recheck = setTimeout(() => {
                    const y2 = targetY()
                    if (y2 != null && Math.abs(window.scrollY - y2) > 80) window.scrollTo({ top: y2, behavior: 'smooth' })
                    pendingHomeReturn.value = null
                }, 1400)
            } else if (Date.now() - started > 8000) {
                clearInterval(poll)
            }
        }, 250)
        return () => { clearInterval(poll); if (recheck) clearTimeout(recheck); window.history.scrollRestoration = prev; void glided }
    }, [])

    // ---------- CARREGAR ORDEM DAS SEÇÕES ----------
    useEffect(() => {
        const saved = localStorage.getItem(ORDER_STORAGE_KEY)
        if (saved) {
            try {
                const parsed = JSON.parse(saved)
                if (Array.isArray(parsed)) {
                    const unique = Array.from(new Set(parsed))
                    const hasCategorias = unique.includes('categorias')
                    // 'servicoShowcase' virou parte do card 'servico', que depois foi
                    // separado em 3 cards: o 'servico' salvo vira os 3, na mesma posição.
                    let filtered = unique
                        .filter(s => s !== 'categorias' && s !== 'servicoShowcase')
                        .flatMap(s => s === 'servico' ? ['meusPedidos', 'servicosOferecidos', 'servicosProcurados'] : [s])
                    // Seção nova que ainda não estava na ordem salva: entra logo abaixo das publicações (não lá no fim)
                    if (!filtered.includes('communities')) {
                        const at = filtered.indexOf('publicationShowcase')
                        filtered = at >= 0 ? [...filtered.slice(0, at + 1), 'communities', ...filtered.slice(at + 1)] : filtered
                    }
                    const missing = DEFAULT_SECTIONS.filter(s => !filtered.includes(s))
                    let final = hasCategorias ? ['categorias', ...filtered, ...missing] : [...filtered, ...missing]
                    // Uma vez só: o Radar passa pro meio de "Quem já oferece" e "Quem procura" (e a ordem salva é regravada)
                    if (!localStorage.getItem(RADAR_MOVED_KEY)) {
                        const without = final.filter(s => s !== 'radar')
                        const at = without.indexOf('servicosProcurados')
                        if (at >= 0) {
                            final = [...without.slice(0, at), 'radar', ...without.slice(at)]
                            localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(final))
                        }
                        localStorage.setItem(RADAR_MOVED_KEY, '1')
                    }
                    setSections(final)
                }
            } catch {
                // Ignora erros de parse
            }
        }
    }, [])

    // ---------- FUNÇÕES DE MOVIMENTO (subir/descer) ----------
    const moveSection = (id: string, direction: 'up' | 'down') => {
        setSections((prev) => {
            const unique = Array.from(new Set(prev))
            const index = unique.indexOf(id)
            if (index === -1) return unique
            if (id === 'categorias') return unique

            const newIndex = direction === 'up' ? index - 1 : index + 1
            if (newIndex < 0 || newIndex >= unique.length) return unique
            if (direction === 'up' && unique[newIndex] === 'categorias') return unique
            if (direction === 'down' && unique[newIndex] === 'categorias') return unique

            const newArray = [...unique]
            const [removed] = newArray.splice(index, 1)
            newArray.splice(newIndex, 0, removed)
            return newArray
        })
    }

    // ---------- CARREGAR LOCALIZAÇÃO DO PERFIL ----------
    useEffect(() => {
        const fetchLocationFromProfile = async () => {
            if (!userId) {
                try {
                    const raw = localStorage.getItem(DEVICE_LOCATION_KEY)
                    const parsed = raw ? JSON.parse(raw) : null
                    setSavedLocation(parsed && Number.isFinite(parsed.lat) && Number.isFinite(parsed.lng) ? parsed : null)
                } catch {
                    setSavedLocation(null)
                }
                return
            }

            try {
                const { data: profile, error } = await supabase
                    .from('profiles')
                    .select('address, address_number, address_complement, store_lat, store_lng')
                    .eq('id', userId)
                    .maybeSingle()

                if (error) {
                    if (error.code !== 'PGRST116') {
                        console.warn('[HomePage] Erro ao buscar perfil:', error.message)
                    }
                    setSavedLocation(null)
                    return
                }

                if (profile?.store_lat && profile?.store_lng) {
                    const locationData = {
                        lat: profile.store_lat,
                        lng: profile.store_lng,
                        address: profile.address || 'Local salvo',
                        addressNumber: profile.address_number || '',
                        addressComplement: profile.address_complement || ''
                    }
                    setSavedLocation(locationData)
                } else {
                    setSavedLocation(null)
                }
            } catch (err) {
                console.warn('[HomePage] Erro ao buscar perfil:', err)
                setSavedLocation(null)
            }
        }

        fetchLocationFromProfile()
    }, [userId])

    // Convites de compromisso pendentes (badge da aba de perfil) vêm de
    // useMerchantStore.pendingInvitesCount — uma única subscrição global em
    // OrderNotification.tsx (evita duplicar canais realtime por página).

    // ---------- STATUS ABERTO/FECHADO DO PERFIL (cor da aba de perfil) ----------
    useEffect(() => {
        if (!userId) {
            setProfileOpenNow(false)
            return
        }

        supabase
            .from('profiles')
            .select('business_hours')
            .eq('id', userId)
            .single()
            .then(({ data }) => {
                setProfileOpenNow(isProfileOpenNow(data?.business_hours))
            })
    }, [userId])

    // ---------- LOJAS DO USUÁRIO ----------
    useEffect(() => {
        async function loadStores() {
            setLoadingStores(true)
            if (!userId) {
                setStores([])
                setLoadingStores(false)
                return
            }

            const { data: fetchedStores } = await supabase
                .from('stores')
                .select('id, name, storeSlug, logo_url, business_hours')
                .eq('owner_id', userId)
                .order('created_at', { ascending: true })

            if (fetchedStores) {
                const storesData = fetchedStores.map((s: any) => {
                    let logoUrl: string | null = null
                    if (s.logo_url) {
                        const { data: publicUrlData } = supabase.storage
                            .from('store-logos')
                            .getPublicUrl(s.logo_url)
                        logoUrl = publicUrlData.publicUrl
                    }
                    return {
                        id: s.id,
                        slug: s.storeSlug,
                        logoUrl,
                        name: s.name,
                        business_hours: s.business_hours || null,
                    }
                })
                setStores(storesData)
            } else {
                setStores([])
            }
            setLoadingStores(false)
        }
        loadStores()
    }, [userId])

    // ===== FUNÇÃO PARA ATUALIZAR OS BADGES EM TEMPO REAL =====
    // As contagens em si vêm do OrderNotification (montado globalmente em providers.tsx),
    // que já mantém uma assinatura realtime confiável em useMerchantStore. Aqui só mesclamos
    // a atualização mais imediata que vem do StoreDashboard enquanto ele está aberto.
    const handleOrderCountsChange = (counts: { pending: number; preparing: number; ready: number }) => {
        if (!showStoreDashboard) return
        const store = stores.find(s => s.slug === showStoreDashboard.slug)
        if (!store) return
        setMerchantStoreOrderCounts({ ...storeOrderCounts, [store.id]: counts })
    }

    // ---------- SEÇÕES EXIBIDAS (categorias sempre em primeiro, exceto quando
    // Motorista Particular ou Canal do Motorista estão com atualização
    // urgente — pedido com candidato/motorista a caminho, ou corrida aceita
    // em andamento — aí a seção urgente sobe pra frente de Categorias até
    // resolver) ----------
    const urgentSections = useMemo(() => {
        const list: string[] = []
        if (canalMotoristaUrgent) list.push('canalMotorista')
        // Inscrito num serviço: o card de Serviços fica logo abaixo do Canal do Motorista
        if (servicoUrgent) list.push('meusPedidos')
        if (motoristaUrgent) list.push('motorista')
        return list
    }, [motoristaUrgent, canalMotoristaUrgent, servicoUrgent])

    const displayedSections = useMemo(() => {
        const uniqueSections = Array.from(new Set(sections))
        if (!uniqueSections.includes('categorias')) {
            return uniqueSections
        }
        const withoutCategorias = uniqueSections.filter(s => s !== 'categorias')

        const activeUrgent = urgentSections.filter(s => withoutCategorias.includes(s))
        if (activeUrgent.length > 0) {
            const rest = withoutCategorias.filter(s => !activeUrgent.includes(s))
            return [...activeUrgent, 'categorias', ...rest]
        }

        return ['categorias', ...withoutCategorias]
    }, [sections, urgentSections])

    // ---------- SALVAR ORDEM ----------
    const handleSaveOrder = () => {
        const uniqueSections = Array.from(new Set(sections))
        localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(uniqueSections))
        setSections(uniqueSections)
        setEditMode(false)
    }

    // ---------- RESTAURAR ORDEM PADRÃO ----------
    const handleRestoreOrder = () => {
        const uniqueDefault = Array.from(new Set(DEFAULT_SECTIONS))
        setSections(uniqueDefault)
        localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(uniqueDefault))
        setEditMode(false)
    }

    const toggleEditMode = () => {
        setEditMode((prev) => !prev)
    }

    // ---------- SALVAR LOCALIZAÇÃO (APENAS NO BANCO) ----------
    const handleLocationSave = async (location: {
        lat: number;
        lng: number;
        address: string;
        addressNumber?: string;
        addressComplement?: string;
    }) => {
        setIsSavingLocation(true)
        try {
            const { data: { user }, error: authError } = await supabase.auth.getUser()
            if (!user) {
                // Visitante: guarda só neste aparelho, apenas pra calcular o que está perto
                const deviceLocation = {
                    lat: location.lat,
                    lng: location.lng,
                    address: location.address,
                    addressNumber: location.addressNumber || '',
                    addressComplement: location.addressComplement || '',
                }
                try { localStorage.setItem(DEVICE_LOCATION_KEY, JSON.stringify(deviceLocation)) } catch { /* sem storage: vale só até recarregar */ }
                setSavedLocation(deviceLocation)
                setShowLocationDialog(false)
                setIsSavingLocation(false)
                toast.success('Local definido neste aparelho — usamos só pra mostrar o que está perto de você.')
                return
            }

            const { data, error } = await supabase
                .from('profiles')
                .upsert({
                    id: user.id,
                    address: location.address,
                    address_number: location.addressNumber || null,
                    address_complement: location.addressComplement || null,
                    store_lat: location.lat,
                    store_lng: location.lng,
                }, {
                    onConflict: 'id',
                    ignoreDuplicates: false
                })
                .select('address, address_number, address_complement, store_lat, store_lng')
                .single()

            if (error) {
                alert('Erro ao salvar: ' + error.message)
            } else {
                if (data) {
                    setSavedLocation({
                        lat: data.store_lat,
                        lng: data.store_lng,
                        address: data.address || 'Local salvo',
                        addressNumber: data.address_number || '',
                        addressComplement: data.address_complement || ''
                    })
                }
                alert('Localização salva com sucesso!')
            }
        } catch (err) {
            alert('Erro: ' + (err as Error).message)
        } finally {
            setIsSavingLocation(false)
            setShowLocationDialog(false)
        }
    }

    // ---------- REMOVER LOCALIZAÇÃO (recomeçar do zero) ----------
    const handleLocationClear = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
                const { error } = await supabase
                    .from('profiles')
                    .update({ address: null, address_number: null, address_complement: null, store_lat: null, store_lng: null })
                    .eq('id', user.id)
                if (error) throw error
            } else {
                try { localStorage.removeItem(DEVICE_LOCATION_KEY) } catch { /* ok */ }
            }
            setSavedLocation(null)
            setShowLocationDialog(false)
            toast.success('Localização removida.')
        } catch (err) {
            toast.error('Erro ao remover: ' + ((err as Error).message || 'tente de novo'))
        }
    }

    // ---------- RENDERIZAR SEÇÃO ----------
    const renderSection = (sectionId: string) => {
        switch (sectionId) {
            case 'storeList':
                return (
                    <StoreList
                        title="Lojas"
                        subtitle="Conheça as lojas e peça pelo iUser"
                        maxItems={5}
                        onStoreClick={(storeSlug) => {
                            startNavProgress()
                            router.push(`/${storeSlug}`)
                        }}
                    />
                )
            case 'careerPlans':
                return <CareerPlans />
            case 'orderSection':
                return (
                    <OrderSection
                        isEditing={editMode}
                        onToggleEdit={toggleEditMode}
                        onSave={handleSaveOrder}
                        onRestore={handleRestoreOrder}
                        disabled={loading}
                        defaultOrder={DEFAULT_SECTIONS}
                    />
                )
            case 'categorias':
                return <CategoriasSection />
            case 'radar':
                return <RadarSection origin={savedLocation ? { lat: savedLocation.lat, lng: savedLocation.lng } : null} userId={userId} onDefineLocation={() => setShowLocationDialog(true)} />
            case 'productShowcase':
                return <ProductShowcase />
            case 'publicationShowcase':
                return <FeaturedPublications maxItems={6} />
            case 'communities':
                return <CommunitiesPreview origin={savedLocation ? { lat: savedLocation.lat, lng: savedLocation.lng } : null} />
            case 'profileShowcase':
                return <FeaturedProfiles />
            case 'motorista':
                return <MotoristaSection onBreveStatusChange={breveCallbacks.motorista} onUrgentChange={setMotoristaUrgent} />
            case 'canalMotorista':
                return <AcceptARider onUrgentChange={setCanalMotoristaUrgent} />
            case 'meusPedidos':
                return <MyServiceRequests onUrgentChange={setServicoUrgent} />
            case 'servicosOferecidos':
                return <OfferAService />
            case 'servicosProcurados':
                return <NeedAService />
            default:
                return null
        }
    }

    // As "abas" da home (perfil, minha rede, loja, criar loja, login) viviam
    // só em useState - trocar de aba nunca mudava a URL. Resultado: sair pra
    // outra página e apertar "voltar" sempre caía na home (nenhuma aba tinha
    // ficado registrada no histórico do navegador). Agora cada aba é
    // refletida em ?view=.../&store=... com router.push (cria uma entrada
    // de histórico de verdade) e um efeito abaixo sincroniza os estados a
    // partir da URL sempre que ela muda - inclusive via botão "voltar".
    const showHomeSections = () => router.push('/')
    const handleLoginClick = () => router.push('/?view=login')
    const handleProfileClick = () => {
        router.push(profileSlug && !loading ? '/?view=perfil' : '/?view=login')
    }
    const handleStoreDashboardClick = (storeSlug: string) => {
        router.push(`/?view=loja&store=${encodeURIComponent(storeSlug)}`)
    }
    const handleCreateStoreClick = () => router.push('/?view=criar-loja')

    useEffect(() => {
        const view = searchParams.get('view')
        // 'rede' era a aba Minha Rede (agora dentro do perfil, em "Minha graduação"): links antigos caem no perfil.
        if (view === 'perfil' || view === 'rede') {
            setShowProfile(true); setShowLogin(false); setShowCreateStore(false); setShowStoreDashboard(null)
        } else if (view === 'login') {
            setShowLogin(true); setShowProfile(false); setShowCreateStore(false); setShowStoreDashboard(null)
        } else if (view === 'criar-loja') {
            setShowCreateStore(true); setShowLogin(false); setShowProfile(false); setShowStoreDashboard(null)
        } else if (view === 'loja') {
            const storeSlugParam = searchParams.get('store')
            const store = stores.find((s) => s.slug === storeSlugParam)
            if (store) {
                setShowStoreDashboard({ slug: store.slug, name: store.name })
                setShowCreateStore(false); setShowLogin(false); setShowProfile(false)
            } else if (!loadingStores) {
                // A loja da URL não é (mais) de quem está logado agora — ex:
                // deslogou e logou com outra conta, ou trocou de conta nessa
                // aba. Sem isso, o painel da loja antiga ficava preso na tela
                // (loadDashboard do StoreDashboard só olha o slug, não quem
                // está logado, e mostrava a loja errada pro novo usuário).
                setShowStoreDashboard(null)
            }
        } else {
            setShowCreateStore(false); setShowLogin(false); setShowProfile(false); setShowStoreDashboard(null)
        }
    }, [searchParams, stores])

    const tabs = useMemo(() => {
        const isLoggedIn = !!profileSlug && !loading
        const allTabs: any[] = [
            {
                id: 'perfil',
                label: isLoggedIn ? `@${profileSlug}` : 'Entrar',
                icon: User,
                imageUrl: isLoggedIn ? avatarUrl : null,
                onClick: handleProfileClick,
                isActive: (isLoggedIn && showProfile) || (!isLoggedIn && showLogin),
                badge: isLoggedIn && pendingInvitesCount > 0 ? { count: pendingInvitesCount, color: '#22c55e' } : null,
                statusColor: isLoggedIn ? (profileOpenNow ? '#22c55e' : '#ef4444') : undefined,
            },
        ]

        // Administrador geral: a aba logo depois do perfil, antes das lojas
        if (adminTab) allTabs.push(adminTab)

        if (loadingStores) {
            return allTabs
        }

        if (stores.length > 0) {
            stores.forEach((s) => {
                const counts = storeOrderCounts[s.id] || { pending: 0, preparing: 0, ready: 0 }
                const hasActive = counts.pending + counts.preparing + counts.ready > 0

                const openNow = isStoreOpenNow(s.business_hours)
                const statusColor = openNow ? '#22c55e' : '#ef4444'

                allTabs.push({
                    id: `loja-${s.slug}`,
                    label: s.name,
                    icon: LayoutDashboard,
                    imageUrl: s.logoUrl,
                    onClick: () => handleStoreDashboardClick(s.slug),
                    isActive: showStoreDashboard?.slug === s.slug,
                    indicator: hasActive ? counts : null,
                    statusColor,
                })
            })
        }

        // "Cadastrar loja" fica sempre à mão — mesmo quem já tem loja pode criar outra.
        allTabs.push({
            id: 'criar-loja',
            label: stores.length > 0 ? 'Nova loja' : 'Cadastrar loja',
            icon: Store,
            imageUrl: null,
            onClick: isLoggedIn
                ? () => { startNavProgress(); router.push('/criar-loja') }
                : handleCreateStoreClick,
            isActive: !isLoggedIn && showCreateStore,
            glow: !isLoggedIn,
        })

        // Visitante: "Ser motorista" leva pro painel do motorista já na tela de cadastro.
        if (!isLoggedIn) {
            allTabs.push({
                id: 'ser-motorista',
                label: 'Ser motorista',
                icon: Car,
                imageUrl: null,
                onClick: () => { startNavProgress(); router.push('/painel-motorista') },
                isActive: false,
                glow: true,
            })
        }

        // Veículos (um por tipo cadastrado) + "Cadastrar veículo" enquanto faltar algum tipo.
        if (isLoggedIn) {
            allTabs.push(...buildVehicleTabs(myVehicles, (url) => { startNavProgress(); router.push(url) }))
        }

        return allTabs
    }, [profileSlug, loading, avatarUrl, showCreateStore, showLogin, showProfile, showStoreDashboard, adminTab, stores, loadingStores, storeOrderCounts, pendingInvitesCount, profileOpenNow, myVehicles, router])

    const showFab = showCreateStore || showLogin || showProfile || showStoreDashboard

    // ===== VERIFICAR SE ESTÁ EM TELA DE LOGIN =====
    const isLoginScreen = showLogin || showCreateStore

    // ===== VERIFICAR SE ESTÁ EM DASHBOARD =====
    const isDashboardScreen = showProfile || showStoreDashboard

    // ===== VERIFICAR SE ESTÁ PESQUISANDO =====
    const isSearching = searchQuery.trim().length > 0

    // ===== FUNÇÃO PARA LIMPAR A BUSCA =====
    const clearSearch = () => {
        setSearchQuery('')
        setSearchFocused(false)
        if (searchInputRef.current) {
            searchInputRef.current.blur()
        }
    }

    // ===== FUNÇÃO PARA FOCAR A BUSCA =====
    const handleSearchFocus = () => {
        setHasInteractedWithSearch(true)
        if (!isSearching && !isLoginScreen && !isDashboardScreen) {
            setSearchFocused(true)
        }
    }

    // ===== VERIFICAR SE DEVE MOSTRAR A BUSCA =====
    const shouldShowSearch = !isLoginScreen && !isDashboardScreen

    return (
        <div className="relative min-h-dvh" style={{ background: colors.background }}>
            <div className="fixed inset-0 z-0">
                <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
            </div>

            <main className="relative z-10 min-h-dvh pb-28" style={{ overscrollBehavior: 'none' }}>
                <Header
                    title="iUser"
                    showBack={false}
                    greeting={`Olá, ${loading ? '...' : profileSlug ? `@${profileSlug}` : 'Visitante'}`}
                    avatarUrl={avatarUrl}
                    loading={loading}
                    tabs={tabs}
                    showSearch={shouldShowSearch}
                    searchPlaceholder="Procurar, espetinho, cabeleireiro..."
                    searchValue={searchQuery}
                    searchRef={searchInputRef}
                    onSearch={(query) => {
                        setSearchQuery(query)
                    }}
                    onSearchFocus={handleSearchFocus}
                    onSearchBlur={() => {
                        setTimeout(() => {
                            const activeElement = document.activeElement
                            const isLastSearched = activeElement?.closest?.('.last-searched-container')
                            const isSearchResult = activeElement?.closest?.('.search-result-item')
                            if (!isLastSearched && !isSearchResult) {
                                setSearchFocused(false)
                            }
                        }, 200)
                    }}
                    profileSlug={profileSlug}
                    locationElement={
                        !isLoginScreen && (
                            <button
                                onClick={() => setShowLocationDialog(true)}
                                disabled={isSavingLocation}
                                className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-black/10 hover:bg-black/20 transition disabled:opacity-50"
                                style={{ color: colors.textPrimary }}
                            >
                                <MapPin size={14} />
                                {isSavingLocation
                                    ? 'Salvando...'
                                    : savedLocation
                                        ? formatAddress(savedLocation.address, savedLocation.addressNumber)
                                        : 'Definir local'
                                }
                            </button>
                        )
                    }
                />

                {showCreateStore ? (
                    <CreateStoreAndRegisterProfile
                        embedded
                        onBack={showHomeSections}
                    />
                ) : showLogin ? (
                    <LoginAndRegister onLoginSuccess={showHomeSections} />
                ) : showProfile ? (
                    <ProfileDashboard
                        profileSlug={profileSlug}
                        avatarUrl={avatarUrl}
                    />
                ) : showStoreDashboard ? (
                    <StoreDashboard
                        profileSlug={profileSlug || ''}
                        storeSlug={showStoreDashboard.slug}
                        onBack={showHomeSections}
                        onOrderCountsChange={handleOrderCountsChange}
                    />
                ) : (
                    <div className="mt-2 px-4 md:px-6">
                        {/* Enquanto está digitando, "Resultados para..." vem primeiro e
                            "Últimos acessados" fica embaixo. Sem busca ativa, o histórico
                            some (refocar sem limpar continua reexibindo os mesmos resultados
                            acima do histórico). */}
                        {isSearching && (
                            <div className="mb-6">
                                <SearchResultsSection
                                    searchQuery={searchQuery}
                                    onSearchSelect={(query) => {
                                        setSearchQuery(query)
                                        setSearchFocused(false)
                                        searchInputRef.current?.focus()
                                    }}
                                />
                            </div>
                        )}

                        {searchFocused && hasInteractedWithSearch && (
                            <div
                                className="mb-6 last-searched-container"
                                ref={lastSearchedRef}
                            >
                                <LastSearched
                                    onItemClick={(item) => {
                                        if (item.url) {
                                            setSearchFocused(false)
                                            setSearchQuery('')
                                            startNavProgress()
                                            setTimeout(() => {
                                                router.push(item.url)
                                            }, 50)
                                        }
                                    }}
                                    onClearResults={clearSearch}
                                />
                            </div>
                        )}

                        {!isSearching && (
                            <>
                                {!searchFocused && !isSearching && (
                                    <>
                                        {editMode ? (
                                            <div className="space-y-6">
                                                {Array.from(new Set(sections)).map((sectionId, index) => {
                                                    const section = renderSection(sectionId)
                                                    if (!section) return null
                                                    const uniqueSections = Array.from(new Set(sections))
                                                    const isFirst = index === 0
                                                    const isLast = index === uniqueSections.length - 1
                                                    const isCategorias = sectionId === 'categorias'

                                                    return (
                                                        <SortableSection
                                                            key={sectionId}
                                                            id={sectionId}
                                                            isEditing={editMode}
                                                            onMoveUp={!isCategorias ? (id: string) => moveSection(id, 'up') : undefined}
                                                            onMoveDown={!isCategorias ? (id: string) => moveSection(id, 'down') : undefined}
                                                            isFirst={isFirst}
                                                            isLast={isLast}
                                                        >
                                                            {section}
                                                        </SortableSection>
                                                    )
                                                })}
                                            </div>
                                        ) : (
                                            <div className="space-y-6">
                                                {displayedSections.map((sectionId) => {
                                                    const section = renderSection(sectionId)
                                                    if (!section) return null
                                                    return <div key={sectionId}>{section}</div>
                                                })}
                                            </div>
                                        )}
                                    </>
                                )}
                            </>
                        )}
                    </div>
                )}


                {/* ===== BOTÃO FLUTUANTE - VOLTAR ===== */}
                <div style={{ position: 'fixed', bottom: 32, right: 24, zIndex: 40 }}>
                    <div className="flex flex-col-reverse sm:flex-row items-end gap-3">
                        {showFab && (
                            <button
                                onClick={showHomeSections}
                                className="w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-transform duration-200 hover:scale-110 active:scale-95 flex-shrink-0"
                                style={{
                                    background: GRADIENT,
                                    color: '#ffffff',
                                    borderTop: '2px solid #f97316',
                                    borderRight: '2px solid #f97316',
                                    borderBottom: '2px solid #f97316',
                                    borderLeft: '2px solid #f97316',
                                    boxShadow: `0 8px 24px #f9731660`,
                                }}
                                aria-label="Voltar ao início"
                            >
                                <Home size={24} />
                            </button>
                        )}
                    </div>
                </div>

                {/* No painel do perfil: "Adicionar" (publicação ou serviço) fica na mesma linha do botão da home, no canto esquerdo */}
                {showProfile && (
                    <div style={{ position: 'fixed', bottom: 32, left: 24, zIndex: 40 }}>
                        <AddMenuFab />
                    </div>
                )}

                {/* ===== LOCATION PICKER - APENAS QUANDO NÃO ESTÁ EM TELA DE LOGIN/REGISTRO ===== */}
                {!isLoginScreen && showLocationDialog && (
                    <LocationPicker
                        initialLocation={savedLocation ? {
                            lat: savedLocation.lat,
                            lng: savedLocation.lng,
                            address: savedLocation.address,
                            addressNumber: savedLocation.addressNumber || '',
                            addressComplement: savedLocation.addressComplement || ''
                        } : null}
                        onSave={handleLocationSave}
                        onClose={() => setShowLocationDialog(false)}
                        allowDriverSync={false}
                        allowGuest
                        onClear={savedLocation ? handleLocationClear : undefined}
                    />
                )}
            </main>

            <style jsx global>{`
                @keyframes badge-pop {
                    0% { transform: scale(0); opacity: 0; }
                    50% { transform: scale(1.5); }
                    100% { transform: scale(1); opacity: 1; }
                }
                .animate-badge-pop { animation: badge-pop 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
            `}</style>
        </div>
    )
}

// useSearchParams() (usado pra manter a aba ativa na URL, ver comentário
// acima de showHomeSections) exige um Suspense boundary explícito, senão o
// build falha na página "/" (bailout de CSR sem Suspense).
export default function HomePage() {
    return (
        <Suspense fallback={null}>
            <HomePageContent />
        </Suspense>
    )
}