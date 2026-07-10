// app/(main)/[profileSlug]/[storeSlug]/criar-produto/page.tsx
"use client";

import { useState, useRef, useEffect } from "react";
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
  MessageCircle,
  ShoppingCart,
  Timer,
  MapPin,
} from "lucide-react";
import { toast } from "sonner";
import AnimatedBackground from "@/components/AnimatedBackground";

type ProductType = "physical" | "digital" | "service";
type PriceType = "fixed" | "hourly";
type ListingType = "sale" | "publication";

export default function CriarProduto() {
  const router = useRouter();
  const params = useParams();

  const storeSlug = Array.isArray(params.storeSlug)
    ? params.storeSlug[0]
    : params.storeSlug;

  const profileSlug = Array.isArray(params.profileSlug)
    ? params.profileSlug[0]
    : params.profileSlug;

  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
  const [listingType, setListingType] = useState<ListingType>("sale");

  const [durationMinutes, setDurationMinutes] = useState<string>("60");

  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [manualAddress, setManualAddress] = useState("");
  const [suggestions, setSuggestions] = useState<any[]>([]);

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

  useEffect(() => {
    const delay = setTimeout(() => {
      if (manualAddress.length < 4) return;
      fetchSuggestions(manualAddress);
    }, 500);
    return () => clearTimeout(delay);
  }, [manualAddress]);

  const fetchSuggestions = async (query: string) => {
    try {
      const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
          query
        )}.json?access_token=${token}&autocomplete=true&country=BR&limit=5`
      );
      const data = await res.json();
      setSuggestions(data.features || []);
    } catch (e) {
      console.error(e);
    }
  };

  const selectSuggestion = (feature: any) => {
    const [lng, lat] = feature.center;
    setLocation({ lat, lng });
    setAddress(feature.place_name);
    setManualAddress(feature.place_name);
    setSuggestions([]);
    const cityComponent = feature.context?.find((c: any) => c.id.includes("place"));
    if (cityComponent) setCity(cityComponent.text);
  };

  const fetchAddressFromCoords = async (lat: number, lng: number) => {
    try {
      const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${token}`
      );
      const data = await res.json();
      if (data.features?.length > 0) {
        const feature = data.features[0];
        setAddress(feature.place_name);
        const cityComponent = feature.context?.find((c: any) => c.id.includes("place"));
        if (cityComponent) setCity(cityComponent.text);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const useStoreAddress = () => {
    if (storeLat != null && storeLng != null) {
      setLocation({ lat: storeLat, lng: storeLng });
      setAddress(storeAddress);
      setManualAddress(storeAddress);
      setCity("");
      if (!storeAddress) {
        fetchAddressFromCoords(storeLat, storeLng);
      }
    } else if (storeAddress) {
      fetchCoordsFromAddress(storeAddress);
    } else {
      toast.error("A loja não possui endereço cadastrado.");
    }
  };

  const fetchCoordsFromAddress = async (query: string) => {
    try {
      const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
          query
        )}.json?access_token=${token}&limit=1&country=BR`
      );
      const data = await res.json();
      if (data?.features?.[0]) {
        const [lng, lat] = data.features[0].center;
        setLocation({ lat, lng });
        setAddress(data.features[0].place_name);
        setManualAddress(data.features[0].place_name);
        setSuggestions([]);
        const cityComponent = data.features[0].context?.find((c: any) =>
          c.id.includes("place")
        );
        if (cityComponent) setCity(cityComponent.text);
      } else {
        toast.error("Endereço não encontrado.");
      }
    } catch (e) {
      console.error(e);
      toast.error("Erro ao buscar coordenadas.");
    }
  };

  const handleCreate = async () => {
    if (!name || !storeId) {
      toast.error("Preencha os campos obrigatórios");
      return;
    }

    if (listingType === "sale" && parseCurrencyToNumber(price) <= 0) {
      toast.error("Informe um preço válido");
      return;
    }

    if (listingType === "publication" && !storeWhatsapp) {
      toast.error("Configure o WhatsApp da loja antes de criar publicações.");
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
    if (location) {
      locationString = `SRID=4326;POINT(${location.lng} ${location.lat})`;
    }

    const durationValue = type === "service" ? parseInt(durationMinutes) || 60 : null;

    const { error } = await supabase.from("products").insert({
      name,
      slug,
      description,
      price: listingType === "sale" ? parseCurrencyToNumber(price) : 0,
      type,
      price_type: listingType === "sale" ? priceType : "fixed",
      listing_type: listingType,
      image_url: imagePath,
      store_id: storeId,
      location: locationString,
      address: address || null,
      city: city || null,
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

  return (
    <div className="relative flex flex-col min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-yellow-50 pb-32">
      <AnimatedBackground />
      <div className="relative z-10 max-w-2xl mx-auto px-4 py-6 w-full">
        <header className="flex items-center gap-3 mb-6 pb-4 border-b border-orange-200/50">
          <button
            onClick={() => router.back()}
            className="w-10 h-10 flex items-center justify-center bg-white/90 border-2 border-orange-200 rounded-xl hover:bg-gradient-to-r hover:from-orange-500 hover:to-red-500 hover:text-white transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-black bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent tracking-tighter">
              Novo Produto
            </h1>
            <p className="text-[8px] font-black uppercase tracking-wider text-gray-500 mt-0.5">
              Adicione um item ao catálogo
            </p>
          </div>
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

          {/* MODO DE LISTAGEM */}
          <div className="space-y-2">
            <label className="block text-[10px] font-black uppercase tracking-wider text-gray-700 flex items-center gap-2">
              <ShoppingCart className="w-3 h-3 text-orange-500" />
              Modo de Listagem
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setListingType("sale")}
                className={`flex items-center justify-center gap-2 py-4 border-2 rounded-xl transition-all text-[9px] font-black uppercase tracking-wider ${listingType === "sale"
                    ? "bg-gradient-to-r from-orange-500 to-red-500 text-white border-transparent shadow-lg"
                    : "bg-white border-orange-200 text-gray-700 hover:bg-orange-50"
                  }`}
              >
                <DollarSign className="w-4 h-4" />
                Vender
              </button>
              <button
                onClick={() => setListingType("publication")}
                className={`flex items-center justify-center gap-2 py-4 border-2 rounded-xl transition-all text-[9px] font-black uppercase tracking-wider ${listingType === "publication"
                    ? "bg-gradient-to-r from-green-500 to-emerald-600 text-white border-transparent shadow-lg"
                    : "bg-white border-orange-200 text-gray-700 hover:bg-orange-50"
                  }`}
              >
                <MessageCircle className="w-4 h-4" />
                Divulgar
              </button>
            </div>
            {listingType === "publication" && (
              <div className="p-3 bg-green-50 rounded-xl border border-green-200 text-xs text-green-800 space-y-1">
                <p className="font-bold mb-1">📢 Modo divulgação ativado</p>
                <p>O cliente será direcionado para o WhatsApp da loja.</p>
                {storeWhatsapp ? (
                  <p>📱 WhatsApp: <strong>{storeWhatsapp}</strong></p>
                ) : (
                  <p className="text-red-600">⚠️ Nenhum WhatsApp configurado na loja.</p>
                )}
                {(storeAddress || (storeLat != null && storeLng != null)) && (
                  <p>📍 Localização da loja cadastrada e disponível para o produto.</p>
                )}
              </div>
            )}
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

          {/* PREÇO (apenas venda) */}
          {listingType === "sale" && (
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
          )}

          {/* DURAÇÃO (apenas serviços) */}
          {type === "service" && (
            <div className="space-y-2">
              <label className="block text-[10px] font-black uppercase tracking-wider text-gray-700 flex items-center gap-2">
                <Timer className="w-3 h-3 text-orange-500" />
                Duração do Serviço (minutos)
              </label>
              <input
                type="number"
                min="1"
                placeholder="60"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
                className="w-full bg-white border-2 border-orange-200 rounded-xl px-4 py-3 text-gray-900 placeholder:text-gray-400 text-sm font-bold focus:outline-none focus:border-orange-500 transition-all"
              />
              <p className="text-[9px] text-gray-400 ml-1">Tempo médio de atendimento (opcional)</p>
            </div>
          )}

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
              Localização (opcional)
            </label>

            {(storeAddress || (storeLat != null && storeLng != null)) && !location && (
              <button
                onClick={useStoreAddress}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-50 text-blue-700 border-2 border-blue-200 rounded-xl font-black uppercase text-[9px] tracking-wider hover:bg-blue-100 transition-all"
              >
                <MapPin size={14} />
                Usar endereço da loja
              </button>
            )}

            {!location ? (
              <div className="space-y-3">
                <button
                  disabled={loadingLocation}
                  onClick={() => {
                    setLoadingLocation(true);
                    navigator.geolocation.getCurrentPosition(
                      (pos) => {
                        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                        fetchAddressFromCoords(pos.coords.latitude, pos.coords.longitude);
                        setLoadingLocation(false);
                      },
                      () => {
                        toast.error("Erro ao obter localização");
                        setLoadingLocation(false);
                      }
                    );
                  }}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-orange-50 text-orange-700 border-2 border-orange-200 rounded-xl font-black uppercase text-[9px] tracking-wider hover:bg-orange-100 transition-all"
                >
                  <MapPinned size={14} />
                  {loadingLocation ? "Buscando..." : "Usar minha localização atual"}
                </button>
                <div className="relative">
                  <input
                    placeholder="Ou digite o endereço..."
                    value={manualAddress}
                    onChange={(e) => setManualAddress(e.target.value)}
                    className="w-full bg-white border-2 border-orange-200 rounded-xl px-4 py-3 text-gray-900 placeholder:text-gray-400 text-sm focus:outline-none focus:border-orange-500 transition-all"
                  />
                  {suggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-orange-200 rounded-xl overflow-hidden shadow-lg z-50">
                      {suggestions.map((s, i) => (
                        <div
                          key={i}
                          onClick={() => selectSuggestion(s)}
                          className="p-3 hover:bg-orange-50 cursor-pointer border-b border-orange-100 last:border-0 text-sm text-gray-700"
                        >
                          {s.place_name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-4 bg-orange-50/50 rounded-xl border border-orange-200 space-y-2">
                <p className="text-sm font-medium text-gray-800">{address}</p>
                <button
                  onClick={() => {
                    setLocation(null);
                    setAddress("");
                    setCity("");
                    setManualAddress("");
                    setSuggestions([]);
                  }}
                  className="flex items-center gap-2 text-orange-600 hover:text-orange-700 text-[9px] uppercase font-black tracking-wider"
                >
                  <Edit3 size={12} />
                  Editar Local
                </button>
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
                {listingType === "sale" ? "Criar Produto" : "Criar Publicação"}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}