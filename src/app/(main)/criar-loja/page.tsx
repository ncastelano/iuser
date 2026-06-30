// src/app/(main)/criar-loja/page.tsx
"use client";

import { useState, useRef, useEffect } from "react";
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
} from "lucide-react";
import { toast } from "sonner";
import AnimatedBackground from "@/components/AnimatedBackground";
import { createSquareImage } from "@/lib/image";
import { useTheme } from "@/app/theme";
import { useProfile } from "@/app/contexts/ProfileContext";
import Header from "@/app/Header";

export default function CriarLoja() {
  const router = useRouter();
  const { colors } = useTheme();
  const { bgMode, customBgUrl, loading: profileLoading, avatarUrl: contextAvatarUrl } = useProfile();

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [loading, setLoading] = useState(false);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [slugStatus, setSlugStatus] = useState<
    "idle" | "checking" | "available" | "taken"
  >("idle");

  const [name, setName] = useState("");
  const [storeSlug, setStoreSlug] = useState("");
  const [description, setDescription] = useState("");

  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [address, setAddress] = useState("");

  const [manualAddress, setManualAddress] = useState("");
  const [editingAddress, setEditingAddress] = useState(false);

  const [suggestions, setSuggestions] = useState<any[]>([]);

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  // Dados do usuário para o Header
  const [currentUserSlug, setCurrentUserSlug] = useState<string | null>(null);
  const [currentUserAvatar, setCurrentUserAvatar] = useState<string | null>(null);

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

  // Atualiza o avatar quando o contexto carregar
  useEffect(() => {
    if (contextAvatarUrl && !currentUserAvatar) {
      setCurrentUserAvatar(contextAvatarUrl);
    }
  }, [contextAvatarUrl, currentUserAvatar]);

  // SLUG AUTOMÁTICO
  useEffect(() => {
    if (!name) return setStoreSlug("");
    const slug = name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)+/g, "");

    setStoreSlug(slug);
  }, [name]);

  // CHECAR DISPONIBILIDADE DO SLUG
  useEffect(() => {
    if (!storeSlug) {
      setSlugStatus("idle");
      return;
    }

    const check = async () => {
      setSlugStatus("checking");
      const { data } = await supabase
        .from("stores")
        .select("id")
        .eq("storeSlug", storeSlug)
        .limit(1)
        .maybeSingle();
      if (data) {
        setSlugStatus("taken");
        setStoreSlug(`${storeSlug}-${Math.floor(Math.random() * 9999)}`);
      } else {
        setSlugStatus("available");
      }
    };

    const timer = setTimeout(check, 600);
    return () => clearTimeout(timer);
  }, [storeSlug, supabase]);

  // IMAGE PREVIEW
  useEffect(() => {
    if (!imageFile) return;
    const url = URL.createObjectURL(imageFile);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  // AUTOCOMPLETE
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
    setEditingAddress(false);
  };

  const fetchAddressFromCoords = async (lat: number, lng: number) => {
    try {
      const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${token}`
      );
      const data = await res.json();

      if (data.features?.length > 0) {
        setAddress(data.features[0].place_name);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreate = async () => {
    if (!name || !storeSlug) return toast.error("Preencha os campos");

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

    const { error } = await supabase.from("stores").insert({
      name,
      storeSlug,
      description,
      logo_url: logoPath,
      owner_id: userData.user.id,
      location: location ? `POINT(${location.lng} ${location.lat})` : null,
      address: address,
    });

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    const { data: profileData } = await supabase
      .from("profiles")
      .select("profileSlug")
      .eq("id", userData.user.id)
      .single();

    const profileSlug = profileData?.profileSlug || "perfil";

    setLoading(false);
    router.push(`/${profileSlug}/${storeSlug}`);
  };

  const handleImageChange = async (file: File) => {
    try {
      const squareFile = await createSquareImage(file, 400);
      setImageFile(squareFile);
    } catch (err) {
      toast.error("Erro ao processar imagem");
    }
  };

  // -- Estilos do SacolaPage --
  const hexToRgb = (hex: string) => {
    const clean = hex.replace("#", "");
    const bigint = parseInt(clean, 16);
    return {
      r: (bigint >> 16) & 255,
      g: (bigint >> 8) & 255,
      b: bigint & 255,
    };
  };
  const surfaceRgb = hexToRgb(colors.surface);

  const cardStyle: React.CSSProperties = {
    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    border: `1px solid ${colors.border}`,
    boxShadow: colors.shadow,
    borderRadius: "1rem",
    padding: "1.5rem",
  };

  const inputStyle: React.CSSProperties = {
    background: `${colors.surface}88`,
    border: `1px solid ${colors.border}`,
    borderRadius: "0.75rem",
    padding: "0.75rem 1rem",
    color: colors.textPrimary,
    fontSize: "0.875rem",
    outline: "none",
    width: "100%",
  };

  const primaryButtonStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.5rem",
    width: "100%",
    padding: "0.875rem",
    borderRadius: "0.75rem",
    fontSize: "0.75rem",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    transition: "all 0.2s",
    background: colors.accent,
    color: colors.accentText,
    border: "none",
    boxShadow: `0 4px 14px ${colors.accent}60`,
    cursor: "pointer",
  };

  // Aba única para o Header (igual SacolaPage)
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
    <div
      className="relative flex flex-col min-h-screen pb-32"
      style={{ background: colors.background }}
    >
      <div className="fixed inset-0 z-0">
        <AnimatedBackground bgMode={bgMode} customBgUrl={customBgUrl} />
      </div>

      <main className="relative z-10 min-h-dvh" style={{ overscrollBehavior: "none" }}>
        {/* Header igual ao da SacolaPage */}
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

        <div className="px-4 pt-4 pb-24 space-y-6">
          {/* Card do formulário */}
          <div style={cardStyle} className="space-y-6">
            {/* LOGO */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{
                    background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentLight})`,
                  }}
                >
                  <Camera size={14} style={{ color: colors.accentText }} />
                </div>
                <span
                  className="text-[10px] font-black uppercase tracking-wider"
                  style={{ color: colors.textSecondary }}
                >
                  Logo da Loja
                </span>
              </div>
              <div
                onClick={() => fileInputRef.current?.click()}
                className="w-28 h-28 mx-auto rounded-xl flex items-center justify-center cursor-pointer overflow-hidden transition-all group shadow-sm"
                style={{
                  background: `linear-gradient(135deg, ${colors.accentLight}, ${colors.accentLight})`,
                  border: `2px solid ${colors.border}`,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = colors.accent;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = colors.border;
                }}
              >
                {preview ? (
                  <img src={preview} className="w-full h-full object-cover" />
                ) : (
                  <Camera
                    style={{ color: colors.accent }}
                    className="group-hover:scale-110 transition-transform"
                    size={32}
                  />
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

            {/* NOME */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{
                    background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentLight})`,
                  }}
                >
                  <Store size={14} style={{ color: colors.accentText }} />
                </div>
                <span
                  className="text-[10px] font-black uppercase tracking-wider"
                  style={{ color: colors.textSecondary }}
                >
                  Nome da Loja
                </span>
              </div>
              <input
                placeholder="Minha Super Loja"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={inputStyle}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = colors.accent;
                  e.currentTarget.style.boxShadow = `0 0 0 2px ${colors.accent}20`;
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = colors.border;
                  e.currentTarget.style.boxShadow = "none";
                }}
              />
            </div>

            {/* SLUG */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{
                    background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentLight})`,
                  }}
                >
                  <Zap size={14} style={{ color: colors.accentText }} />
                </div>
                <span
                  className="text-[10px] font-black uppercase tracking-wider"
                  style={{ color: colors.textSecondary }}
                >
                  Nome único
                </span>
              </div>
              <div
                className="flex items-center rounded-xl overflow-hidden transition-all"
                style={{
                  border: `1px solid ${colors.border}`,
                  background: `${colors.surface}88`,
                }}
              >
                <span
                  className="px-3 border-r text-xs font-bold py-3 whitespace-nowrap"
                  style={{
                    background: colors.accentLight,
                    color: colors.accent,
                    borderColor: colors.border,
                  }}
                >
                  @
                </span>
                <input
                  placeholder="minha-loja"
                  value={storeSlug}
                  onChange={(e) =>
                    setStoreSlug(
                      e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")
                    )
                  }
                  className="flex-1 px-3 py-3 text-sm outline-none"
                  style={{
                    background: "transparent",
                    color: colors.textPrimary,
                  }}
                />
              </div>
              {storeSlug && slugStatus === "checking" && (
                <div
                  className="flex items-center gap-2 text-[9px] font-bold mt-1"
                  style={{ color: colors.textSecondary }}
                >
                  <div
                    className="w-2 h-2 rounded-full animate-pulse"
                    style={{ background: colors.accent }}
                  />
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
                  Indisponível, adaptado
                </div>
              )}
            </div>

            {/* DESCRIÇÃO */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{
                    background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentLight})`,
                  }}
                >
                  <Edit3 size={14} style={{ color: colors.accentText }} />
                </div>
                <span
                  className="text-[10px] font-black uppercase tracking-wider"
                  style={{ color: colors.textSecondary }}
                >
                  Descrição
                </span>
              </div>
              <textarea
                placeholder="O que você vende?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-xl px-4 py-3 text-sm focus:outline-none transition-all min-h-[100px]"
                style={{
                  background: `${colors.surface}88`,
                  border: `1px solid ${colors.border}`,
                  color: colors.textPrimary,
                  borderRadius: "0.75rem",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = colors.accent;
                  e.currentTarget.style.boxShadow = `0 0 0 2px ${colors.accent}20`;
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = colors.border;
                  e.currentTarget.style.boxShadow = "none";
                }}
              />
            </div>

            {/* LOCALIZAÇÃO */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{
                    background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentLight})`,
                  }}
                >
                  <MapPinned size={14} style={{ color: colors.accentText }} />
                </div>
                <span
                  className="text-[10px] font-black uppercase tracking-wider"
                  style={{ color: colors.textSecondary }}
                >
                  Localização
                </span>
              </div>

              {!location && !editingAddress && (
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
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-black uppercase text-[9px] tracking-wider transition-all"
                    style={{
                      background: colors.accentLight,
                      color: colors.accent,
                      border: `1px solid ${colors.border}`,
                    }}
                  >
                    <MapPinned size={14} />
                    {loadingLocation ? "Buscando..." : "Usar minha localização atual"}
                  </button>

                  <div className="relative">
                    <input
                      placeholder="Ou digite o endereço..."
                      value={manualAddress}
                      onChange={(e) => {
                        setManualAddress(e.target.value);
                        setEditingAddress(true);
                      }}
                      style={inputStyle}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = colors.accent;
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = colors.border;
                      }}
                    />
                    {suggestions.length > 0 && (
                      <div
                        className="absolute top-full left-0 right-0 mt-2 rounded-xl overflow-hidden shadow-lg z-50"
                        style={{
                          background: colors.surface,
                          border: `1px solid ${colors.border}`,
                        }}
                      >
                        {suggestions.map((s, i) => (
                          <div
                            key={i}
                            onClick={() => selectSuggestion(s)}
                            className="p-3 cursor-pointer border-b text-sm"
                            style={{
                              borderColor: colors.border,
                              color: colors.textPrimary,
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = colors.accentLight;
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "transparent";
                            }}
                          >
                            {s.place_name}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {location && !editingAddress && (
                <div
                  className="p-4 rounded-xl space-y-2"
                  style={{
                    background: colors.accentLight,
                    border: `1px solid ${colors.border}`,
                  }}
                >
                  <p className="text-sm font-medium" style={{ color: colors.textPrimary }}>
                    {address}
                  </p>
                  <button
                    onClick={() => setEditingAddress(true)}
                    className="flex items-center gap-2 text-[9px] uppercase font-black tracking-wider"
                    style={{ color: colors.accent }}
                  >
                    <Edit3 size={12} />
                    Editar Local
                  </button>
                </div>
              )}

              {editingAddress && (
                <div className="relative space-y-3">
                  <input
                    placeholder="Digite um novo endereço"
                    value={manualAddress}
                    onChange={(e) => setManualAddress(e.target.value)}
                    style={inputStyle}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = colors.accent;
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = colors.border;
                    }}
                  />
                  {suggestions.length > 0 && (
                    <div
                      className="absolute top-full left-0 right-0 mt-2 rounded-xl overflow-hidden shadow-lg z-50"
                      style={{
                        background: colors.surface,
                        border: `1px solid ${colors.border}`,
                      }}
                    >
                      {suggestions.map((s, i) => (
                        <div
                          key={i}
                          onClick={() => selectSuggestion(s)}
                          className="p-3 cursor-pointer border-b text-sm"
                          style={{
                            borderColor: colors.border,
                            color: colors.textPrimary,
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = colors.accentLight;
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "transparent";
                          }}
                        >
                          {s.place_name}
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => {
                      setEditingAddress(false);
                      setSuggestions([]);
                    }}
                    className="flex items-center gap-2 text-[9px] uppercase font-black tracking-wider"
                    style={{ color: colors.textSecondary }}
                  >
                    <X size={12} />
                    Cancelar
                  </button>
                </div>
              )}
            </div>

            {/* BOTÃO CRIAR */}
            <button
              onClick={handleCreate}
              disabled={loading}
              style={primaryButtonStyle}
              onMouseEnter={(e) => {
                e.currentTarget.style.filter = "brightness(0.95)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.filter = "brightness(1)";
              }}
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
          </div>
        </div>

        {/* Botões flutuantes */}
        <div style={{ position: 'fixed', bottom: 32, right: 24, display: 'flex', gap: 12, zIndex: 998 }}>
          <button
            onClick={() => router.back()}
            className="w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-transform duration-200 hover:scale-110 active:scale-95"
            style={{
              background: `linear-gradient(135deg, ${colors.accent}, ${colors.accent}dd)`,
              color: colors.accentText,
              border: `2px solid ${colors.border}`,
              boxShadow: `0 8px 24px ${colors.accent}60`,
            }}
            aria-label="Voltar para a página anterior"
          >
            <ArrowLeft size={24} />
          </button>
          <button
            onClick={() => router.push('/')}
            className="w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-transform duration-200 hover:scale-110 active:scale-95"
            style={{
              background: `linear-gradient(135deg, ${colors.accent}, ${colors.accent}dd)`,
              color: colors.accentText,
              border: `2px solid ${colors.border}`,
              boxShadow: `0 8px 24px ${colors.accent}60`,
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