// src/app/(main)/criar-loja/page.tsx
"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import {
  Camera,
  MapPinned,
  Edit3,
  X,
  Store,
  Sparkles,
  Zap,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  Home,
  Tag,
  Search,
  Navigation,
  MoveVertical,
  Hash,
  FileText,
  MessageCircle,
  Shield,
  Info,
} from "lucide-react";
import { Spinner } from '@/components/Spinner'
import { toast } from "sonner";
import AnimatedBackground from "@/components/AnimatedBackground";
import { createSquareImage } from "@/lib/image";
import { useProfile } from "@/app/contexts/ProfileContext";
import Header from "@/app/Header";
import { categorias } from "@/lib/categorias";
import { checkSlugAvailability, getSlugSuggestions, sanitizeSlug } from "@/lib/slugUtils";

// Filtra as categorias para remover "Social"
const CATEGORIAS_LOJAS = categorias.filter(cat => cat.slug !== 'social');

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

// Função para validar número de WhatsApp
function validateWhatsApp(number: string): boolean {
  const clean = number.replace(/\D/g, '');
  return clean.length >= 10 && clean.length <= 13;
}

// Função para formatar número de WhatsApp
function formatWhatsApp(number: string): string {
  const clean = number.replace(/\D/g, '');
  if (clean.length === 11) {
    return `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7)}`;
  }
  if (clean.length === 10) {
    return `(${clean.slice(0, 2)}) ${clean.slice(2, 6)}-${clean.slice(6)}`;
  }
  return number;
}

