// src/versions/v3/screens/AnunciarImovelScreen.tsx
//
// /anunciar-imovel na interface 3.0: o formulário para ANUNCIAR (ou editar, com ?editar=<id>) um imóvel para alugar — mensal ou
// temporada, qualquer tipo. Pede o endereço completo, que fica PRIVADO (só o dono e quem tem visita confirmada veem); o público vê
// bairro e cidade. Anunciar exige plano ativo e, no pós-pago, gera a taxa "Imóvel anunciado" (as regras são do banco, migration 20261126).
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from '@/lib/toast'
import { ArrowLeft, Building2, Camera, LocateFixed, Trash2, Wallet } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { Spinner } from '@/components/Spinner'
import { AMENITIES, PROPERTY_TYPES, RENTAL_KINDS, approxCoord, listingSlug, validateListing, type PropertyType, type RentalKind } from '@/modules/rentals/domain'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'
const num = (s: string): number | null => { const n = parseFloat(String(s).replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : null }
const int = (s: string): number | null => { const n = parseInt(s, 10); return Number.isFinite(n) ? n : null }

interface Photo { key: string; path?: string; file?: File; url: string }

export default function AnunciarImovelScreen() {
    const { colors } = useTheme()
    const router = useRouter()
    const { userId, loading: profileLoading } = useProfile()
    const soft = `${colors.border}40`
    const fileRef = useRef<HTMLInputElement>(null)

    const [editId, setEditId] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [stores, setStores] = useState<{ id: string; name: string }[]>([])
    const [storeId, setStoreId] = useState('')
    const [errors, setErrors] = useState<Record<string, string>>({})
    const [needPlan, setNeedPlan] = useState(false)

    const [title, setTitle] = useState('')
    const [propertyType, setPropertyType] = useState<PropertyType | ''>('')
    const [kind, setKind] = useState<RentalKind>('mensal')
    const [price, setPrice] = useState('')
    const [condo, setCondo] = useState('')
    const [iptu, setIptu] = useState('')
    const [deposit, setDeposit] = useState('')
    const [bedrooms, setBedrooms] = useState('')
    const [bathrooms, setBathrooms] = useState('')
    const [parking, setParking] = useState('')
    const [area, setArea] = useState('')
    const [furnished, setFurnished] = useState(false)
    const [pets, setPets] = useState(false)
    const [amenities, setAmenities] = useState<string[]>([])
    const [description, setDescription] = useState('')
    const [rules, setRules] = useState('')
    const [minStay, setMinStay] = useState('')
    const [maxGuests, setMaxGuests] = useState('')
    const [availableFrom, setAvailableFrom] = useState('')
    const [neighborhood, setNeighborhood] = useState('')
    const [city, setCity] = useState('')
    const [stateUf, setStateUf] = useState('')
    const [address, setAddress] = useState('')
    const [number, setNumber] = useState('')
    const [complement, setComplement] = useState('')
    const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
    const [photos, setPhotos] = useState<Photo[]>([])

    // Minhas lojas (anunciar em nome de uma imobiliária) e, em edição, o anúncio
    useEffect(() => {
        if (profileLoading) return
        if (!userId) { router.replace(`/login?redirect=${encodeURIComponent('/anunciar-imovel')}`); return }
        let alive = true
        ;(async () => {
            const { data: st } = await supabase.from('stores').select('id, name').eq('owner_id', userId)
            if (alive) setStores((st as any[]) || [])
            const id = new URLSearchParams(window.location.search).get('editar')
            if (id) {
                const [{ data: l }, { data: p }] = await Promise.all([
                    supabase.from('rental_listings').select('*').eq('id', id).eq('owner_id', userId).maybeSingle(),
                    supabase.from('rental_listing_private').select('*').eq('listing_id', id).maybeSingle(),
                ])
                if (alive && l) {
                    setEditId(l.id); setStoreId(l.store_id || ''); setTitle(l.title); setPropertyType(l.property_type); setKind(l.rental_kind)
                    setPrice(String(l.price)); setCondo(l.condo_fee ? String(l.condo_fee) : ''); setIptu(l.iptu_fee ? String(l.iptu_fee) : ''); setDeposit(l.deposit_amount ? String(l.deposit_amount) : '')
                    setBedrooms(l.bedrooms != null ? String(l.bedrooms) : ''); setBathrooms(l.bathrooms != null ? String(l.bathrooms) : ''); setParking(l.parking != null ? String(l.parking) : ''); setArea(l.area_m2 != null ? String(l.area_m2) : '')
                    setFurnished(!!l.furnished); setPets(!!l.pets_allowed); setAmenities(l.amenities || []); setDescription(l.description || ''); setRules(l.rules || '')
                    setMinStay(l.min_stay_days != null ? String(l.min_stay_days) : ''); setMaxGuests(l.max_guests != null ? String(l.max_guests) : ''); setAvailableFrom(l.available_from || '')
                    setNeighborhood(l.neighborhood); setCity(l.city); setStateUf(l.state || '')
                    setPhotos(((l.photos as string[]) || []).map((path) => ({ key: path, path, url: supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl })))
                    if (p) { setAddress(p.address || ''); setNumber(p.number || ''); setComplement(p.complement || ''); if (p.lat != null && p.lng != null) setCoords({ lat: p.lat, lng: p.lng }) }
                }
            }
            if (alive) setLoading(false)
        })()
        return () => { alive = false }
    }, [userId, profileLoading, router])

    const addPhotos = (files: FileList | null) => {
        if (!files) return
        const list = [...files].slice(0, 12 - photos.length).map((file) => ({ key: `${file.name}-${file.size}-${Math.random()}`, file, url: URL.createObjectURL(file) }))
        setPhotos((p) => [...p, ...list])
    }
    const useMyLocation = () => {
        if (!navigator.geolocation) { toast.error('Seu aparelho não informa a localização.'); return }
        navigator.geolocation.getCurrentPosition((pos) => { setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }); toast.success('Localização guardada (o público só vê uma posição aproximada).') }, () => toast.error('Não consegui pegar a localização.'))
    }
    const toggleAmenity = (a: string) => setAmenities((cur) => (cur.includes(a) ? cur.filter((x) => x !== a) : [...cur, a]))

    const submit = async () => {
        if (!userId) return
        const errs = validateListing({
            title, propertyType, rentalKind: kind, price: num(price), condoFee: num(condo), iptuFee: num(iptu), depositAmount: num(deposit), neighborhood, city, address,
            bedrooms: int(bedrooms), minStayDays: int(minStay), maxGuests: int(maxGuests), photos: photos.length,
        })
        setErrors(errs)
        if (Object.keys(errs).length > 0) { toast.error('Falta preencher alguns campos.'); document.getElementById(`f-${Object.keys(errs)[0]}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return }
        setSaving(true)
        setNeedPlan(false)
        try {
            // fotos novas sobem para o Storage (as que já estavam ficam como estão)
            const paths: string[] = []
            for (const [i, ph] of photos.entries()) {
                if (ph.path) { paths.push(ph.path); continue }
                const ext = (ph.file!.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
                const path = `rental-${userId}-${Date.now()}-${i}.${ext}`
                const { error } = await supabase.storage.from('product-images').upload(path, ph.file!, { contentType: ph.file!.type || undefined })
                if (error) throw error
                paths.push(path)
            }
            const row: Record<string, unknown> = {
                store_id: storeId || null, title: title.trim(), description: description.trim() || null, property_type: propertyType, rental_kind: kind, price_period: kind === 'mensal' ? 'mes' : 'dia',
                price: num(price) ?? 0, condo_fee: num(condo) ?? 0, iptu_fee: num(iptu) ?? 0, deposit_amount: num(deposit) ?? 0,
                bedrooms: int(bedrooms), bathrooms: int(bathrooms), parking: int(parking), area_m2: num(area), furnished, pets_allowed: pets, amenities, rules: rules.trim() || null, photos: paths,
                neighborhood: neighborhood.trim(), city: city.trim(), state: stateUf.trim().toUpperCase() || null,
                approx_lat: coords ? approxCoord(coords.lat) : null, approx_lng: coords ? approxCoord(coords.lng) : null,
                available_from: availableFrom || null, min_stay_days: kind === 'temporada' ? int(minStay) : null, max_guests: kind === 'temporada' ? int(maxGuests) : null,
            }
            let id = editId
            let slug = ''
            if (editId) {
                const { error } = await supabase.from('rental_listings').update(row).eq('id', editId)
                if (error) throw error
                slug = (await supabase.from('rental_listings').select('slug').eq('id', editId).single()).data?.slug
            } else {
                slug = listingSlug(title, neighborhood)
                const { data, error } = await supabase.from('rental_listings').insert({ ...row, owner_id: userId, slug }).select('id').single()
                if (error) throw error
                id = data.id
            }
            const priv = { listing_id: id, address: address.trim(), number: number.trim() || null, complement: complement.trim() || null, lat: coords?.lat ?? null, lng: coords?.lng ?? null }
            const { error: pe } = await supabase.from('rental_listing_private').upsert(priv)
            if (pe) throw pe
            toast.success(editId ? 'Anúncio atualizado' : 'Imóvel anunciado!')
            router.push(`/imoveis/${slug}`)
        } catch (e: any) {
            const msg = String(e?.message || '')
            if (/plano ativo|dívida/i.test(msg)) { setNeedPlan(true); toast.error(msg) } else toast.error(msg || 'Não foi possível salvar o anúncio.')
        } finally {
            setSaving(false)
        }
    }

    const field = (id: string, label: string, el: React.ReactNode, hint?: string) => (
        <label className="block" id={`f-${id}`}>
            <span className="block text-[12px] font-black mb-1" style={{ color: colors.textPrimary }}>{label}</span>
            {el}
            {hint && <span className="block text-[11px] mt-1" style={{ color: colors.textSecondary }}>{hint}</span>}
            {errors[id] && <span className="block text-[11px] mt-1 font-bold" style={{ color: '#ef4444' }}>{errors[id]}</span>}
        </label>
    )
    const input = (value: string, set: (v: string) => void, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
        <input value={value} onChange={(e) => set(e.target.value)} {...extra} className="w-full h-11 px-4 rounded-2xl text-sm focus:outline-none" style={{ background: soft, color: colors.textPrimary }} />
    )
    const section = (t: string, children: React.ReactNode) => (
        <section className="mt-6"><h2 className="text-base font-black mb-3" style={{ color: colors.textPrimary }}>{t}</h2><div className="flex flex-col gap-3">{children}</div></section>
    )
    const grid2 = 'grid grid-cols-2 gap-3'
    const isTemporada = kind === 'temporada'
    const selectedStore = useMemo(() => stores.find((s) => s.id === storeId), [stores, storeId])

    if (loading) return <div className="flex justify-center py-24"><Spinner size={28} color={colors.accent} /></div>

    return (
        <div className="pb-32">
            <div className="flex items-center gap-2">
                <button onClick={() => router.back()} aria-label="Voltar" className="flex-shrink-0 rounded-full flex items-center justify-center" style={{ width: 46, height: 46, background: soft, color: colors.textPrimary }}><ArrowLeft size={20} /></button>
                <h1 className="text-xl font-black" style={{ color: colors.textPrimary }}>{editId ? 'Editar anúncio' : 'Anunciar imóvel'}</h1>
            </div>

            {needPlan && (
                <div className="mt-4 rounded-3xl p-4 flex items-start gap-3" style={{ background: '#f973161a', border: '1px solid #f9731640' }}>
                    <Wallet size={20} className="flex-shrink-0 mt-0.5" style={{ color: '#f97316' }} />
                    <div className="min-w-0">
                        <p className="text-sm font-black" style={{ color: colors.textPrimary }}>Para anunciar você precisa de um plano ativo</p>
                        <p className="text-xs mt-0.5" style={{ color: colors.textSecondary }}>Pós-pago: R$ 0,50 por imóvel anunciado, sem mensalidade. Pré-pago: sem taxa por anúncio.</p>
                        <button onClick={() => router.push('/planos')} className="mt-2 h-9 px-4 rounded-full text-xs font-black text-white" style={{ background: GRADIENT }}>Ver planos</button>
                    </div>
                </div>
            )}

            {section('Fotos', (
                <div id="f-photos">
                    <div className="grid grid-cols-3 gap-2">
                        {photos.map((p, i) => (
                            <div key={p.key} className="relative aspect-square rounded-2xl overflow-hidden" style={{ background: soft }}>
                                <img src={p.url} alt="" className="w-full h-full object-cover" />
                                {i === 0 && <span className="absolute left-1.5 top-1.5 text-[10px] font-black px-2 py-0.5 rounded-full text-white" style={{ background: GRADIENT }}>Capa</span>}
                                <button onClick={() => setPhotos((cur) => cur.filter((x) => x.key !== p.key))} aria-label="Remover foto" className="absolute right-1.5 top-1.5 w-7 h-7 rounded-full flex items-center justify-center text-white" style={{ background: 'rgba(0,0,0,0.6)' }}><Trash2 size={13} /></button>
                            </div>
                        ))}
                        {photos.length < 12 && (
                            <button onClick={() => fileRef.current?.click()} className="aspect-square rounded-2xl flex flex-col items-center justify-center gap-1 text-xs font-black" style={{ background: soft, color: colors.textPrimary, border: `1.5px dashed ${colors.border}` }}>
                                <Camera size={22} style={{ color: '#f97316' }} /> Adicionar
                            </button>
                        )}
                    </div>
                    <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { addPhotos(e.target.files); e.target.value = '' }} />
                    <p className="text-[11px] mt-2" style={{ color: colors.textSecondary }}>Até 12 fotos. A primeira é a capa.</p>
                    {errors.photos && <p className="text-[11px] mt-1 font-bold" style={{ color: '#ef4444' }}>{errors.photos}</p>}
                </div>
            ))}

            {section('O imóvel', (
                <>
                    {stores.length > 0 && field('store', 'Anunciar como', (
                        <select value={storeId} onChange={(e) => setStoreId(e.target.value)} className="w-full h-11 px-4 rounded-2xl text-sm focus:outline-none" style={{ background: soft, color: colors.textPrimary }}>
                            <option value="">Eu mesmo (pessoa)</option>
                            {stores.map((s) => <option key={s.id} value={s.id}>{s.name} (imobiliária/loja)</option>)}
                        </select>
                    ), selectedStore ? 'Aparece com o selo "Imobiliária" e o nome da sua loja.' : undefined)}
                    {field('title', 'Título do anúncio', input(title, setTitle, { placeholder: 'Ex.: Apartamento 2 quartos perto do shopping', maxLength: 120 }))}
                    {field('propertyType', 'Tipo de imóvel', (
                        <select value={propertyType} onChange={(e) => setPropertyType(e.target.value as PropertyType)} className="w-full h-11 px-4 rounded-2xl text-sm focus:outline-none" style={{ background: soft, color: colors.textPrimary }}>
                            <option value="">Escolha…</option>
                            {PROPERTY_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                        </select>
                    ))}
                    <div className="flex gap-2">
                        {RENTAL_KINDS.map((k) => <button key={k.id} onClick={() => setKind(k.id)} className="flex-1 h-11 rounded-full text-[13px] font-black" style={kind === k.id ? { background: GRADIENT, color: '#fff' } : { background: soft, color: colors.textPrimary }}>{k.label}</button>)}
                    </div>
                    <div className={grid2}>
                        {field('bedrooms', 'Quartos', input(bedrooms, setBedrooms, { inputMode: 'numeric', placeholder: '0' }))}
                        {field('bathrooms', 'Banheiros', input(bathrooms, setBathrooms, { inputMode: 'numeric', placeholder: '0' }))}
                        {field('parking', 'Vagas', input(parking, setParking, { inputMode: 'numeric', placeholder: '0' }))}
                        {field('area', 'Área (m²)', input(area, setArea, { inputMode: 'decimal', placeholder: '0' }))}
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => setFurnished((v) => !v)} className="flex-1 h-11 rounded-full text-[13px] font-black" style={furnished ? { background: GRADIENT, color: '#fff' } : { background: soft, color: colors.textPrimary }}>Mobiliado</button>
                        <button onClick={() => setPets((v) => !v)} className="flex-1 h-11 rounded-full text-[13px] font-black" style={pets ? { background: GRADIENT, color: '#fff' } : { background: soft, color: colors.textPrimary }}>Aceita pet</button>
                    </div>
                    <div>
                        <span className="block text-[12px] font-black mb-1.5" style={{ color: colors.textPrimary }}>O que tem</span>
                        <div className="flex flex-wrap gap-2">{AMENITIES.map((a) => <button key={a} onClick={() => toggleAmenity(a)} className="h-9 px-3 rounded-full text-xs font-black" style={amenities.includes(a) ? { background: GRADIENT, color: '#fff' } : { background: soft, color: colors.textPrimary }}>{a}</button>)}</div>
                    </div>
                    {field('description', 'Descrição', <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} maxLength={4000} placeholder="Conte o que o imóvel tem de bom, a vizinhança, o que está incluso…" className="w-full px-4 py-3 rounded-2xl text-sm focus:outline-none resize-none" style={{ background: soft, color: colors.textPrimary }} />)}
                    {field('rules', 'Regras da casa (opcional)', <textarea value={rules} onChange={(e) => setRules(e.target.value)} rows={3} maxLength={1500} placeholder="Ex.: silêncio depois das 22h, não fuma…" className="w-full px-4 py-3 rounded-2xl text-sm focus:outline-none resize-none" style={{ background: soft, color: colors.textPrimary }} />)}
                </>
            ))}

            {section('Valores', (
                <>
                    <div className={grid2}>
                        {field('price', isTemporada ? 'Valor da diária (R$)' : 'Aluguel por mês (R$)', input(price, setPrice, { inputMode: 'decimal', placeholder: '0,00' }))}
                        {field('depositAmount', 'Caução (R$)', input(deposit, setDeposit, { inputMode: 'decimal', placeholder: '0,00' }), 'Garantia, se houver.')}
                        {!isTemporada && field('condoFee', 'Condomínio (R$)', input(condo, setCondo, { inputMode: 'decimal', placeholder: '0,00' }))}
                        {!isTemporada && field('iptuFee', 'IPTU por mês (R$)', input(iptu, setIptu, { inputMode: 'decimal', placeholder: '0,00' }))}
                        {isTemporada && field('minStayDays', 'Mínimo de diárias', input(minStay, setMinStay, { inputMode: 'numeric', placeholder: '1' }))}
                        {isTemporada && field('maxGuests', 'Máximo de hóspedes', input(maxGuests, setMaxGuests, { inputMode: 'numeric', placeholder: '2' }))}
                    </div>
                    {field('availableFrom', 'Disponível a partir de (opcional)', input(availableFrom, setAvailableFrom, { type: 'date' }))}
                    <p className="text-[11px]" style={{ color: colors.textSecondary }}>O iUser não recebe nem repassa o aluguel: o combinado e o pagamento são direto entre vocês.</p>
                </>
            ))}

            {section('Onde fica', (
                <>
                    <div className={grid2}>
                        {field('neighborhood', 'Bairro', input(neighborhood, setNeighborhood, { placeholder: 'Centro' }))}
                        {field('city', 'Cidade', input(city, setCity, { placeholder: 'Porto Velho' }))}
                    </div>
                    {field('state', 'Estado (UF, opcional)', input(stateUf, setStateUf, { placeholder: 'RO', maxLength: 2 }))}
                    {field('address', 'Rua / endereço', input(address, setAddress, { placeholder: 'Rua Dom Pedro II' }), 'Privado: só você e quem tiver visita confirmada veem. O público vê só o bairro.')}
                    <div className={grid2}>
                        {field('number', 'Número', input(number, setNumber))}
                        {field('complement', 'Complemento', input(complement, setComplement, { placeholder: 'Apto 31' }))}
                    </div>
                    <button onClick={useMyLocation} className="h-11 rounded-full flex items-center justify-center gap-2 text-[13px] font-black" style={{ background: soft, color: colors.textPrimary }}>
                        <LocateFixed size={16} style={{ color: '#f97316' }} /> {coords ? 'Localização guardada — usar de novo' : 'Usar minha localização atual (opcional)'}
                    </button>
                </>
            ))}

            <div className="fixed inset-x-0 z-30 px-4 pb-4 pt-6 pointer-events-none" style={{ bottom: 'var(--staging-banner-h, 0px)', background: `linear-gradient(to top, ${colors.background} 55%, transparent)` }}>
                <div className="max-w-lg mx-auto pointer-events-auto">
                    <button onClick={submit} disabled={saving} className="w-full h-14 rounded-full flex items-center justify-center gap-2 text-white font-black text-sm disabled:opacity-60" style={{ background: GRADIENT, boxShadow: '0 8px 24px #f9731655' }}>
                        {saving ? <Spinner size={18} color="#fff" /> : <Building2 size={18} />} {editId ? 'Salvar alterações' : 'Publicar anúncio'}
                    </button>
                </div>
            </div>
        </div>
    )
}
