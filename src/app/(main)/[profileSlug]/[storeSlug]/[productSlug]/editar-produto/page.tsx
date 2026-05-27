"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  ImageIcon,
  Package,
  Monitor,
  Briefcase,
  MapPinned,
  Edit3,
  X,
  ArrowLeft,
  Save,
  Trash2,
  Clock,
  DollarSign,
} from "lucide-react";
import { toast } from "sonner";
import AnimatedBackground from "@/components/AnimatedBackground";

type ProductType = "physical" | "digital" | "service";
type PriceType = "fixed" | "hourly";

export default function EditarProduto() {
  const router = useRouter();
  const params = useParams();
  const supabase = createClient();

  const storeSlug = Array.isArray(params.storeSlug)
    ? params.storeSlug[0]
    : params.storeSlug;
  const productSlug = Array.isArray(params.productSlug)
    ? params.productSlug[0]
    : params.productSlug;
  const profileSlug = Array.isArray(params.profileSlug)
    ? params.profileSlug[0]
    : params.profileSlug;

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [productId, setProductId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [type, setType] = useState<ProductType>("physical");
  const [priceType, setPriceType] = useState<PriceType>("fixed");
  const [category, setCategory] = useState("");
  const [existingCategories, setExistingCategories] = useState<string[]>([]);

  // Localização (estilo consistente)
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(
    null
  );
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [manualAddress, setManualAddress] = useState("");
  const [suggestions, setSuggestions] = useState<any[]>([]);

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [storeId, setStoreId] = useState<string | null>(null);

  useEffect(() => {
    const fetchProductData = async () => {
      if (!storeSlug || !productSlug) return;

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Você precisa estar logado.");
        router.push("/");
        return;
      }

      const { data: store, error: storeError } = await supabase
        .from("stores")
        .select("id, owner_id")
        .ilike("storeSlug", storeSlug)
        .single();

      if (storeError || !store) {
        toast.error("Loja não encontrada.");
        router.push("/");
        return;
      }

      if (store.owner_id !== user.id) {
        toast.error("Sem permissão para editar.");
        router.push(`/${profileSlug}/${storeSlug}`);
        return;
      }

      const decodedSlug = decodeURIComponent(productSlug || "");
      let query = supabase
        .from("products")
        .select("*")
        .eq("store_id", store.id);

      if (
        /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
          decodedSlug
        )
      ) {
        query = query.eq("id", decodedSlug);
      } else {
        query = query.eq("slug", decodedSlug);
      }

      const { data, error } = await query.limit(1).maybeSingle();
      if (error || !data) {
        toast.error("Produto não encontrado.");
        router.push(`/${profileSlug}/${storeSlug}`);
        return;
      }

      setProductId(data.id);
      setName(data.name || "");
      setDescription(data.description || "");
      setPrice(data.price?.toString().replace(".", ",") || "");
      setType((data.type as ProductType) || "physical");
      setPriceType((data.price_type as PriceType) || "fixed");
      setAddress(data.address || "");
      setCity(data.city || "");
      setCategory(data.category || "");

      if (data.image_url) {
        const url = supabase.storage
          .from("product-images")
          .getPublicUrl(data.image_url).data.publicUrl;
        setPreview(url);
      }

      if (data.location) {
        let coords: { lat: number; lng: number } | null = null;
        if (typeof data.location === "string") {
          if (data.location.toUpperCase().includes("POINT")) {
            const match = data.location.match(
              /POINT\s*\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/i
            );
            if (match)
              coords = { lng: parseFloat(match[1]), lat: parseFloat(match[2]) };
          } else if (
            /^[0-9A-F]+$/i.test(data.location) &&
            data.location.length >= 42
          ) {
            try {
              const hexToDouble = (hex: string) => {
                const bytes = new Uint8Array(
                  hex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
                );
                const view = new DataView(bytes.buffer);
                return view.getFloat64(0, true);
              };
              if (data.location.length === 50) {
                coords = {
                  lng: hexToDouble(data.location.substring(18, 34)),
                  lat: hexToDouble(data.location.substring(34, 50)),
                };
              } else if (data.location.length === 42) {
                coords = {
                  lng: hexToDouble(data.location.substring(10, 26)),
                  lat: hexToDouble(data.location.substring(26, 42)),
                };
              }
            } catch (e) {
              console.error("Hex parse error:", e);
            }
          }
        } else if (
          data.location.type === "Point" &&
          Array.isArray(data.location.coordinates)
        ) {
          coords = {
            lng: data.location.coordinates[0],
            lat: data.location.coordinates[1],
          };
        }
        if (coords && isFinite(coords.lat) && isFinite(coords.lng)) {
          setLocation(coords);
        }
      }

      setStoreId(store.id);
      setPageLoading(false);

      const { data: catData } = await supabase
        .from("products")
        .select("category")
        .eq("store_id", store.id);
      if (catData) {
        const cats = Array.from(
          new Set(catData.map((p) => p.category).filter(Boolean))
        ) as string[];
        setExistingCategories(cats);
      }
    };
    fetchProductData();
  }, [storeSlug, productSlug]);

  useEffect(() => {
    if (!imageFile) return;
    const url = URL.createObjectURL(imageFile);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  // Autocomplete de endereço (igual ao CriarProduto)
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
    const cityComponent = feature.context?.find((c: any) =>
      c.id.includes("place")
    );
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
        const cityComponent = feature.context?.find((c: any) =>
          c.id.includes("place")
        );
        if (cityComponent) setCity(cityComponent.text);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdate = async () => {
    if (!name || !price || !productId) {
      toast.error("Preencha os campos obrigatórios");
      return;
    }

    setLoading(true);
    let imagePath: string | undefined = undefined;

    if (imageFile) {
      const fileExt = imageFile.name.split(".").pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const { data, error } = await supabase.storage
        .from("product-images")
        .upload(fileName, imageFile);
      if (!error && data) imagePath = data.path;
    }

    let slug = name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)+/g, "");

    let isUnique = false;
    while (!isUnique) {
      const { data } = await supabase
        .from("products")
        .select("id")
        .eq("slug", slug)
        .neq("id", productId)
        .limit(1)
        .maybeSingle();
      if (data) slug = slug + "-" + Math.floor(Math.random() * 9999).toString();
      else isUnique = true;
    }

    const locationString = location
      ? `SRID=4326;POINT(${location.lng} ${location.lat})`
      : null;

    const updateData: any = {
      name,
      slug,
      description,
      price: parseFloat(price.replace(",", ".")),
      type,
      price_type: priceType,
      location: locationString,
      address: address || null,
      city: city || null,
      category: category || null,
    };

    if (imagePath) updateData.image_url = imagePath;

    const { error } = await supabase
      .from("products")
      .update(updateData)
      .eq("id", productId);
    if (error) {
      console.error(error);
      toast.error("Erro ao atualizar produto");
      setLoading(false);
      return;
    }

    toast.success("Produto atualizado!");
    router.push(`/${profileSlug}/${storeSlug}`);
  };

  const handleDelete = async () => {
    if (
      !window.confirm(
        "Certeza que deseja deletar permanentemente este produto?"
      )
    )
      return;

    setLoading(true);
    const { error } = await supabase
      .from("products")
      .delete()
      .eq("id", productId);
    if (error) {
      console.error(error);
      toast.error("Erro ao deletar produto.");
      setLoading(false);
      return;
    }

    toast.success("Produto removido.");
    router.push(`/${profileSlug}/${storeSlug}`);
  };

  const typeOptions = [
    { label: "Produto", value: "physical", icon: Package },
    { label: "Digital", value: "digital", icon: Monitor },
    { label: "Serviço", value: "service", icon: Briefcase },
  ];

  if (pageLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-yellow-50 flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="relative flex flex-col min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-yellow-50 pb-32">
      <AnimatedBackground />

      <div className="relative z-10 max-w-2xl mx-auto px-4 py-6 w-full">
        {/* Header */}
        <header className="flex items-center gap-3 mb-6 pb-4 border-b border-orange-200/50">
          <button
            onClick={() => router.back()}
            className="w-10 h-10 flex items-center justify-center bg-white/90 border-2 border-orange-200 rounded-xl hover:bg-gradient-to-r hover:from-orange-500 hover:to-red-500 hover:text-white transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-black bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent tracking-tighter">
              Editar Produto
            </h1>
            <p className="text-[8px] font-black uppercase tracking-wider text-gray-500 mt-0.5">
              Atualize as informações do item
            </p>
          </div>
        </header>

        {/* Form Card */}
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
                <img
                  src={preview}
                  className="w-full h-full object-cover"
                  alt="Preview"
                />
              ) : (
                <ImageIcon
                  className="text-orange-500 group-hover:scale-110 transition-transform"
                  size={40}
                />
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) =>
                e.target.files && setImageFile(e.target.files[0])
              }
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
                  className={`flex flex-col items-center justify-center gap-2 py-4 border-2 rounded-xl transition-all text-[9px] font-black uppercase tracking-wider ${
                    type === option.value
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
              <Edit3 className="w-3 h-3 text-orange-500" />
              Nome do Produto
            </label>
            <input
              placeholder="Ex: Pastel de Queijo"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-white border-2 border-orange-200 rounded-xl px-4 py-3 text-gray-900 placeholder:text-gray-400 text-sm font-bold uppercase focus:outline-none focus:border-orange-500 transition-all"
            />
          </div>

          {/* PREÇO e TIPO DE PREÇO */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="block text-[10px] font-black uppercase tracking-wider text-gray-700">
                {priceType === "fixed" ? "Preço" : "Preço por Hora"}
              </label>

              <div className="flex gap-1">
                <button
                  onClick={() => setPriceType("fixed")}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-lg border-2 text-[8px] font-black uppercase tracking-wider transition-all ${
                    priceType === "fixed"
                      ? "bg-gradient-to-r from-orange-500 to-red-500 text-white border-transparent"
                      : "bg-white border-orange-200 text-gray-600 hover:bg-orange-50"
                  }`}
                >
                  <DollarSign className="w-3 h-3" />
                  Fixo
                </button>
                <button
                  onClick={() => setPriceType("hourly")}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-lg border-2 text-[8px] font-black uppercase tracking-wider transition-all ${
                    priceType === "hourly"
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
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-black text-sm">
                R$
              </span>
              <input
                placeholder="0,00"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-full bg-white border-2 border-orange-200 rounded-xl pl-12 pr-4 py-3 text-gray-900 placeholder:text-gray-400 text-sm font-bold focus:outline-none focus:border-orange-500 transition-all"
              />
              {priceType === "hourly" && (
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-bold">
                  /h
                </span>
              )}
            </div>
          </div>

          {/* DESCRIÇÃO */}
          <div className="space-y-2">
            <label className="block text-[10px] font-black uppercase tracking-wider text-gray-700">
              Descrição
            </label>
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
            <label className="block text-[10px] font-black uppercase tracking-wider text-gray-700">
              Categoria
            </label>
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
                    className={`px-3 py-1.5 border-2 rounded-xl font-black text-[9px] uppercase tracking-wider transition-all ${
                      category === cat
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

            {!location ? (
              <div className="space-y-3">
                <button
                  disabled={loadingLocation}
                  onClick={() => {
                    setLoadingLocation(true);
                    navigator.geolocation.getCurrentPosition(
                      (pos) => {
                        setLocation({
                          lat: pos.coords.latitude,
                          lng: pos.coords.longitude,
                        });
                        fetchAddressFromCoords(
                          pos.coords.latitude,
                          pos.coords.longitude
                        );
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
                  {loadingLocation
                    ? "Buscando..."
                    : "Usar minha localização atual"}
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
                <div className="flex gap-2">
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
                  <button
                    onClick={() => {
                      setLocation(null);
                      setAddress("");
                      setCity("");
                      setManualAddress("");
                    }}
                    className="flex items-center gap-2 text-red-500 hover:text-red-700 text-[9px] uppercase font-black tracking-wider"
                  >
                    <X size={12} />
                    Remover
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* AÇÕES */}
          <div className="space-y-3 pt-2">
            <button
              onClick={handleUpdate}
              disabled={loading}
              className="w-full py-3.5 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-xl font-black uppercase text-xs tracking-wider hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Salvar Alterações
                </>
              )}
            </button>

            <button
              onClick={handleDelete}
              disabled={loading}
              className="w-full py-3.5 bg-white border-2 border-red-200 text-red-500 rounded-xl font-black uppercase text-xs tracking-wider hover:bg-red-50 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              Deletar Produto
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
