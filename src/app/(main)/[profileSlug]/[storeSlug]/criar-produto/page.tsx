// app/(main)/[profileSlug]/[storeSlug]/criar-produto/page.tsx
"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import {
  ImageIcon,
  Package,
  Monitor,
  Briefcase,
  MapPinned,
  Edit3,
  ArrowLeft,
  Plus,
  Sparkles,
  Clock,
  DollarSign,
  ShoppingCart,
  Timer,
  MapPin,
  Home,
  Search,
  Navigation,
  MoveVertical,
  Hash,
  FileText,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import AnimatedBackground from "@/components/AnimatedBackground";
import { useProfile } from "@/app/contexts/ProfileContext";
import Header from "@/app/Header";

type ProductType = "physical" | "digital" | "service";
type PriceType = "fixed" | "hourly";

// Cache para geocodificação
const geocodeCache: Map<string, { lat: number; lng: number; address: string } | null> = new Map();
const reverseGeocodeCache: Map<string, string> = new Map();

async function geocodeAddress(query: string): Promise<{ lat: number; lng: number; address: string } | null> {
  const key = query.toLowerCase().trim();
  if (geocodeCache.has(key)) return geocodeCache.get(key)!;

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&addressdetails=1`,
      { headers: { 'User-Agent': 'iUserApp/1.0', 'Accept-Language': 'pt-BR' } }
    );
    if (!res.ok) throw new Error('Erro');
    const data = await res.json();

    if (data?.length > 0) {
      const result = {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
        address: data[0].display_name || query
      };
      geocodeCache.set(key, result);
      return result;
    }
    geocodeCache.set(key, null);
    return null;
  } catch {
    return null;
  }
}

async function reverseGeocode(lat: number, lng: number): Promise<{
  fullAddress: string;
  streetDisplay: string;
  extractedNumber: string;
}> {
  const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`,
      { headers: { 'User-Agent': 'iUserApp/1.0', 'Accept-Language': 'pt-BR' } }
    );
    if (!res.ok) throw new Error('Erro');
    const data = await res.json();

    let formatted = '';
    let extractedNumber = '';

    if (data?.address) {
      const addr = data.address;
      const street = addr.road || addr.street || '';
      const number = addr.house_number || '';
      const neighbourhood = addr.neighbourhood || addr.suburb || addr.district || '';
      const city = addr.city || addr.town || addr.municipality || '';
      const state = addr.state || '';

      extractedNumber = number;

      const parts = [];
      if (street) {
        parts.push(number ? `${street}, ${number}` : street);
      }
      if (neighbourhood) parts.push(neighbourhood);
      if (city) parts.push(city);
      if (state) parts.push(state);

      formatted = parts.length > 0 ? parts.join(', ') : data.display_name || '';
    }

    if (!formatted) {
      formatted = data?.display_name || '';
    }

    if (!formatted) {
      formatted = `Local (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
    }

    reverseGeocodeCache.set(key, formatted);

    return {
      fullAddress: formatted,
      streetDisplay: extractStreetDisplay(formatted),
      extractedNumber
    };
  } catch {
    const fallback = `Local (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
    reverseGeocodeCache.set(key, fallback);
    return { fullAddress: fallback, streetDisplay: fallback, extractedNumber: '' };
  }
}

function extractStreetDisplay(fullAddress: string): string {
  if (fullAddress.startsWith('Local (')) return fullAddress;
  const parts = fullAddress.split(',');
  return parts[0].trim();
}

