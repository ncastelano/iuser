// app/(main)/[profileSlug]/fazer-divulgacao/page.tsx

"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import {
    ImageIcon,
    MapPinned,
    Edit3,
    ArrowLeft,
    Plus,
    Sparkles,
    MapPin,
    User,
    Eye,
    Video,
    Camera,
    X,
    MessageCircle,
    Megaphone,
} from "lucide-react";
import { toast } from "sonner";
import AnimatedBackground from "@/components/AnimatedBackground";
import { useTheme } from "@/app/theme";

type MediaType = "image" | "video" | null;

// Helper para hexToRgb
function hexToRgb(hex: string) {
    const clean = hex.replace('#', '');
    const bigint = parseInt(clean, 16);
    return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 };
}

// Função para comprimir imagem
async function compressImage(file: File, maxSizeMB: number = 20): Promise<File> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target?.result as string;
            img.onload = () => {
                let quality = 0.9;
                let width = img.width;
                let height = img.height;

                const maxDimension = 2048;
                if (width > maxDimension || height > maxDimension) {
                    const ratio = Math.min(maxDimension / width, maxDimension / height);
                    width = Math.round(width * ratio);
                    height = Math.round(height * ratio);
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0, width, height);

                let compressedFile: File | null = null;
                let attempts = 0;
                const maxAttempts = 10;

                const tryCompress = () => {
                    const dataUrl = canvas.toDataURL('image/jpeg', quality);
                    const byteString = atob(dataUrl.split(',')[1]);
                    const size = byteString.length;

                    if (size / (1024 * 1024) <= maxSizeMB || attempts >= maxAttempts) {
                        const blob = dataURLToBlob(dataUrl);
                        compressedFile = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), {
                            type: 'image/jpeg',
                        });
                        resolve(compressedFile);
                    } else {
                        quality -= 0.05;
                        attempts++;
                        tryCompress();
                    }
                };
                tryCompress();
            };
            img.onerror = reject;
        };
        reader.onerror = reject;
    });
}

function dataURLToBlob(dataURL: string): Blob {
    const parts = dataURL.split(',');
    const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
    const byteString = atob(parts[1]);
    const arrayBuffer = new ArrayBuffer(byteString.length);
    const uint8Array = new Uint8Array(arrayBuffer);
    for (let i = 0; i < byteString.length; i++) {
        uint8Array[i] = byteString.charCodeAt(i);
    }
    return new Blob([arrayBuffer], { type: mime });
}