export default function CriarLoja() {
  const router = useRouter();
  const { bgMode, customBgUrl, loading: profileLoading, avatarUrl: contextAvatarUrl } = useProfile();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const movableMarkerRef = useRef<any>(null);
  const polylineRef = useRef<any>(null);
  const isMovingRef = useRef(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const initializedRef = useRef(false);

  const [loading, setLoading] = useState(false);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [slugStatus, setSlugStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");
  const [storeSlugSuggestions, setStoreSlugSuggestions] = useState<string[]>([]);

  const [name, setName] = useState("");
  const [storeSlug, setStoreSlug] = useState("");
  const [description, setDescription] = useState("");
  const [selectedCategorySlug, setSelectedCategorySlug] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [whatsappError, setWhatsappError] = useState("");

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

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const [currentUserSlug, setCurrentUserSlug] = useState<string | null>(null);
  const [currentUserAvatar, setCurrentUserAvatar] = useState<string | null>(null);

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
    if (!name) {
      setStoreSlug("");
      return;
    }
    setStoreSlug(sanitizeSlug(name));
  }, [name]);

  useEffect(() => {
    if (!storeSlug) {
      setSlugStatus("idle");
      setStoreSlugSuggestions([]);
      return;
    }

    const check = async () => {
      setSlugStatus("checking");
      const result = await checkSlugAvailability(storeSlug);
      if (!result.available) {
        setSlugStatus("taken");
        const sugs = await getSlugSuggestions(storeSlug, 3);
        setStoreSlugSuggestions(sugs);
      } else {
        setSlugStatus("available");
        setStoreSlugSuggestions([]);
      }
    };

    const timer = setTimeout(check, 600);
    return () => clearTimeout(timer);
  }, [storeSlug]);

  useEffect(() => {
    if (!imageFile) return;
    const url = URL.createObjectURL(imageFile);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  useEffect(() => {
    if (typeof window === 'undefined' || !mapContainerRef.current || initializedRef.current) return;

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
  }, []);

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

  const handleWhatsAppChange = (value: string) => {
    const cleaned = value.replace(/[^0-9+\s()-]/g, '');
    setWhatsapp(cleaned);

    if (cleaned.replace(/\D/g, '').length > 0) {
      const clean = cleaned.replace(/\D/g, '');
      if (clean.length < 10) {
        setWhatsappError('Número incompleto. Digite DDD + número');
      } else if (clean.length > 13) {
        setWhatsappError('Número muito longo');
      } else {
        setWhatsappError('');
      }
    } else {
      setWhatsappError('');
    }
  };

  const handleCreate = async () => {
    if (!name || !storeSlug) {
      toast.error("Preencha os campos obrigatórios");
      return;
    }

    if (slugStatus === "checking" || slugStatus === "taken") {
      toast.error("Escolha um link disponível para a loja");
      return;
    }

    if (!selectedCategorySlug) {
      toast.error("Selecione uma categoria");
      return;
    }

    if (!addressNumber.trim()) {
      toast.error("Digite o número da localização");
      return;
    }

    const whatsappClean = whatsapp.replace(/\D/g, '');
    if (!whatsappClean || whatsappClean.length < 10) {
      toast.error("Digite um número de WhatsApp válido com DDD");
      return;
    }

    if (whatsappClean.length > 13) {
      toast.error("Número de WhatsApp inválido");
      return;
    }

    const categoriaSelecionada = CATEGORIAS_LOJAS.find(c => c.slug === selectedCategorySlug);
    const categoryName = categoriaSelecionada?.nome || selectedCategorySlug;

    setLoading(true);

    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      toast.error("Você precisa estar logado");
      setLoading(false);
      return;
    }

    let logoPath: string | null = null;
    if (imageFile) {
      const fileExt = imageFile.name.split(".").pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const { data, error } = await supabase.storage
        .from("store-logos")
        .upload(fileName, imageFile);
      if (error) {
        console.error(error);
      }
      if (data) logoPath = data.path;
    }

    let fullAddress = address;
    if (addressNumber && !address.includes(addressNumber)) {
      const firstCommaIndex = fullAddress.indexOf(',');
      if (firstCommaIndex !== -1) {
        fullAddress = fullAddress.slice(0, firstCommaIndex) +
          `, ${addressNumber}` +
          fullAddress.slice(firstCommaIndex);
      }
    }

    const slugCheck = await checkSlugAvailability(storeSlug);
    if (!slugCheck.available) {
      toast.error(slugCheck.message || "Este link já está em uso.");
      setLoading(false);
      return;
    }

    const { error } = await supabase.from("stores").insert({
      name,
      storeSlug,
      description,
      logo_url: logoPath,
      owner_id: userData.user.id,
      location: selectedPosition ? `POINT(${selectedPosition.lng} ${selectedPosition.lat})` : null,
      address: fullAddress,
      store_lat: selectedPosition.lat,
      store_lng: selectedPosition.lng,
      address_number: addressNumber,
      address_complement: addressComplement || null,
      category: categoryName,
      whatsapp: whatsappClean,
    });

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    setLoading(false);

    // ✅ REDIRECIONA PARA A NOVA ESTRUTURA /[storeSlug]
    window.location.href = `/${storeSlug}`;
  };

  const handleImageChange = async (file: File) => {
    try {
      const squareFile = await createSquareImage(file, 400);
      setImageFile(squareFile);
    } catch (err) {
      toast.error("Erro ao processar imagem");
    }
  };

  const tabs = [
    {
      id: "criando",
      label: "Criando loja",
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

        <div className="w-full px-4 md:px-6 py-6">
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-orange-200/50 p-6 space-y-6 shadow-sm">
            {/* LOGO */}
            <div className="space-y-3">
              <label className="block text-[10px] font-black uppercase tracking-wider text-gray-700 text-center">
                Logo da Loja
              </label>
              <div
                onClick={() => fileInputRef.current?.click()}
                className="w-28 h-28 mx-auto rounded-xl bg-gradient-to-br from-orange-100 to-red-100 border-2 border-orange-200 hover:border-orange-400 flex items-center justify-center cursor-pointer overflow-hidden transition-all group shadow-sm"
              >
                {preview ? (
                  <img src={preview} className="w-full h-full object-cover" />
                ) : (
                  <Camera className="text-orange-500 group-hover:scale-110 transition-transform" size={32} />
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImageChange(file);
                }}
              />
            </div>

            {/* NOME DA LOJA */}
            <div className="space-y-2">
              <label className="block text-[10px] font-black uppercase tracking-wider text-gray-700 flex items-center gap-2">
                <Store className="w-3 h-3 text-orange-500" />
                Nome da Loja *
              </label>
              <input
                placeholder="Minha Super Loja"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-white border-2 border-orange-200 rounded-xl px-4 py-3 text-gray-900 placeholder:text-gray-400 text-sm focus:outline-none focus:border-orange-500 transition-all"
                required
              />
            </div>

            {/* SLUG */}
            <div className="space-y-2">
              <label className="block text-[10px] font-black uppercase tracking-wider text-gray-700 flex items-center gap-2">
                <Zap className="w-3 h-3 text-orange-500" />
                Nome único da loja *
              </label>
              <div className="flex items-center bg-white border-2 border-orange-200 rounded-xl overflow-hidden focus-within:border-orange-500 transition-all">
                <span className="px-3 bg-orange-50 text-gray-600 border-r border-orange-200 text-xs font-bold py-3 whitespace-nowrap">
                  @
                </span>
                <input
                  placeholder="minha-loja"
                  value={storeSlug}
                  onChange={(e) =>
                    setStoreSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
                  }
                  className="flex-1 px-3 py-3 bg-white text-gray-900 text-sm outline-none"
                />
              </div>
              {storeSlug && slugStatus === "checking" && (
                <div className="flex items-center gap-2 text-[9px] font-bold text-gray-500 mt-1">
                  <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
                  Verificando...
                </div>
              )}
              {storeSlug && slugStatus === "available" && (
                <div className="flex items-center gap-2 text-[9px] font-bold text-green-600 mt-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Link disponível
                </div>
              )}
              {storeSlug && slugStatus === "taken" && (
                <div className="flex items-center gap-2 text-[9px] font-bold text-red-500 mt-1">
                  <AlertCircle className="w-3 h-3" />
                  Indisponível
                </div>
              )}
              {storeSlugSuggestions.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {storeSlugSuggestions.map(sug => (
                    <button
                      key={sug}
                      type="button"
                      onClick={() => {
                        setStoreSlug(sug);
                        setStoreSlugSuggestions([]);
                      }}
                      className="px-3 py-1 bg-orange-50 border border-orange-200 rounded-full text-xs font-bold text-orange-700 hover:bg-orange-100 transition-colors"
                    >
                      @{sug}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* WHATSAPP */}
            <div className="space-y-2">
              <label className="block text-[10px] font-black uppercase tracking-wider text-gray-700 flex items-center gap-2">
                <MessageCircle className="w-3 h-3 text-green-500" />
                WhatsApp da Loja *
              </label>
              <div className="relative">
                <div className="flex items-center bg-white border-2 rounded-xl overflow-hidden focus-within:border-orange-500 transition-all"
                  style={{
                    borderColor: whatsappError ? '#ef4444' : '#fbd5a4',
                  }}
                >
                  <span className="px-3 bg-green-50 text-gray-600 border-r border-green-200 text-xs font-bold py-3 whitespace-nowrap flex items-center gap-1">
                    <MessageCircle className="w-3 h-3 text-green-500" />
                    +55
                  </span>
                  <input
                    placeholder="(11) 99999-9999"
                    value={whatsapp}
                    onChange={(e) => handleWhatsAppChange(e.target.value)}
                    className="flex-1 px-3 py-3 bg-white text-gray-900 text-sm outline-none"
                    maxLength={18}
                  />
                </div>
                {whatsappError && (
                  <div className="flex items-center gap-2 text-[9px] font-bold text-red-500 mt-1">
                    <AlertCircle className="w-3 h-3" />
                    {whatsappError}
                  </div>
                )}
                {!whatsappError && whatsapp.replace(/\D/g, '').length >= 10 && (
                  <div className="flex items-center gap-2 text-[9px] font-bold text-green-600 mt-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Número válido!
                    {whatsapp.replace(/\D/g, '').length >= 11 ? ' Celular' : ' Telefone'}
                  </div>
                )}
                <div className="flex items-start gap-1.5 mt-1.5">
                  <Shield className="w-3 h-3 text-orange-400 flex-shrink-0 mt-0.5" />
                  <p className="text-[8px] text-gray-400 leading-relaxed">
                    As notificações de pedidos e mensagens dos clientes serão enviadas para este número
                  </p>
                </div>
              </div>
            </div>

            {/* CATEGORIA */}
            <div className="space-y-2">
              <label className="block text-[10px] font-black uppercase tracking-wider text-gray-700 flex items-center gap-2">
                <Tag className="w-3 h-3 text-orange-500" />
                Categoria *
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {CATEGORIAS_LOJAS.map((cat) => {
                  const Icon = cat.icone;
                  const isSelected = selectedCategorySlug === cat.slug;
                  return (
                    <button
                      key={cat.slug}
                      type="button"
                      onClick={() => setSelectedCategorySlug(cat.slug)}
                      className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all ${isSelected
                        ? "border-orange-500 bg-orange-50 shadow-md"
                        : "border-orange-200 bg-white/50 hover:bg-orange-50/50"
                        }`}
                    >
                      <Icon
                        className="w-5 h-5"
                        style={{ color: isSelected ? "#f97316" : cat.color }}
                      />
                      <span className={`text-[9px] font-bold ${isSelected ? "text-orange-600" : "text-gray-700"
                        }`}>
                        {cat.nome}
                      </span>
                    </button>
                  );
                })}
              </div>
              {selectedCategorySlug && (
                <div className="flex items-center gap-2 text-[9px] font-bold text-green-600 mt-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Categoria selecionada: {CATEGORIAS_LOJAS.find(c => c.slug === selectedCategorySlug)?.nome}
                </div>
              )}
            </div>

            {/* DESCRIÇÃO */}
            <div className="space-y-2">
              <label className="block text-[10px] font-black uppercase tracking-wider text-gray-700">
                Descrição
              </label>
              <textarea
                placeholder="O que você vende? (opcional)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-white border-2 border-orange-200 rounded-xl px-4 py-3 text-gray-900 placeholder:text-gray-400 text-sm focus:outline-none focus:border-orange-500 transition-all min-h-[100px]"
              />
            </div>

            {/* LOCALIZAÇÃO */}
            <div className="space-y-3">
              <label className="block text-[10px] font-black uppercase tracking-wider text-gray-700 flex items-center gap-2">
                <MapPinned className="w-3 h-3 text-orange-500" />
                Localização da Loja *
              </label>

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
                  {usingGPS ? <Spinner size={14} /> : <Navigation size={14} />}
                  <span className="hidden sm:inline">GPS</span>
                </button>
              </div>

              <div className="relative w-full h-48 sm:h-56 rounded-xl overflow-hidden"
                style={{
                  border: `2px solid #fbd5a4`,
                  background: '#fff',
                }}
              >
                <div ref={mapContainerRef} className="w-full h-full" />

                {!mapReady && (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/80">
                    <Spinner size={24} color='#f97316' />
                  </div>
                )}
              </div>

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

              <p className="text-[10px] opacity-50 text-gray-500">
                💡 Arraste o marcador laranja ou o mapa para ajustar a localização
              </p>
            </div>

            {/* BOTÃO CRIAR */}
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
                  Criar Loja
                </>
              )}
            </button>

            <div className="flex flex-wrap gap-3 justify-center text-[9px] text-gray-400">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-green-500" />
                Nome
              </span>
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-green-500" />
                Link
              </span>
              <span className="flex items-center gap-1">
                {whatsapp.replace(/\D/g, '').length >= 10 ? (
                  <CheckCircle2 className="w-3 h-3 text-green-500" />
                ) : (
                  <AlertCircle className="w-3 h-3 text-red-400" />
                )}
                WhatsApp
              </span>
              <span className="flex items-center gap-1">
                {selectedCategorySlug ? (
                  <CheckCircle2 className="w-3 h-3 text-green-500" />
                ) : (
                  <AlertCircle className="w-3 h-3 text-red-400" />
                )}
                Categoria
              </span>
              <span className="flex items-center gap-1">
                {addressNumber ? (
                  <CheckCircle2 className="w-3 h-3 text-green-500" />
                ) : (
                  <AlertCircle className="w-3 h-3 text-red-400" />
                )}
                Localização
              </span>
            </div>
          </div>
        </div>

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