export default function CriarProdutoParaLoja() {
  const router = useRouter();
  const params = useParams();
  const { bgMode, customBgUrl, loading: profileLoading, avatarUrl: contextAvatarUrl } = useProfile();

  const storeSlug = Array.isArray(params.storeSlug)
    ? params.storeSlug[0]
    : params.storeSlug;

  const profileSlug = Array.isArray(params.profileSlug)
    ? params.profileSlug[0]
    : params.profileSlug;

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const movableMarkerRef = useRef<any>(null);
  const isMovingRef = useRef(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const initializedRef = useRef(false);

  const [storeId, setStoreId] = useState<string | null>(null);
  const [storeWhatsapp, setStoreWhatsapp] = useState<string | null>(null);
  const [storeAddress, setStoreAddress] = useState<string>("");
  const [storeLat, setStoreLat] = useState<number | null>(null);
  const [storeLng, setStoreLng] = useState<number | null>(null);

  const [loading, setLoading] = useState(false);
  const [loadingLocation, setLoadingLocation] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [type, setType] = useState<ProductType>("physical");
  const [priceType, setPriceType] = useState<PriceType>("fixed");
  const [category, setCategory] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [existingCategories, setExistingCategories] = useState<string[]>([]);
  const [durationMinutes, setDurationMinutes] = useState<string>("");

  // Estados de localização
  const [selectedPosition, setSelectedPosition] = useState<{ lat: number; lng: number }>({
    lat: -15.7801,
    lng: -47.9292
  });
  const [address, setAddress] = useState("");
  const [addressNumber, setAddressNumber] = useState("");
  const [addressComplement, setAddressComplement] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [resolvingAddress, setResolvingAddress] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [mapReady, setMapReady] = useState(false);
  const [usingGPS, setUsingGPS] = useState(false);
  const [editingLocation, setEditingLocation] = useState(false);

  // Dados do usuário para o Header
  const [currentUserSlug, setCurrentUserSlug] = useState<string | null>(null);
  const [currentUserAvatar, setCurrentUserAvatar] = useState<string | null>(null);

  const formatCurrencyInput = (value: string) => {
    const numbers = value.replace(/\D/g, "");
    if (!numbers) return "";
    return (Number(numbers) / 100).toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const parseCurrencyToNumber = (value: string) => {
    return Number(value.replace(/\./g, "").replace(",", "."));
  };

  // Carrega perfil para o Header
  useEffect(() => {
    const loadUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("profileSlug, avatar_url")
          .eq("id", user.id)
          .single();
        if (profile) {
          setCurrentUserSlug(profile.profileSlug);
          if (profile.avatar_url) {
            const { data } = supabase.storage.from("avatars").getPublicUrl(profile.avatar_url);
            setCurrentUserAvatar(data.publicUrl);
          }
        }
      }
    };
    loadUser();
  }, []);

  useEffect(() => {
    if (contextAvatarUrl && !currentUserAvatar) {
      setCurrentUserAvatar(contextAvatarUrl);
    }
  }, [contextAvatarUrl, currentUserAvatar]);

  useEffect(() => {
    const fetchStore = async () => {
      if (!storeSlug) {
        toast.error("Link da loja ausente.");
        router.push("/");
        return;
      }

      const { data, error } = await supabase
        .from("stores")
        .select("*")
        .ilike("storeSlug", storeSlug)
        .maybeSingle();

      if (error) {
        console.error("Erro na consulta da loja:", error);
        toast.error("Erro ao buscar dados da loja: " + error.message);
        return;
      }

      if (!data) {
        toast.error("Loja não encontrada. Verifique o link e tente novamente.");
        return;
      }

      setStoreId(data.id);
      const wpp = data.final_whatsapp || data.whatsapp || null;
      setStoreWhatsapp(wpp);
      setStoreAddress(data.address || "");
      setStoreLat(data.store_lat ?? null);
      setStoreLng(data.store_lng ?? null);

      // Se a loja tem localização, usa ela
      if (data.store_lat && data.store_lng) {
        setSelectedPosition({ lat: data.store_lat, lng: data.store_lng });
        setAddress(data.address || "");
        setAddressNumber(data.address_number || "");
        setAddressComplement(data.address_complement || "");
      }
    };

    fetchStore();
  }, [storeSlug, router]);

  useEffect(() => {
    const fetchCategories = async () => {
      if (!storeId) return;
      const { data } = await supabase
        .from("products")
        .select("category")
        .eq("store_id", storeId);
      if (data) {
        const cats = Array.from(
          new Set(data.map((p) => p.category).filter(Boolean))
        ) as string[];
        setExistingCategories(cats);
      }
    };
    fetchCategories();
  }, [storeId]);

  useEffect(() => {
    if (!imageFile) return;
    const url = URL.createObjectURL(imageFile);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  // Inicializar mapa
  useEffect(() => {
    if (typeof window === 'undefined' || !mapContainerRef.current || initializedRef.current || !editingLocation) return;

    initializedRef.current = true;

    const initMap = async () => {
      const L = (await import('leaflet')).default;
      await import('leaflet/dist/leaflet.css');

      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: '',
        iconUrl: '',
        shadowUrl: '',
      });

      const map = L.map(mapContainerRef.current!, {
        center: [selectedPosition.lat, selectedPosition.lng],
        zoom: 15,
        zoomControl: true,
        attributionControl: false,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
      }).addTo(map);

      const orangeIcon = L.divIcon({
        className: '',
        html: `<div style="width: 36px; height: 36px; position: relative;">
          <svg width="36" height="36" viewBox="0 0 24 36" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">
            <path d="M12 0C5.383 0 0 5.383 0 12c0 9 12 24 12 24s12-15 12-24C24 5.383 18.617 0 12 0z" fill="#F97316" stroke="white" stroke-width="2.5"/>
            <circle cx="12" cy="12" r="5" fill="white"/>
          </svg>
        </div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 36],
      });

      const movableMarker = L.marker([selectedPosition.lat, selectedPosition.lng], {
        icon: orangeIcon,
        draggable: true,
        zIndexOffset: 1000
      }).addTo(map);

      movableMarker.on('dragend', () => {
        const pos = movableMarker.getLatLng();
        const newPos = { lat: pos.lat, lng: pos.lng };
        setSelectedPosition(newPos);

        setResolvingAddress(true);
        setLocationError('');
        reverseGeocode(newPos.lat, newPos.lng).then(result => {
          setAddress(result.fullAddress);
          if (result.extractedNumber && !addressNumber) {
            setAddressNumber(result.extractedNumber);
          }
          setResolvingAddress(false);
        });
      });

      mapInstanceRef.current = map;
      movableMarkerRef.current = movableMarker;

      map.on('moveend', () => {
        if (isMovingRef.current) {
          isMovingRef.current = false;
          return;
        }

        const center = map.getCenter();
        const newPos = { lat: center.lat, lng: center.lng };
        movableMarker.setLatLng([newPos.lat, newPos.lng]);
        setSelectedPosition(newPos);

        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
        }

        setResolvingAddress(true);
        setLocationError('');

        debounceTimerRef.current = setTimeout(async () => {
          try {
            const result = await reverseGeocode(newPos.lat, newPos.lng);
            setAddress(result.fullAddress);
            if (result.extractedNumber && !addressNumber) {
              setAddressNumber(result.extractedNumber);
            }
          } catch (err) {
            const fallback = `Local (${newPos.lat.toFixed(4)}, ${newPos.lng.toFixed(4)})`;
            setAddress(fallback);
          } finally {
            setResolvingAddress(false);
          }
        }, 500);
      });

      setResolvingAddress(true);
      try {
        const result = await reverseGeocode(selectedPosition.lat, selectedPosition.lng);
        setAddress(result.fullAddress);
        if (result.extractedNumber) {
          setAddressNumber(result.extractedNumber);
        }
      } catch (err) {
        const fallback = `Local (${selectedPosition.lat.toFixed(4)}, ${selectedPosition.lng.toFixed(4)})`;
        setAddress(fallback);
      } finally {
        setResolvingAddress(false);
      }

      setMapReady(true);
    };

    initMap();

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [editingLocation]);

  const flyTo = useCallback((lat: number, lng: number) => {
    if (!mapInstanceRef.current || !movableMarkerRef.current) return;

    isMovingRef.current = true;
    mapInstanceRef.current.flyTo([lat, lng], 16, { duration: 0.8 });
    movableMarkerRef.current.setLatLng([lat, lng]);
  }, []);

  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('Geolocalização não suportada');
      return;
    }

    setUsingGPS(true);
    setLoadingLocation(true);
    setLocationError('');

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const newPos = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude
        };
        setSelectedPosition(newPos);
        flyTo(newPos.lat, newPos.lng);

        setResolvingAddress(true);
        try {
          const result = await reverseGeocode(newPos.lat, newPos.lng);
          setAddress(result.fullAddress);
          if (result.extractedNumber) {
            setAddressNumber(result.extractedNumber);
          }
        } catch (err) {
          const fallback = `Local (${newPos.lat.toFixed(4)}, ${newPos.lng.toFixed(4)})`;
          setAddress(fallback);
        } finally {
          setResolvingAddress(false);
          setLoadingLocation(false);
          setUsingGPS(false);
        }
      },
      (err) => {
        let msg = 'Erro ao obter localização. ';
        switch (err.code) {
          case err.PERMISSION_DENIED: msg += 'Permissão negada.'; break;
          case err.POSITION_UNAVAILABLE: msg += 'Localização indisponível.'; break;
          case err.TIMEOUT: msg += 'Tempo esgotado.'; break;
        }
        setLocationError(msg);
        setLoadingLocation(false);
        setUsingGPS(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const handleSearchAddress = async () => {
    if (!searchQuery.trim()) return;

    setLoadingLocation(true);
    setLocationError('');

    const result = await geocodeAddress(searchQuery.trim());

    if (result) {
      setSelectedPosition({ lat: result.lat, lng: result.lng });
      setAddress(result.address);
      flyTo(result.lat, result.lng);
      setSearchQuery('');
    } else {
      setLocationError('Endereço não encontrado.');
    }

    setLoadingLocation(false);
  };

  const handleCreate = async () => {
    if (!name || !storeId) {
      toast.error("Preencha os campos obrigatórios");
      return;
    }

    if (parseCurrencyToNumber(price) <= 0) {
      toast.error("Informe um preço válido");
      return;
    }

    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Faça login para continuar.");
      setLoading(false);
      return;
    }

    const { data: storeOwner } = await supabase
      .from("stores")
      .select("owner_id")
      .eq("id", storeId)
      .single();

    if (!storeOwner || storeOwner.owner_id !== user.id) {
      toast.error("Você não tem permissão para esta loja.");
      setLoading(false);
      return;
    }

    let imagePath: string | null = null;
    if (imageFile) {
      const fileExt = imageFile.name.split(".").pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const { data, error: uploadError } = await supabase.storage
        .from("product-images")
        .upload(fileName, imageFile);
      if (uploadError) {
        toast.error("Erro ao enviar imagem: " + uploadError.message);
        setLoading(false);
        return;
      }
      if (data) imagePath = data.path;
    }

    let slug = name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)+/g, "");

    let isUnique = false;
    while (!isUnique) {
      const { data: existing } = await supabase
        .from("products")
        .select("id")
        .eq("slug", slug)
        .eq("store_id", storeId)
        .limit(1)
        .maybeSingle();
      if (existing) {
        slug = slug + "-" + Math.floor(Math.random() * 9999).toString();
      } else {
        isUnique = true;
      }
    }

    let locationString: string | null = null;
    if (selectedPosition) {
      locationString = `SRID=4326;POINT(${selectedPosition.lng} ${selectedPosition.lat})`;
    }

    const durationValue = durationMinutes.trim() ? parseInt(durationMinutes) : null;

    // Construir endereço completo com número
    let fullAddress = address;
    if (addressNumber && !address.includes(addressNumber)) {
      const firstCommaIndex = fullAddress.indexOf(',');
      if (firstCommaIndex !== -1) {
        fullAddress = fullAddress.slice(0, firstCommaIndex) +
          `, ${addressNumber}` +
          fullAddress.slice(firstCommaIndex);
      }
    }

    const { error } = await supabase.from("products").insert({
      name,
      slug,
      description,
      price: parseCurrencyToNumber(price),
      type,
      price_type: priceType,
      listing_type: "sale",
      image_url: imagePath,
      store_id: storeId,
      owner_id: storeOwner.owner_id,
      location: locationString,
      address: fullAddress || null,
      category: category || null,
      duration_minutes: durationValue,
    });

    if (error) {
      console.error("Erro ao criar produto:", error.message, error.details);
      toast.error("Erro ao criar: " + error.message);
      setLoading(false);
      return;
    }

    toast.success("Produto criado com sucesso!");
    router.push(`/${profileSlug}/${storeSlug}`);
  };

  const typeOptions = [
    { label: "Produto", value: "physical", icon: Package },
    { label: "Digital", value: "digital", icon: Monitor },
    { label: "Serviço", value: "service", icon: Briefcase },
  ];

  // Aba única para o Header
  const tabs = [
    {
      id: "criando-produto",
      label: "Criando produto",
      icon: Sparkles as React.ComponentType<{ size?: number; color?: string }>,
      onClick: () => { },
      isActive: true,
    },
  ];

  return (
    <div className="relative flex flex-col min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-yellow-50 pb-32">
      <div className="fixed inset-0 z-0">
        <AnimatedBackground bgMode={bgMode} customBgUrl={customBgUrl} />
      </div>

      <main className="relative z-10 min-h-dvh" style={{ overscrollBehavior: "none" }}>
        <Header
          title="iUser"
          showBack={false}
          greeting={`Olá, ${currentUserSlug ? `@${currentUserSlug}` : "Visitante"}`}
          avatarUrl={currentUserAvatar}
          loading={profileLoading}
          tabs={tabs}
          showSearch={false}
          profileSlug={currentUserSlug}
          onHomeClick={() => router.push("/")}
        />

        <div className="max-w-2xl mx-auto px-4 py-6 w-full">
          <header className="flex items-center justify-between mb-6 pb-4 border-b border-orange-200/50">
            <div className="w-10" />
            <div className="text-center">
              <h1 className="text-2xl sm:text-3xl font-black bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent tracking-tighter">
                Novo Produto
              </h1>
            </div>
            <div className="w-10" />
          </header>

          <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-orange-200/50 p-6 space-y-6 shadow-sm">
            {/* IMAGEM */}
            <div className="space-y-3">
              <label className="block text-[10px] font-black uppercase tracking-wider text-gray-700 text-center">
                Imagem do Produto
              </label>
              <div
                onClick={() => fileInputRef.current?.click()}
                className="w-40 h-40 mx-auto rounded-xl bg-gradient-to-br from-orange-100 to-red-100 border-2 border-orange-200 hover:border-orange-400 flex items-center justify-center cursor-pointer overflow-hidden transition-all group shadow-sm"
              >
                {preview ? (
                  <img src={preview} className="w-full h-full object-cover" alt="Preview" />
                ) : (
                  <ImageIcon className="text-orange-500 group-hover:scale-110 transition-transform" size={40} />
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files && setImageFile(e.target.files[0])}
              />
            </div>

            {/* TIPO DE PRODUTO */}
            <div className="space-y-2">
              <label className="block text-[10px] font-black uppercase tracking-wider text-gray-700 flex items-center gap-2">
                <Package className="w-3 h-3 text-orange-500" />
                Tipo de Produto
              </label>
              <div className="grid grid-cols-3 gap-2">
                {typeOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setType(option.value as ProductType)}
                    className={`flex flex-col items-center justify-center gap-2 py-4 border-2 rounded-xl transition-all text-[9px] font-black uppercase tracking-wider ${type === option.value
                      ? "bg-gradient-to-r from-orange-500 to-red-500 text-white border-transparent shadow-lg"
                      : "bg-white border-orange-200 text-gray-700 hover:bg-orange-50"
                      }`}
                  >
                    <option.icon className="w-4 h-4" />
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {/* NOME */}
            <div className="space-y-2">
              <label className="block text-[10px] font-black uppercase tracking-wider text-gray-700 flex items-center gap-2">
                <Plus className="w-3 h-3 text-orange-500" />
                Nome do Produto
              </label>
              <input
                placeholder="Ex: Pastel de Queijo"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-white border-2 border-orange-200 rounded-xl px-4 py-3 text-gray-900 placeholder:text-gray-400 text-sm font-bold uppercase focus:outline-none focus:border-orange-500 transition-all"
              />
            </div>

            {/* PREÇO */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-[10px] font-black uppercase tracking-wider text-gray-700">
                  {priceType === "fixed" ? "Preço" : "Preço por Hora"}
                </label>
                <div className="flex gap-1">
                  <button
                    onClick={() => setPriceType("fixed")}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-lg border-2 text-[8px] font-black uppercase tracking-wider transition-all ${priceType === "fixed"
                      ? "bg-gradient-to-r from-orange-500 to-red-500 text-white border-transparent"
                      : "bg-white border-orange-200 text-gray-600 hover:bg-orange-50"
                      }`}
                  >
                    <DollarSign className="w-3 h-3" />
                    Fixo
                  </button>
                  <button
                    onClick={() => setPriceType("hourly")}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-lg border-2 text-[8px] font-black uppercase tracking-wider transition-all ${priceType === "hourly"
                      ? "bg-gradient-to-r from-orange-500 to-red-500 text-white border-transparent"
                      : "bg-white border-orange-200 text-gray-600 hover:bg-orange-50"
                      }`}
                  >
                    <Clock className="w-3 h-3" />
                    Por Hora
                  </button>
                </div>
              </div>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-black text-sm">R$</span>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="0,00"
                  value={price}
                  onChange={(e) => setPrice(formatCurrencyInput(e.target.value))}
                  className="w-full bg-white border-2 border-orange-200 rounded-xl pl-12 pr-4 py-3 text-gray-900 placeholder:text-gray-400 text-sm font-bold focus:outline-none focus:border-orange-500 transition-all"
                />
                {priceType === "hourly" && (
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-bold">/h</span>
                )}
              </div>
            </div>

            {/* DURAÇÃO */}
            <div className="space-y-2">
              <label className="block text-[10px] font-black uppercase tracking-wider text-gray-700 flex items-center gap-2">
                <Timer className="w-3 h-3 text-orange-500" />
                Duração de preparo (minutos) – opcional
              </label>
              <input
                type="number"
                min="1"
                placeholder="Ex: 60"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
                className="w-full bg-white border-2 border-orange-200 rounded-xl px-4 py-3 text-gray-900 placeholder:text-gray-400 text-sm font-bold focus:outline-none focus:border-orange-500 transition-all"
              />
              <p className="text-[9px] text-gray-400 ml-1">
                Tempo médio para este produto/serviço (será usado em agendamentos)
              </p>
            </div>

            {/* DESCRIÇÃO */}
            <div className="space-y-2">
              <label className="block text-[10px] font-black uppercase tracking-wider text-gray-700">Descrição</label>
              <textarea
                placeholder="Descreva o produto ou serviço..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="w-full bg-white border-2 border-orange-200 rounded-xl px-4 py-3 text-gray-900 placeholder:text-gray-400 text-sm focus:outline-none focus:border-orange-500 transition-all min-h-[100px] resize-none"
              />
            </div>

            {/* CATEGORIA */}
            <div className="space-y-2">
              <label className="block text-[10px] font-black uppercase tracking-wider text-gray-700">Categoria</label>
              <input
                placeholder="Ex: Bebidas, Sobremesas..."
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-white border-2 border-orange-200 rounded-xl px-4 py-3 text-gray-900 placeholder:text-gray-400 text-sm font-bold uppercase focus:outline-none focus:border-orange-500 transition-all"
              />
              {existingCategories.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {existingCategories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setCategory(cat)}
                      className={`px-3 py-1.5 border-2 rounded-xl font-black text-[9px] uppercase tracking-wider transition-all ${category === cat
                        ? "bg-gradient-to-r from-orange-500 to-red-500 text-white border-transparent"
                        : "bg-white border-orange-200 text-gray-700 hover:bg-orange-50"
                        }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* LOCALIZAÇÃO */}
            <div className="space-y-3">
              <label className="block text-[10px] font-black uppercase tracking-wider text-gray-700 flex items-center gap-2">
                <MapPinned className="w-3 h-3 text-orange-500" />
                Localização
              </label>

              {!editingLocation ? (
                <div className="space-y-2">
                  <div className="p-4 bg-orange-50/50 rounded-xl border border-orange-200 space-y-2">
                    <p className="text-sm font-medium text-gray-800">{address || "Endereço da loja"}</p>
                    {addressNumber && (
                      <p className="text-xs text-gray-600">Nº: {addressNumber}</p>
                    )}
                    {addressComplement && (
                      <p className="text-xs text-gray-600">Complemento: {addressComplement}</p>
                    )}
                    <button
                      onClick={() => {
                        setEditingLocation(true);
                        setMapReady(false);
                        initializedRef.current = false;
                      }}
                      className="flex items-center gap-2 text-orange-600 hover:text-orange-700 text-[9px] uppercase font-black tracking-wider"
                    >
                      <Edit3 size={12} />
                      Editar Localização
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Busca + GPS */}
                  <div className="flex gap-2">
                    <div className="flex-1 flex items-center pl-0 pr-2 py-0.5 rounded-full text-xs font-semibold"
                      style={{
                        background: `rgba(255,255,255,0.4)`,
                        backdropFilter: 'blur(10px)',
                        border: `1px solid #fbd5a4`,
                      }}
                    >
                      <div className="h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ background: `rgba(255,255,255,0.4)` }}>
                        <Search size={14} color="#f97316" />
                      </div>
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Buscar endereço..."
                        className="flex-1 bg-transparent outline-none ml-1.5 text-xs text-gray-700"
                        disabled={loadingLocation}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSearchAddress(); }}
                      />
                      {searchQuery && (
                        <button
                          onClick={handleSearchAddress}
                          disabled={loadingLocation}
                          className="px-3 py-1 rounded-full text-xs font-bold bg-gradient-to-r from-orange-500 to-red-500 text-white"
                        >
                          {loadingLocation ? '...' : 'Ir'}
                        </button>
                      )}
                    </div>

                    <button
                      onClick={handleGetCurrentLocation}
                      disabled={loadingLocation}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold transition-all hover:opacity-80 disabled:opacity-50 flex-shrink-0"
                      style={{
                        background: `#f9731622`,
                        color: '#f97316',
                        border: `1px solid #f9731644`,
                      }}
                      title="Usar GPS"
                    >
                      {usingGPS ? <Loader2 size={14} className="animate-spin" /> : <Navigation size={14} />}
                      <span className="hidden sm:inline">GPS</span>
                    </button>
                  </div>

                  {/* Mapa */}
                  <div className="relative w-full h-48 sm:h-56 rounded-xl overflow-hidden"
                    style={{
                      border: `2px solid #fbd5a4`,
                      background: '#fff',
                    }}
                  >
                    <div ref={mapContainerRef} className="w-full h-full" />

                    {!mapReady && (
                      <div className="absolute inset-0 flex items-center justify-center bg-white/80">
                        <Loader2 size={24} className="animate-spin" style={{ color: '#f97316' }} />
                      </div>
                    )}
                  </div>

                  {/* Endereço encontrado */}
                  <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl"
                    style={{
                      background: `rgba(255,255,255,0.4)`,
                      border: `1px solid #fbd5a4`,
                    }}
                  >
                    <div className="flex-shrink-0 mt-0.5">
                      <div className="w-6 h-6 rounded-full bg-orange-500/20 flex items-center justify-center">
                        <MoveVertical size={14} style={{ color: '#f97316' }} />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[10px] font-semibold uppercase tracking-wider opacity-50 text-gray-600">
                        Localização selecionada
                      </span>
                      {resolvingAddress ? (
                        <p className="text-xs mt-0.5 opacity-50 text-gray-500">
                          Obtendo endereço...
                        </p>
                      ) : (
                        <p className="text-xs font-medium mt-0.5 break-words leading-relaxed text-gray-700">
                          {address || 'Arraste o marcador ou mova o mapa'}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Número e Complemento */}
                  {!resolvingAddress && address && (
                    <div className="space-y-2">
                      <div className="px-3 py-2 rounded-xl"
                        style={{
                          background: `rgba(255,255,255,0.4)`,
                          border: `1px solid #fbd5a4`,
                        }}
                      >
                        <label className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider opacity-50 text-gray-600 mb-1">
                          <Hash size={12} />
                          Número da casa/apto *
                        </label>
                        <input
                          type="text"
                          value={addressNumber}
                          onChange={(e) => setAddressNumber(e.target.value)}
                          placeholder="Ex: 2836"
                          className="w-full bg-transparent outline-none text-xs font-medium text-gray-700"
                          required
                        />
                      </div>

                      <div className="px-3 py-2 rounded-xl"
                        style={{
                          background: `rgba(255,255,255,0.4)`,
                          border: `1px solid #fbd5a4`,
                        }}
                      >
                        <label className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider opacity-50 text-gray-600 mb-1">
                          <FileText size={12} />
                          Complemento (opcional)
                        </label>
                        <input
                          type="text"
                          value={addressComplement}
                          onChange={(e) => setAddressComplement(e.target.value)}
                          placeholder="Ex: Casa com parede de cerâmica, portão azul..."
                          className="w-full bg-transparent outline-none text-xs font-medium text-gray-700"
                        />
                      </div>
                    </div>
                  )}

                  {locationError && (
                    <p className="text-red-500 text-xs font-medium">{locationError}</p>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setEditingLocation(false);
                      }}
                      className="flex-1 py-2.5 bg-gray-200 text-gray-700 rounded-xl font-black uppercase text-[9px] tracking-wider hover:bg-gray-300 transition-all"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => setEditingLocation(false)}
                      className="flex-1 py-2.5 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-xl font-black uppercase text-[9px] tracking-wider hover:shadow-lg transition-all"
                    >
                      Salvar Localização
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={handleCreate}
              disabled={loading}
              className="w-full py-3.5 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-xl font-black uppercase text-xs tracking-wider hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Criar Produto
                </>
              )}
            </button>
          </div>
        </div>

        {/* Botões flutuantes */}
        <div style={{ position: 'fixed', bottom: 32, right: 24, display: 'flex', gap: 12, zIndex: 998 }}>
          <button
            onClick={() => router.back()}
            className="w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-transform duration-200 hover:scale-110 active:scale-95"
            style={{
              background: `linear-gradient(135deg, #f97316, #ef4444)`,
              color: '#ffffff',
              border: `2px solid #f97316`,
              boxShadow: `0 8px 24px #f9731660`,
            }}
            aria-label="Voltar para a página anterior"
          >
            <ArrowLeft size={24} />
          </button>
          <button
            onClick={() => router.push('/')}
            className="w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-transform duration-200 hover:scale-110 active:scale-95"
            style={{
              background: `linear-gradient(135deg, #f97316, #ef4444)`,
              color: '#ffffff',
              border: `2px solid #f97316`,
              boxShadow: `0 8px 24px #f9731660`,
            }}
            aria-label="Ir para o início"
          >
            <Home size={24} />
          </button>
        </div>
      </main>
    </div>
  );
}