export default function FazerDivulgacao() {
    const router = useRouter();
    const params = useParams();
    const { colors } = useTheme();
    const surfaceRgb = hexToRgb(colors.surface);

    const profileSlug = Array.isArray(params.profileSlug)
        ? params.profileSlug[0]
        : params.profileSlug;

    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const videoInputRef = useRef<HTMLInputElement | null>(null);

    const [profileId, setProfileId] = useState<string | null>(null);
    const [profileWhatsapp, setProfileWhatsapp] = useState<string | null>(null);
    const [profileAddress, setProfileAddress] = useState<string>("");
    const [profileLat, setProfileLat] = useState<number | null>(null);
    const [profileLng, setProfileLng] = useState<number | null>(null);
    const [profileName, setProfileName] = useState<string>("");
    const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(null);

    const [loading, setLoading] = useState(false);
    const [loadingLocation, setLoadingLocation] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);

    const [title, setTitle] = useState("");
    const [subtitle, setSubtitle] = useState("");
    const [category, setCategory] = useState("");
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [existingCategories, setExistingCategories] = useState<string[]>([]);
    const [mediaType, setMediaType] = useState<MediaType>(null);
    const [showMediaPicker, setShowMediaPicker] = useState(false);
    const [videoFile, setVideoFile] = useState<File | null>(null);
    const [videoPreview, setVideoPreview] = useState<string | null>(null);

    const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
    const [address, setAddress] = useState("");
    const [city, setCity] = useState("");
    const [manualAddress, setManualAddress] = useState("");
    const [suggestions, setSuggestions] = useState<any[]>([]);

    const getAvatarUrl = (avatarPath: string | null): string | null => {
        if (!avatarPath) return null;
        try {
            if (avatarPath.startsWith('http://') || avatarPath.startsWith('https://')) {
                return avatarPath;
            }
            let cleanPath = avatarPath;
            if (cleanPath.startsWith('avatars/')) {
                cleanPath = cleanPath.replace('avatars/', '');
            }
            if (cleanPath.startsWith('/')) {
                cleanPath = cleanPath.substring(1);
            }
            const { data } = supabase.storage.from('avatars').getPublicUrl(cleanPath);
            return data.publicUrl;
        } catch (error) {
            console.error('[getAvatarUrl] Erro ao gerar URL do avatar:', error);
            return null;
        }
    };

    const handleMediaSelection = (type: 'image' | 'video') => {
        setShowMediaPicker(false);
        if (type === 'image') {
            fileInputRef.current?.click();
        } else {
            videoInputRef.current?.click();
        }
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const sizeMB = file.size / (1024 * 1024);
        if (sizeMB > 300) {
            toast.error('Arquivo muito grande! Máximo 300MB.');
            return;
        }

        setUploading(true);
        setUploadProgress(0);

        try {
            let processedFile = file;
            if (sizeMB > 20) {
                toast.info('Comprimindo imagem...');
                processedFile = await compressImage(file, 20);
                toast.success('Imagem comprimida com sucesso!');
            }

            setImageFile(processedFile);
            const url = URL.createObjectURL(processedFile);
            setPreview(url);
            setMediaType('image');
            toast.success('Imagem selecionada!');
        } catch (error) {
            console.error('Erro ao processar imagem:', error);
            toast.error('Erro ao processar imagem. Tente novamente.');
        } finally {
            setUploading(false);
            setUploadProgress(0);
        }
    };

    const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const sizeMB = file.size / (1024 * 1024);
        if (sizeMB > 300) {
            toast.error('Arquivo muito grande! Máximo 300MB.');
            return;
        }

        setUploading(true);
        setUploadProgress(0);

        try {
            let processedFile = file;
            if (sizeMB > 20) {
                toast.info('Comprimindo vídeo... (pode levar alguns segundos)');
                processedFile = file;
                toast.success('Vídeo selecionado!');
            }

            setVideoFile(processedFile);
            const url = URL.createObjectURL(processedFile);
            setVideoPreview(url);
            setMediaType('video');
            toast.success('Vídeo selecionado!');
        } catch (error) {
            console.error('Erro ao processar vídeo:', error);
            toast.error('Erro ao processar vídeo. Tente novamente.');
        } finally {
            setUploading(false);
            setUploadProgress(0);
        }
    };

    useEffect(() => {
        const fetchProfile = async () => {
            if (!profileSlug) {
                toast.error("Link do perfil ausente.");
                router.push("/");
                return;
            }

            const { data, error } = await supabase
                .from("profiles")
                .select("*")
                .ilike("profileSlug", profileSlug)
                .maybeSingle();

            if (error) {
                console.error("Erro na consulta do perfil:", error);
                toast.error("Erro ao buscar dados do perfil: " + error.message);
                return;
            }

            if (!data) {
                toast.error("Perfil não encontrado. Verifique o link e tente novamente.");
                return;
            }

            setProfileId(data.id);
            setProfileWhatsapp(data.whatsapp || null);
            setProfileAddress(data.address || "");
            setProfileLat(data.store_lat ?? null);
            setProfileLng(data.store_lng ?? null);
            setProfileName(data.name || "");

            if (data.avatar_url) {
                const avatarUrl = getAvatarUrl(data.avatar_url);
                setProfileAvatarUrl(avatarUrl);
            }
        };

        fetchProfile();
    }, [profileSlug, router]);

    useEffect(() => {
        const fetchCategories = async () => {
            if (!profileId) return;

            const { data } = await supabase
                .from("products")
                .select("category")
                .eq("owner_id", profileId)
                .not("category", "is", null);

            if (data) {
                const cats = Array.from(
                    new Set(data.map((p) => p.category).filter(Boolean))
                ) as string[];
                setExistingCategories(cats);
            }
        };
        fetchCategories();
    }, [profileId]);

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

    const useProfileAddress = () => {
        if (profileLat != null && profileLng != null) {
            setLocation({ lat: profileLat, lng: profileLng });
            setAddress(profileAddress);
            setManualAddress(profileAddress);
            setCity("");
            if (!profileAddress) {
                fetchAddressFromCoords(profileLat, profileLng);
            }
        } else if (profileAddress) {
            fetchCoordsFromAddress(profileAddress);
        } else {
            toast.error("Seu perfil não possui endereço cadastrado.");
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
        if (!title || !profileId) {
            toast.error("Preencha os campos obrigatórios");
            return;
        }

        if (!profileWhatsapp) {
            toast.error("Configure o WhatsApp do seu perfil antes de criar publicações.");
            return;
        }

        setLoading(true);

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            toast.error("Faça login para continuar.");
            setLoading(false);
            return;
        }

        if (profileId !== user.id) {
            toast.error("Você não tem permissão para criar publicações neste perfil.");
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

        let videoPath: string | null = null;
        if (videoFile && mediaType === 'video') {
            const fileExt = videoFile.name.split(".").pop();
            const fileName = `${Date.now()}-video.${fileExt}`;
            const { data, error: uploadError } = await supabase.storage
                .from("product-videos")
                .upload(fileName, videoFile);
            if (uploadError) {
                toast.error("Erro ao enviar vídeo: " + uploadError.message);
                setLoading(false);
                return;
            }
            if (data) videoPath = data.path;
        }

        let slug = title
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)+/g, "");

        let isUnique = false;
        let attempts = 0;
        while (!isUnique && attempts < 10) {
            const { data: existing } = await supabase
                .from("products")
                .select("id")
                .eq("slug", slug)
                .eq("owner_id", profileId)
                .limit(1)
                .maybeSingle();
            if (existing) {
                slug = slug + "-" + Math.floor(Math.random() * 9999).toString();
                attempts++;
            } else {
                isUnique = true;
            }
        }

        if (!isUnique) {
            toast.error("Erro ao gerar slug único. Tente novamente.");
            setLoading(false);
            return;
        }

        let locationString: string | null = null;
        if (location) {
            locationString = `SRID=4326;POINT(${location.lng} ${location.lat})`;
        }

        const { error } = await supabase.from("products").insert({
            name: title,
            slug,
            description: subtitle,
            price: 0,
            type: null,
            price_type: "fixed",
            listing_type: "publication",
            image_url: mediaType === 'image' ? imagePath : (imagePath || null),
            video_url: mediaType === 'video' ? videoPath : null,
            media_type: mediaType,
            store_id: null,
            owner_id: profileId,
            owner_image_url: profileAvatarUrl,
            location: locationString,
            address: address || null,
            city: city || null,
            category: category || null,
            duration_minutes: null,
        });

        if (error) {
            console.error("Erro ao criar publicação:", error.message, error.details);
            toast.error("Erro ao criar: " + error.message);
            setLoading(false);
            return;
        }

        toast.success("Publicação criada com sucesso!");
        router.push(`/${profileSlug}`);
    };

    useEffect(() => {
        return () => {
            if (preview) URL.revokeObjectURL(preview);
            if (videoPreview) URL.revokeObjectURL(videoPreview);
        };
    }, [preview, videoPreview]);

    return (
        <div className="relative flex flex-col min-h-screen bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 pb-32">
            <AnimatedBackground />
            <div className="relative z-10 max-w-2xl mx-auto px-4 py-6 w-full">
                <header className="flex items-center gap-3 mb-6 pb-4 border-b border-green-200/50">
                    <button
                        onClick={() => router.back()}
                        className="w-10 h-10 flex items-center justify-center bg-white/90 border-2 border-green-200 rounded-xl hover:bg-gradient-to-r hover:from-green-500 hover:to-emerald-600 hover:text-white transition-all"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-black bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent tracking-tighter">
                            Fazer Divulgação
                        </h1>
                        <p className="text-[8px] font-black uppercase tracking-wider text-gray-500 mt-0.5 flex items-center gap-1">
                            <User size={10} />
                            Perfil: @{profileSlug}
                        </p>
                    </div>
                </header>

                {/* ===== EXEMPLO DE CARTAZ ===== */}
                <div className="mb-6">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[9px] font-black uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
                            <Eye className="w-3 h-3" />
                            Exemplo de Cartaz
                        </span>
                        <span className="text-[7px] font-black uppercase px-2 py-0.5 rounded-full bg-green-100 text-green-600">
                            📢 Divulgação
                        </span>
                    </div>

                    <div
                        className="relative rounded-xl overflow-hidden border transition-all max-w-[200px]"
                        style={{
                            background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
                            backdropFilter: 'blur(8px)',
                            WebkitBackdropFilter: 'blur(8px)',
                            borderColor: '#10b981',
                            boxShadow: '0 0 0 2px #10b98120',
                        }}
                    >
                        <div
                            className="aspect-square relative overflow-hidden"
                            style={{ background: colors.accentLight }}
                        >
                            {mediaType === 'video' && videoPreview ? (
                                <video src={videoPreview} className="w-full h-full object-cover" />
                            ) : preview ? (
                                <img src={preview} className="w-full h-full object-cover" alt="Preview" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-3xl font-black" style={{ color: colors.accent }}>
                                    ?
                                </div>
                            )}

                            {mediaType === 'video' && (
                                <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded-full text-[7px] font-black bg-black/70 text-white flex items-center gap-1">
                                    <Video className="w-3 h-3" />
                                    Vídeo
                                </span>
                            )}

                            <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-full text-[7px] font-black uppercase bg-green-500 text-white shadow-md">
                                Divulgação
                            </span>
                        </div>

                        <div className="p-2.5">
                            <h4 className="text-xs font-bold truncate" style={{ color: colors.textPrimary }}>
                                {title || "Título da Publicação"}
                            </h4>

                            <p className="text-[9px] truncate mt-0.5 opacity-75" style={{ color: colors.textSecondary }}>
                                {subtitle || "Subtítulo da publicação"}
                            </p>
                        </div>
                    </div>

                    <p className="text-[8px] text-gray-400 text-center mt-2">
                        📢 Modo Divulgação: apenas exibe a publicação sem ação de compra
                    </p>
                </div>

                <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-green-200/50 p-6 space-y-6 shadow-sm">
                    {/* CAPA - IMAGEM/VIDEO */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <label className="block text-[10px] font-black uppercase tracking-wider text-gray-700">
                                Capa
                            </label>
                            <span className="text-[8px] text-gray-400">Máx. 20MB</span>
                        </div>

                        {!preview && !videoPreview ? (
                            <button
                                onClick={() => setShowMediaPicker(true)}
                                className="w-full h-48 rounded-xl border-2 border-dashed border-green-300 hover:border-green-500 flex flex-col items-center justify-center gap-3 transition-all group"
                                style={{ background: 'rgba(16, 185, 129, 0.05)' }}
                            >
                                {uploading ? (
                                    <div className="flex flex-col items-center gap-2">
                                        <div className="w-12 h-12 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
                                        <span className="text-sm font-bold text-green-600">{uploadProgress}%</span>
                                        <span className="text-xs text-gray-500">Processando...</span>
                                    </div>
                                ) : (
                                    <>
                                        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center group-hover:scale-110 transition-transform">
                                            <ImageIcon className="w-8 h-8 text-green-500" />
                                        </div>
                                        <div className="text-center">
                                            <p className="text-sm font-bold text-gray-700">Adicionar capa</p>
                                            <p className="text-xs text-gray-400">Imagem ou vídeo (máx. 20MB)</p>
                                            <p className="text-[10px] text-gray-400 mt-1">Arquivos acima de 20MB serão comprimidos automaticamente</p>
                                        </div>
                                    </>
                                )}
                            </button>
                        ) : (
                            <div className="relative rounded-xl overflow-hidden border-2 border-green-300">
                                {mediaType === 'video' && videoPreview ? (
                                    <video src={videoPreview} className="w-full max-h-80 object-contain" controls />
                                ) : (
                                    <img src={preview || ''} className="w-full max-h-80 object-contain" alt="Preview" />
                                )}
                                <button
                                    onClick={() => {
                                        setImageFile(null);
                                        setPreview(null);
                                        setVideoFile(null);
                                        setVideoPreview(null);
                                        setMediaType(null);
                                    }}
                                    className="absolute top-2 right-2 p-1.5 bg-black/70 rounded-full hover:bg-black/90 transition-colors"
                                >
                                    <X className="w-4 h-4 text-white" />
                                </button>
                                {mediaType === 'video' && (
                                    <span className="absolute bottom-2 left-2 px-2 py-1 bg-black/70 rounded-lg text-white text-xs flex items-center gap-1">
                                        <Video className="w-3 h-3" />
                                        Vídeo
                                    </span>
                                )}
                                {mediaType === 'image' && imageFile && (
                                    <span className="absolute bottom-2 left-2 px-2 py-1 bg-black/70 rounded-lg text-white text-xs flex items-center gap-1">
                                        <Camera className="w-3 h-3" />
                                        {(imageFile.size / (1024 * 1024)).toFixed(1)}MB
                                    </span>
                                )}
                            </div>
                        )}

                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleImageUpload}
                        />
                        <input
                            ref={videoInputRef}
                            type="file"
                            accept="video/*"
                            className="hidden"
                            onChange={handleVideoUpload}
                        />
                    </div>

                    {/* INFO */}
                    <div className="p-3 bg-green-50 rounded-xl border border-green-200 text-xs text-green-800 space-y-1">
                        <p className="font-bold mb-1">📢 Modo divulgação ativado</p>
                        <p>A publicação será exibida como um cartaz informativo.</p>
                        {profileWhatsapp ? (
                            <p>📱 WhatsApp: <strong>{profileWhatsapp}</strong></p>
                        ) : (
                            <p className="text-red-600">⚠️ Nenhum WhatsApp configurado no perfil.</p>
                        )}
                        {(profileAddress || (profileLat != null && profileLng != null)) && (
                            <p>📍 Localização do perfil cadastrada e disponível para o produto.</p>
                        )}
                    </div>

                    {/* TÍTULO */}
                    <div className="space-y-2">
                        <label className="block text-[10px] font-black uppercase tracking-wider text-gray-700 flex items-center gap-2">
                            <Plus className="w-3 h-3 text-green-500" />
                            Título da Publicação
                        </label>
                        <input
                            placeholder="Ex: Novo Serviço Disponível!"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="w-full bg-white border-2 border-green-200 rounded-xl px-4 py-3 text-gray-900 placeholder:text-gray-400 text-sm font-bold uppercase focus:outline-none focus:border-green-500 transition-all"
                        />
                    </div>

                    {/* SUBTÍTULO */}
                    <div className="space-y-2">
                        <label className="block text-[10px] font-black uppercase tracking-wider text-gray-700">
                            Subtítulo
                        </label>
                        <textarea placeholder="Um subtítulo que chame a atenção..."
                            value={subtitle}
                            onChange={(e) => setSubtitle(e.target.value)}
                            rows={3}
                            className="w-full bg-white border-2 border-green-200 rounded-xl px-4 py-3 text-gray-900 placeholder:text-gray-400 text-sm focus:outline-none focus:border-green-500 transition-all min-h-[80px] resize-none"
                        />
                    </div>

                    {/* CATEGORIA */}
                    <div className="space-y-2">
                        <label className="block text-[10px] font-black uppercase tracking-wider text-gray-700">Categoria</label>
                        <input
                            placeholder="Ex: Bebidas, Sobremesas..."
                            value={category}
                            onChange={(e) => setCategory(e.target.value)}
                            className="w-full bg-white border-2 border-green-200 rounded-xl px-4 py-3 text-gray-900 placeholder:text-gray-400 text-sm font-bold uppercase focus:outline-none focus:border-green-500 transition-all"
                        />
                        {existingCategories.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-2">
                                {existingCategories.map((cat) => (
                                    <button
                                        key={cat}
                                        onClick={() => setCategory(cat)}
                                        className={`px-3 py-1.5 border-2 rounded-xl font-black text-[9px] uppercase tracking-wider transition-all ${category === cat
                                            ? "bg-gradient-to-r from-green-500 to-emerald-600 text-white border-transparent"
                                            : "bg-white border-green-200 text-gray-700 hover:bg-green-50"
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
                            <MapPinned className="w-3 h-3 text-green-500" />
                            Localização (opcional)
                        </label>

                        {(profileAddress || (profileLat != null && profileLng != null)) && !location && (
                            <button
                                onClick={useProfileAddress}
                                className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-50 text-blue-700 border-2 border-blue-200 rounded-xl font-black uppercase text-[9px] tracking-wider hover:bg-blue-100 transition-all"
                            >
                                <MapPin size={14} />
                                Usar endereço do perfil
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
                                    className="w-full flex items-center justify-center gap-2 py-3 bg-green-50 text-green-700 border-2 border-green-200 rounded-xl font-black uppercase text-[9px] tracking-wider hover:bg-green-100 transition-all"
                                >
                                    <MapPinned size={14} />
                                    {loadingLocation ? "Buscando..." : "Usar minha localização atual"}
                                </button>
                                <div className="relative">
                                    <input
                                        placeholder="Ou digite o endereço..."
                                        value={manualAddress}
                                        onChange={(e) => setManualAddress(e.target.value)}
                                        className="w-full bg-white border-2 border-green-200 rounded-xl px-4 py-3 text-gray-900 placeholder:text-gray-400 text-sm focus:outline-none focus:border-green-500 transition-all"
                                    />
                                    {suggestions.length > 0 && (
                                        <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-green-200 rounded-xl overflow-hidden shadow-lg z-50">
                                            {suggestions.map((s, i) => (
                                                <div
                                                    key={i}
                                                    onClick={() => selectSuggestion(s)}
                                                    className="p-3 hover:bg-green-50 cursor-pointer border-b border-green-100 last:border-0 text-sm text-gray-700"
                                                >
                                                    {s.place_name}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="p-4 bg-green-50/50 rounded-xl border border-green-200 space-y-2">
                                <p className="text-sm font-medium text-gray-800">{address}</p>
                                <button
                                    onClick={() => {
                                        setLocation(null);
                                        setAddress("");
                                        setCity("");
                                        setManualAddress("");
                                        setSuggestions([]);
                                    }}
                                    className="flex items-center gap-2 text-green-600 hover:text-green-700 text-[9px] uppercase font-black tracking-wider"
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
                        className="w-full py-3.5 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-black uppercase text-xs tracking-wider hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {loading ? (
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <>
                                <Megaphone className="w-4 h-4" />
                                Fazer Divulgação
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Media Picker Modal */}
            {showMediaPicker && (
                <div className="fixed inset-0 z-[150] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-black text-gray-800">Escolher mídia</h3>
                            <button onClick={() => setShowMediaPicker(false)} className="text-gray-500 hover:text-gray-700">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => handleMediaSelection('image')}
                                className="p-6 rounded-xl border-2 border-green-200 hover:border-green-500 hover:bg-green-50 transition-all flex flex-col items-center gap-2"
                            >
                                <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
                                    <Camera className="w-7 h-7 text-green-600" />
                                </div>
                                <span className="font-bold text-gray-700 text-sm">Foto</span>
                                <span className="text-[10px] text-gray-400">JPG, PNG, WEBP</span>
                            </button>
                            <button
                                onClick={() => handleMediaSelection('video')}
                                className="p-6 rounded-xl border-2 border-emerald-200 hover:border-emerald-500 hover:bg-emerald-50 transition-all flex flex-col items-center gap-2"
                            >
                                <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center">
                                    <Video className="w-7 h-7 text-emerald-600" />
                                </div>
                                <span className="font-bold text-gray-700 text-sm">Vídeo</span>
                                <span className="text-[10px] text-gray-400">MP4, WEBM, MOV</span>
                            </button>
                        </div>
                        <p className="text-center text-[10px] text-gray-400 mt-4">
                            Arquivos acima de 20MB serão comprimidos automaticamente
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}