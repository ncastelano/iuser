// app/(main)/[profileSlug]/fazer-divulgacao/page.tsx

"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import {
    ImageIcon,
    MapPinned,
    ArrowLeft,
    Plus,
    MapPin,
    Eye,
    Video,
    Camera,
    X,
    Megaphone,
    Link2,
    Palette,
    Hash,
    Sparkles,
    Navigation,
    Search,
    MoveVertical,
    Home,
    Loader2,
    Film,
    Clock,
} from "lucide-react";
import { toast } from "sonner";
import { useTheme } from "@/app/theme";
import AnimatedBackgroundiUser from "@/components/AnimatedBackground";
import { useProfile } from "@/app/contexts/ProfileContext";
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL, fetchFile } from '@ffmpeg/util';

type MediaType = "image" | "video" | "gif" | null;

// Tipo para o botão
type ButtonDisplay = {
    text: string;
    color: string;
    link: string | null;
    isWhatsapp: boolean;
} | null;

// Cores pré-definidas para o botão
const BUTTON_COLORS = [
    { name: "Verde", value: "#10b981" },
    { name: "Azul", value: "#3b82f6" },
    { name: "Vermelho", value: "#ef4444" },
    { name: "Amarelo", value: "#eab308" },
    { name: "Roxo", value: "#8b5cf6" },
    { name: "Rosa", value: "#ec4899" },
    { name: "Laranja", value: "#f97316" },
    { name: "Ciano", value: "#06b6d4" },
    { name: "Cinza", value: "#6b7280" },
    { name: "Preto", value: "#1f2937" },
];

// Pré-modelos de botões para redes sociais e plataformas
const PRESET_BUTTONS = [
    { name: "WhatsApp", color: "#25D366", text: "WhatsApp" },
    { name: "YouTube", color: "#FF0000", text: "YouTube" },
    { name: "Instagram", color: "#E4405F", text: "Instagram" },
    { name: "Facebook", color: "#1877F2", text: "Facebook" },
    { name: "Spotify", color: "#1DB954", text: "Spotify" },
    { name: "SoundCloud", color: "#FF3300", text: "SoundCloud" },
    { name: "Google Play", color: "#34A853", text: "Google Play" },
    { name: "App Store", color: "#007AFF", text: "App Store" },
    { name: "Reddit", color: "#FF4500", text: "Reddit" },
];

// Gradiente fixo laranja-vermelho
const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)';

// Style para botões pill
const pillButtonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    padding: '0.75rem 1.25rem',
    borderRadius: '9999px',
    fontSize: '0.875rem',
    fontWeight: 700,
    transition: 'all 0.2s ease',
    cursor: 'pointer',
    border: 'none',
};

const pillButtonFullStyle: React.CSSProperties = {
    ...pillButtonStyle,
    width: '100%',
};

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

// Funções de geocodificação
async function geocodeAddress(query: string): Promise<{ lat: number; lng: number; address: string } | null> {
    try {
        const res = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&addressdetails=1`,
            { headers: { 'User-Agent': 'iUserApp/1.0', 'Accept-Language': 'pt-BR' } }
        );
        if (!res.ok) throw new Error('Erro');
        const data = await res.json();

        if (data?.length > 0) {
            return {
                lat: parseFloat(data[0].lat),
                lng: parseFloat(data[0].lon),
                address: data[0].display_name || query
            };
        }
        return null;
    } catch {
        return null;
    }
}

async function reverseGeocode(lat: number, lng: number): Promise<{
    fullAddress: string;
    extractedNumber: string;
}> {
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

        return { fullAddress: formatted, extractedNumber };
    } catch {
        const fallback = `Local (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
        return { fullAddress: fallback, extractedNumber: '' };
    }
}

export default function FazerDivulgacao() {
    const router = useRouter();
    const params = useParams();
    const { colors } = useTheme();
    const { bgMode, customBgUrl } = useProfile();
    const surfaceRgb = hexToRgb(colors.surface);

    const profileSlug = Array.isArray(params.profileSlug)
        ? params.profileSlug[0]
        : params.profileSlug;

    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const videoInputRef = useRef<HTMLInputElement | null>(null);
    const coverInputRef = useRef<HTMLInputElement | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const ffmpegRef = useRef<FFmpeg | null>(null);

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

    // Capa (thumbnail) separada para vídeos
    const [coverImageFile, setCoverImageFile] = useState<File | null>(null);
    const [coverImagePreview, setCoverImagePreview] = useState<string | null>(null);
    const [activeCoverType, setActiveCoverType] = useState<'image' | 'gif' | null>(null);

    // Estados para GIF
    const [isGeneratingGif, setIsGeneratingGif] = useState(false);
    const [gifPreview, setGifPreview] = useState<string | null>(null);
    const [gifFile, setGifFile] = useState<File | null>(null);
    const [gifDuration, setGifDuration] = useState(5);
    const [gifStartTime, setGifStartTime] = useState(0);
    const [videoDuration, setVideoDuration] = useState(0);
    const [showGifControls, setShowGifControls] = useState(false);

    const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
    const [address, setAddress] = useState("");
    const [addressNumber, setAddressNumber] = useState("");
    const [addressComplement, setAddressComplement] = useState("");
    const [city, setCity] = useState("");
    const [manualAddress, setManualAddress] = useState("");
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [searchError, setSearchError] = useState("");

    // Estado para o botão
    const [buttonText, setButtonText] = useState("");
    const [buttonLink, setButtonLink] = useState("");
    const [buttonColor, setButtonColor] = useState(BUTTON_COLORS[0].value);
    const [showButtonSettings, setShowButtonSettings] = useState(false);
    const [selectedPreset, setSelectedPreset] = useState<string | null>(null);

    // Estado para WhatsApp Button
    const [useWhatsappButton, setUseWhatsappButton] = useState(false);

    // Inicializar FFmpeg
    useEffect(() => {
        const initFFmpeg = async () => {
            try {
                const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
                const ffmpeg = new FFmpeg();

                await ffmpeg.load({
                    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
                    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
                });

                ffmpegRef.current = ffmpeg;
                console.log('FFmpeg carregado com sucesso!');
                toast.success('Processador de vídeo carregado!');
            } catch (error) {
                console.error('Erro ao inicializar FFmpeg:', error);
                toast.error('Erro ao carregar processador de vídeo. Recarregue a página.');
            }
        };

        const timer = setTimeout(() => {
            initFFmpeg();
        }, 1000);

        return () => clearTimeout(timer);
    }, []);

    // Função para gerar GIF do vídeo - CORRIGIDA DEFINITIVAMENTE
    const generateGifFromVideo = async () => {
        if (!videoFile) {
            toast.error('Selecione um vídeo primeiro');
            return;
        }

        if (!ffmpegRef.current) {
            toast.error('Processador de vídeo não está disponível. Aguarde o carregamento.');
            return;
        }

        setIsGeneratingGif(true);
        toast.info('🔄 Gerando GIF... Isso pode levar alguns segundos');

        try {
            const ffmpeg = ffmpegRef.current;

            if (!ffmpeg.loaded) {
                toast.info('Carregando processador de vídeo...');
                await ffmpeg.load();
            }

            const videoData = await fetchFile(videoFile);
            await ffmpeg.writeFile('input.mp4', videoData);

            // Comando FFmpeg com dimensões pares (-2) para evitar falhas de renderização
            const fps = 12;
            const duration = Math.min(gifDuration, Math.max(0.5, videoDuration - gifStartTime));

            if (duration <= 0) {
                toast.error('Duração do GIF inválida. Ajuste o tempo de início.');
                setIsGeneratingGif(false);
                return;
            }

            await ffmpeg.exec([
                '-ss', gifStartTime.toFixed(2),
                '-t', duration.toFixed(2),
                '-i', 'input.mp4',
                '-vf', `fps=${fps},scale=480:-2:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`,
                '-loop', '0',
                '-y',
                'output.gif'
            ]);

            const files = await ffmpeg.listDir('/');

            console.log(files);
            // Ler o arquivo GIF gerado
            const gifData = await ffmpeg.readFile('output.gif');

            let uint8Data: Uint8Array;
            if (gifData instanceof Uint8Array) {
                uint8Data = gifData;
            } else if (typeof gifData === 'string') {
                uint8Data = new TextEncoder().encode(gifData);
            } else {
                uint8Data = new Uint8Array(gifData as any);
            }

            if (!uint8Data || uint8Data.length === 0) {
                throw new Error('GIF gerado está vazio. Tente ajustar o tempo de início do vídeo.');
            }

            // Garante cópia limpa do ArrayBuffer puro para o Blob
            const copyUint8 = new Uint8Array(uint8Data.length);
            copyUint8.set(uint8Data);
            const gifBlob = new Blob([copyUint8.buffer], { type: 'image/gif' });
            if (gifBlob.size === 0) {
                throw new Error('Blob do GIF está vazio');
            }

            const gifUrl = URL.createObjectURL(gifBlob);
            const gifFileName = `gif_${Date.now()}.gif`;
            const gifFileObj = new File([gifBlob], gifFileName, { type: 'image/gif' });

            setGifPreview(gifUrl);
            setGifFile(gifFileObj);
            setActiveCoverType('gif');
            // FECHA O PAINEL DE CONTROLE DO GIF APÓS GERAR
            setShowGifControls(false);

            toast.success('🎬 GIF de capa em alta qualidade gerado com sucesso!');

            // Limpar arquivos temporários
            try {
                await ffmpeg.deleteFile('input.mp4');
                await ffmpeg.deleteFile('output.gif');
            } catch (e) {
                console.log('Erro ao deletar arquivos temporários:', e);
            }

        } catch (error: any) {
            console.error('Erro detalhado ao gerar GIF:', error);

            // Mensagem de erro mais amigável
            let errorMsg = 'Erro ao gerar GIF. ';
            if (error.message) {
                if (error.message.includes('codec')) {
                    errorMsg += 'O vídeo pode estar em um formato incompatível. Tente usar MP4.';
                } else if (error.message.includes('empty') || error.message.includes('vazio')) {
                    errorMsg += 'O GIF gerado está vazio. Tente ajustar o tempo de início.';
                } else {
                    errorMsg += error.message;
                }
            }
            toast.error(errorMsg);

            // Tentar limpar arquivos temporários
            try {
                if (ffmpegRef.current) {
                    await ffmpegRef.current.deleteFile('input.mp4').catch(() => { });
                    await ffmpegRef.current.deleteFile('output.gif').catch(() => { });
                }
            } catch (e) {
                // Ignorar
            }
        } finally {
            setIsGeneratingGif(false);
        }
    };

    // Função para resetar o estado do GIF de capa
    const resetGifState = () => {
        if (gifPreview) {
            URL.revokeObjectURL(gifPreview);
        }
        setGifPreview(null);
        setGifFile(null);
        if (activeCoverType === 'gif') {
            setActiveCoverType(coverImagePreview ? 'image' : null);
        }
        toast.info('GIF de capa removido');
    };

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

    const handleMediaSelection = (type: 'image' | 'video' | 'gif') => {
        setShowMediaPicker(false);
        if (type === 'image') {
            fileInputRef.current?.click();
        } else if (type === 'video') {
            videoInputRef.current?.click();
        } else {
            fileInputRef.current?.click();
        }
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Verificar se é GIF
        if (file.type === 'image/gif') {
            const sizeMB = file.size / (1024 * 1024);
            if (sizeMB > 20) {
                toast.error('GIF muito grande! Máximo 20MB.');
                return;
            }

            setGifFile(file);
            const url = URL.createObjectURL(file);
            setGifPreview(url);
            setMediaType('gif');
            toast.success('GIF selecionado!');
            return;
        }

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
            setVideoFile(file);
            const url = URL.createObjectURL(file);
            setVideoPreview(url);
            setMediaType('video');
            // NÃO ABRE O PAINEL DE GIF AUTOMATICAMENTE
            // O usuário clica em "Criar Capa" para abrir
            toast.success('Vídeo selecionado! Escolha uma capa abaixo.');
        } catch (error) {
            console.error('Erro ao processar vídeo:', error);
            toast.error('Erro ao processar vídeo. Tente novamente.');
        } finally {
            setUploading(false);
            setUploadProgress(0);
        }
    };

    const handleCoverImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const sizeMB = file.size / (1024 * 1024);

        setUploading(true);
        try {
            let processedFile = file;
            if (sizeMB > 20) {
                toast.info('Comprimindo imagem de capa...');
                processedFile = await compressImage(file, 20);
            }
            setCoverImageFile(processedFile);
            const url = URL.createObjectURL(processedFile);
            setCoverImagePreview(url);
            setActiveCoverType('image');
            toast.success('Capa adicionada!');
        } catch (error) {
            toast.error('Erro ao processar capa. Tente novamente.');
        } finally {
            setUploading(false);
        }
    };

    const handleVideoMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
        const video = e.currentTarget;
        setVideoDuration(video.duration);
        setGifDuration(Math.min(5, video.duration));
    };

    const handleVideoSeek = (time: number) => {
        if (videoRef.current) {
            videoRef.current.currentTime = time;
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

        const numberMatch = feature.place_name.match(/,?\s*(\d+)\s*,?/);
        if (numberMatch) {
            setAddressNumber(numberMatch[1]);
        }
    };

    const fetchAddressFromCoords = async (lat: number, lng: number) => {
        try {
            const result = await reverseGeocode(lat, lng);
            setAddress(result.fullAddress);
            if (result.extractedNumber) {
                setAddressNumber(result.extractedNumber);
            }
            const cityMatch = result.fullAddress.match(/([^,]+),\s*([^,]+)$/);
            if (cityMatch) {
                setCity(cityMatch[2]?.trim() || '');
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

    const handleGetCurrentLocation = () => {
        if (!navigator.geolocation) {
            toast.error('Geolocalização não suportada');
            return;
        }

        setLoadingLocation(true);

        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                const newPos = {
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude
                };
                setLocation(newPos);

                try {
                    const result = await reverseGeocode(newPos.lat, newPos.lng);
                    setAddress(result.fullAddress);
                    if (result.extractedNumber) {
                        setAddressNumber(result.extractedNumber);
                    }
                } catch (err) {
                    const fallback = `Local (${newPos.lat.toFixed(4)}, ${newPos.lng.toFixed(4)})`;
                    setAddress(fallback);
                }
                setLoadingLocation(false);
            },
            (err) => {
                let msg = 'Erro ao obter localização. ';
                switch (err.code) {
                    case err.PERMISSION_DENIED: msg += 'Permissão negada.'; break;
                    case err.POSITION_UNAVAILABLE: msg += 'Localização indisponível.'; break;
                    case err.TIMEOUT: msg += 'Tempo esgotado.'; break;
                }
                toast.error(msg);
                setLoadingLocation(false);
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );
    };

    const handleSearchAddress = async () => {
        if (!manualAddress.trim()) return;

        setIsSearching(true);
        setSearchError('');

        const result = await geocodeAddress(manualAddress.trim());

        if (result) {
            setLocation({ lat: result.lat, lng: result.lng });
            setAddress(result.address);
            setManualAddress(result.address);
            setSuggestions([]);

            const numberMatch = result.address.match(/,?\s*(\d+)\s*,?/);
            if (numberMatch) {
                setAddressNumber(numberMatch[1]);
            }
        } else {
            setSearchError('Endereço não encontrado.');
        }

        setIsSearching(false);
    };

    const applyPreset = (preset: typeof PRESET_BUTTONS[0]) => {
        setSelectedPreset(preset.name);
        setButtonText(preset.text);
        setButtonColor(preset.color);
        setUseWhatsappButton(false);
        if (preset.name === "WhatsApp") {
            setUseWhatsappButton(true);
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

        // ===== UPLOAD DE MÍDIA =====
        let imagePath: string | null = null; // image_url = thumbnail/capa no grid
        let videoPath: string | null = null; // video_url = conteúdo do vídeo

        if (videoFile) {
            // Se existir arquivo de vídeo, a publicação é SEMPRE do tipo Vídeo (media_type = 'video')
            // 1. Upload da Capa escolhida/ativa (GIF de alta qualidade gerado OU foto de capa customizada)
            const useGif = activeCoverType === 'gif' && gifFile;

            if (useGif && gifFile) {
                const gifFileName = `cover_gif_${Date.now()}.gif`;
                const { data: gifData, error: gifError } = await supabase.storage
                    .from("product-images")
                    .upload(gifFileName, gifFile);
                if (gifError) {
                    toast.error("Erro ao enviar GIF de capa: " + gifError.message);
                    setLoading(false);
                    return;
                }
                if (gifData) imagePath = gifData.path;
            } else if (coverImageFile) {
                const coverExt = coverImageFile.name.split(".").pop();
                const coverFileName = `cover_${Date.now()}.${coverExt}`;
                const { data: coverData, error: coverError } = await supabase.storage
                    .from("product-images")
                    .upload(coverFileName, coverImageFile);
                if (coverError) {
                    toast.error("Erro ao enviar capa: " + coverError.message);
                    setLoading(false);
                    return;
                }
                if (coverData) imagePath = coverData.path;
            } else if (gifFile) {
                // Fallback: se tem GIF mas activeCoverType não é 'gif', usa GIF mesmo assim
                const gifFileName = `cover_gif_${Date.now()}.gif`;
                const { data: gifData, error: gifError } = await supabase.storage
                    .from("product-images")
                    .upload(gifFileName, gifFile);
                if (gifError) {
                    toast.error("Erro ao enviar GIF de capa: " + gifError.message);
                    setLoading(false);
                    return;
                }
                if (gifData) imagePath = gifData.path;
            }

            // 2. Upload do Vídeo principal (OBRIGATÓRIO MANTIDO)
            const fileExt = videoFile.name.split(".").pop();
            const fileName = `${Date.now()}-video.${fileExt}`;
            const { data: videoDataRes, error: videoUploadError } = await supabase.storage
                .from("product-videos")
                .upload(fileName, videoFile);
            if (videoUploadError) {
                toast.error("Erro ao enviar vídeo: " + videoUploadError.message);
                setLoading(false);
                return;
            }
            if (videoDataRes) videoPath = videoDataRes.path;
        } else if (gifFile) {
            // Post puro de GIF (sem vídeo)
            const fileName = `gif_${Date.now()}.gif`;
            const { data, error: uploadError } = await supabase.storage
                .from("product-images")
                .upload(fileName, gifFile);
            if (uploadError) {
                toast.error("Erro ao enviar GIF: " + uploadError.message);
                setLoading(false);
                return;
            }
            if (data) imagePath = data.path;
        } else if (imageFile) {
            // Post de imagem estática
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

        let fullAddress = address;
        if (addressNumber && !address.includes(addressNumber)) {
            const parts = address.split(',');
            if (parts.length > 0) {
                fullAddress = `${parts[0]}, ${addressNumber}`;
                if (parts.length > 1) {
                    fullAddress += parts.slice(1).join(',');
                }
            }
        }

        let buttonData = null;
        if (useWhatsappButton && profileWhatsapp) {
            buttonData = {
                text: "WhatsApp",
                link: `https://wa.me/${profileWhatsapp.replace(/\D/g, '')}`,
                color: "#25D366",
                isWhatsapp: true,
            };
        } else if (buttonText && buttonText.length <= 12) {
            buttonData = {
                text: buttonText,
                link: buttonLink || null,
                color: buttonColor,
                isWhatsapp: false,
            };
        }

        const finalMediaType = videoFile ? 'video' : (gifFile ? 'gif' : 'image');

        const { error } = await supabase.from("products").insert({
            name: title,
            slug,
            description: subtitle,
            price: 0,
            type: null,
            price_type: "fixed",
            listing_type: "publication",
            image_url: imagePath,       // thumbnail/capa sempre em image_url para o grid
            video_url: videoPath,       // vídeo mantido integralmente em video_url
            media_type: finalMediaType,
            store_id: null,
            owner_id: profileId,
            owner_image_url: profileAvatarUrl,
            location: locationString,
            address: fullAddress || address || null,
            city: city || null,
            category: category || null,
            duration_minutes: null,
            button_data: buttonData,
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
            if (gifPreview) URL.revokeObjectURL(gifPreview);
            if (coverImagePreview) URL.revokeObjectURL(coverImagePreview);
        };
    }, [preview, videoPreview, gifPreview, coverImagePreview]);

    const getButtonDisplay = (): ButtonDisplay => {
        if (useWhatsappButton && profileWhatsapp) {
            return {
                text: "WhatsApp",
                color: "#25D366",
                link: `https://wa.me/${profileWhatsapp.replace(/\D/g, '')}`,
                isWhatsapp: true,
            };
        } else if (buttonText && buttonText.length <= 12) {
            return {
                text: buttonText,
                color: buttonColor,
                link: buttonLink || null,
                isWhatsapp: false,
            };
        }
        return null;
    };

    const buttonDisplay = getButtonDisplay();

    // ===== ESTILO GLASSMORPHISM =====
    const cardBg = `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`;

    const glassStyle = {
        background: cardBg,
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: `1px solid ${colors.border}`,
        boxShadow: colors.shadow,
        borderRadius: '1.25rem',
        padding: '1.5rem',
    };

    // Preview do conteúdo principal (vídeo ou GIF)
    const renderMediaPreview = () => {
        if (mediaType === 'gif' && gifPreview && !videoFile) {
            return (
                <div className="relative rounded-2xl overflow-hidden border-2" style={{ borderColor: colors.accent }}>
                    <img
                        src={gifPreview}
                        className="w-full max-h-80 object-contain"
                        alt="GIF Preview"
                        style={{ imageRendering: 'pixelated' }}
                    />
                    <div className="absolute top-2 left-2 px-2 py-1 bg-black/70 rounded-lg text-white text-xs flex items-center gap-1">
                        <Film className="w-3 h-3" />
                        GIF Animado
                    </div>
                    <button
                        onClick={resetGifState}
                        className="absolute top-2 right-2 p-1.5 bg-black/70 rounded-full hover:bg-black/90 transition-colors"
                    >
                        <X className="w-4 h-4 text-white" />
                    </button>
                </div>
            );
        }

        if (videoFile && videoPreview) {
            return (
                <div className="space-y-3">
                    {/* Player de Vídeo */}
                    <div className="relative rounded-2xl overflow-hidden border-2" style={{ borderColor: colors.accent }}>
                        <video
                            ref={videoRef}
                            src={videoPreview}
                            className="w-full max-h-72 object-contain"
                            controls
                            onLoadedMetadata={handleVideoMetadata}
                        />
                        <div className="absolute top-2 left-2 px-2 py-1 bg-black/70 rounded-lg text-white text-xs flex items-center gap-1">
                            <Video className="w-3 h-3" />
                            Vídeo Principal
                        </div>
                        <button
                            onClick={() => {
                                setVideoFile(null);
                                setVideoPreview(null);
                                setMediaType(null);
                                setGifPreview(null);
                                setGifFile(null);
                                setShowGifControls(false);
                                setCoverImageFile(null);
                                setCoverImagePreview(null);
                                setActiveCoverType(null);
                            }}
                            className="absolute top-2 right-2 p-1.5 bg-black/70 rounded-full hover:bg-black/90 transition-colors"
                        >
                            <X className="w-4 h-4 text-white" />
                        </button>
                    </div>

                    {/* Capa do Vídeo (para o Grid) */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5" style={{ color: colors.textSecondary }}>
                                <Camera className="w-3 h-3" />
                                Capa da Publicação (exibida na grade)
                            </span>
                            {(gifPreview || coverImagePreview) && (
                                <span className="text-[9px] font-bold opacity-70" style={{ color: colors.textSecondary }}>
                                    Clique na capa para ativar
                                </span>
                            )}
                        </div>

                        {/* Grade de 2 colunas sempre mantida lado a lado */}
                        <div className="grid grid-cols-2 gap-2">
                            {/* COLUNA 1: Selecionar uma capa (Foto Estática) */}
                            {coverImagePreview ? (
                                <div
                                    onClick={() => setActiveCoverType('image')}
                                    className={`relative rounded-xl overflow-hidden border-2 cursor-pointer transition-all ${activeCoverType === 'image' ? 'ring-2 ring-orange-500 scale-[1.02]' : 'opacity-80 hover:opacity-100'
                                        }`}
                                    style={{
                                        borderColor: activeCoverType === 'image' ? colors.accent : colors.border,
                                    }}
                                >
                                    <img src={coverImagePreview} className="w-full h-24 object-cover" alt="Foto de Capa" />
                                    <div className="absolute bottom-1 left-1 right-1 px-1.5 py-0.5 bg-black/80 rounded text-white text-[8px] font-bold flex items-center justify-between">
                                        <span className="flex items-center gap-1">
                                            <ImageIcon className="w-2.5 h-2.5 text-blue-400" /> Foto
                                        </span>
                                        {activeCoverType === 'image' && (
                                            <span className="text-[7px] bg-orange-500 text-white px-1 rounded uppercase">Ativa</span>
                                        )}
                                    </div>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setCoverImageFile(null);
                                            setCoverImagePreview(null);
                                            if (activeCoverType === 'image') {
                                                setActiveCoverType(gifPreview ? 'gif' : null);
                                            }
                                        }}
                                        className="absolute top-1 right-1 p-1 bg-black/70 rounded-full text-white hover:bg-black/90 z-10"
                                        title="Remover foto"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                            ) : (
                                <div
                                    onClick={() => coverInputRef.current?.click()}
                                    className="h-24 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1 cursor-pointer transition-all hover:scale-[1.02]"
                                    style={{ borderColor: colors.border, background: colors.background }}
                                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#f97316'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = colors.border; }}
                                >
                                    <Camera className="w-5 h-5" style={{ color: colors.accent }} />
                                    <span className="text-xs font-bold" style={{ color: colors.textPrimary }}>Selecionar uma capa</span>
                                    <span className="text-[8px]" style={{ color: colors.textSecondary }}>Escolher imagem</span>
                                </div>
                            )}

                            {/* COLUNA 2: Criar Capa (GIF Gerado) */}
                            {gifPreview ? (
                                <div
                                    onClick={() => setActiveCoverType('gif')}
                                    className={`relative rounded-xl overflow-hidden border-2 cursor-pointer transition-all ${activeCoverType === 'gif' ? 'ring-2 ring-orange-500 scale-[1.02]' : 'opacity-80 hover:opacity-100'
                                        }`}
                                    style={{
                                        borderColor: activeCoverType === 'gif' ? '#f97316' : colors.border,
                                    }}
                                >
                                    <img src={gifPreview} className="w-full h-24 object-cover" alt="GIF de Capa" />
                                    <div className="absolute bottom-1 left-1 right-1 px-1.5 py-0.5 bg-black/80 rounded text-white text-[8px] font-bold flex items-center justify-between">
                                        <span className="flex items-center gap-1">
                                            <Film className="w-2.5 h-2.5 text-orange-400" /> GIF
                                        </span>
                                        {activeCoverType === 'gif' && (
                                            <span className="text-[7px] bg-orange-500 text-white px-1 rounded uppercase">Ativa</span>
                                        )}
                                    </div>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            resetGifState();
                                        }}
                                        className="absolute top-1 right-1 p-1 bg-black/70 rounded-full text-white hover:bg-black/90 z-10"
                                        title="Remover GIF"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                            ) : (
                                <div
                                    onClick={() => setShowGifControls(true)}
                                    className="h-24 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1 cursor-pointer transition-all hover:scale-[1.02]"
                                    style={{ borderColor: colors.border, background: colors.background }}
                                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#f97316'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = colors.border; }}
                                >
                                    <Film className="w-5 h-5" style={{ color: '#f97316' }} />
                                    <span className="text-xs font-bold" style={{ color: colors.textPrimary }}>Criar Capa</span>
                                    <span className="text-[8px]" style={{ color: colors.textSecondary }}>Gerar do vídeo</span>
                                </div>
                            )}
                        </div>

                        <input
                            ref={coverInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleCoverImageUpload}
                        />
                    </div>
                </div>
            );
        }

        if (preview) {
            return (
                <div className="relative rounded-2xl overflow-hidden border-2" style={{ borderColor: colors.accent }}>
                    <img src={preview} className="w-full max-h-80 object-contain" alt="Preview" />
                    <button
                        onClick={() => {
                            setImageFile(null);
                            setPreview(null);
                            setMediaType(null);
                        }}
                        className="absolute top-2 right-2 p-1.5 bg-black/70 rounded-full hover:bg-black/90 transition-colors"
                    >
                        <X className="w-4 h-4 text-white" />
                    </button>
                </div>
            );
        }

        return null;
    };

    // Painel de controle do GIF - SÓ APARECE QUANDO showGifControls É true
    const renderGifControls = () => {
        if (!showGifControls || !videoFile) return null;

        return (
            <div className="mt-3 p-4 rounded-2xl border" style={{
                background: colors.background,
                borderColor: colors.border,
            }}>
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <Film className="w-4 h-4" style={{ color: colors.accent }} />
                        <span className="text-sm font-bold" style={{ color: colors.textPrimary }}>
                            Gerar GIF de Capa (Alta Qualidade)
                        </span>
                    </div>
                    <button
                        onClick={generateGifFromVideo}
                        disabled={isGeneratingGif || !ffmpegRef.current}
                        className="px-4 py-2 rounded-full text-xs font-bold text-white transition-all hover:scale-105 disabled:opacity-50 flex items-center gap-2"
                        style={{
                            background: GRADIENT,
                            boxShadow: '0 2px 8px rgba(249, 115, 22, 0.4)',
                        }}
                    >
                        {isGeneratingGif ? (
                            <>
                                <Loader2 className="w-3 h-3 animate-spin" />
                                Gerando...
                            </>
                        ) : (
                            <>
                                <Film className="w-3 h-3" />
                                {gifPreview ? 'Gerar Novo GIF' : 'Gerar GIF'}
                            </>
                        )}
                    </button>
                </div>

                {videoDuration > 0 && (
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <Clock className="w-3 h-3" style={{ color: colors.textSecondary }} />
                            <span className="text-xs" style={{ color: colors.textSecondary }}>
                                Duração do vídeo: {Math.round(videoDuration)}s
                            </span>
                        </div>

                        <div className="space-y-1">
                            <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                                Início do GIF: {gifStartTime.toFixed(1)}s
                            </label>
                            <input
                                type="range"
                                min={0}
                                max={Math.max(0, videoDuration - 1)}
                                step={0.1}
                                value={gifStartTime}
                                onChange={(e) => {
                                    const time = parseFloat(e.target.value);
                                    setGifStartTime(time);
                                    handleVideoSeek(time);
                                }}
                                className="w-full h-1 rounded-full appearance-none cursor-pointer"
                                style={{
                                    background: GRADIENT,
                                }}
                            />
                            <div className="flex justify-between text-[8px]" style={{ color: colors.textSecondary }}>
                                <span>0s</span>
                                <span>{Math.round(videoDuration)}s</span>
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                                Duração do GIF: {gifDuration}s (máx. 5s)
                            </label>
                            <input
                                type="range"
                                min={1}
                                max={Math.min(5, videoDuration - gifStartTime)}
                                step={0.5}
                                value={gifDuration}
                                onChange={(e) => setGifDuration(parseFloat(e.target.value))}
                                className="w-full h-1 rounded-full appearance-none cursor-pointer"
                                style={{
                                    background: GRADIENT,
                                }}
                            />
                        </div>

                        <p className="text-[8px] mt-1" style={{ color: colors.textSecondary }}>
                            💡 Dica: GIFs são ótimos para mostrar prévias rápidas do seu conteúdo!
                        </p>
                        <p className="text-[8px] mt-1" style={{ color: colors.textSecondary }}>
                            ⚠️ Use vídeos em formato MP4 para melhor compatibilidade.
                        </p>
                    </div>
                )}

                {!ffmpegRef.current && (
                    <p className="text-xs text-yellow-500 mt-2">
                        ⚠️ Carregando processador de vídeo... Aguarde um momento.
                    </p>
                )}

                {/* Botão para fechar o painel de GIF */}
                <button
                    onClick={() => setShowGifControls(false)}
                    className="mt-3 w-full py-2 rounded-full text-xs font-bold transition-all hover:opacity-70"
                    style={{
                        background: colors.background,
                        border: `1px solid ${colors.border}`,
                        color: colors.textSecondary,
                    }}
                >
                    Fechar painel
                </button>
            </div>
        );
    };

    return (
        <div className="relative min-h-dvh">
            {/* ===== FUNDO ANIMADO ===== */}
            <div className="fixed inset-0 z-0">
                <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
            </div>

            {/* ===== CONTEÚDO ===== */}
            <div className="relative z-10 max-w-2xl mx-auto px-4 py-6 w-full min-h-dvh">
                {/* HEADER */}
                <div
                    className="flex items-center gap-3 mb-6 p-3 rounded-full"
                    style={{
                        background: cardBg,
                        backdropFilter: 'blur(12px)',
                        WebkitBackdropFilter: 'blur(12px)',
                        border: `1px solid ${colors.border}`,
                    }}
                >
                    <button
                        onClick={() => router.back()}
                        className="w-10 h-10 flex items-center justify-center rounded-full transition-all hover:scale-105"
                        style={{
                            background: `rgba(255, 255, 255, 0.08)`,
                            border: `1px solid rgba(255, 255, 255, 0.12)`,
                            color: colors.textPrimary
                        }}
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div
                        className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{
                            background: GRADIENT,
                            color: '#ffffff',
                            boxShadow: '0 4px 12px rgba(249, 115, 22, 0.4)',
                        }}
                    >
                        <Megaphone size={24} />
                    </div>
                    <div>
                        <h1 className="text-xl font-black" style={{ color: colors.textPrimary }}>
                            Fazer Divulgação
                        </h1>
                        <p className="text-xs" style={{ color: colors.textSecondary }}>
                            @{profileSlug}
                        </p>
                    </div>
                </div>

                {/* ===== EXEMPLO DE CARTAZ ===== */}
                <div className="mb-6">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5" style={{ color: colors.textSecondary }}>
                            <Eye className="w-3 h-3" />
                            Exemplo de Cartaz
                        </span>
                    </div>

                    <div
                        className="relative rounded-2xl overflow-hidden max-w-[200px] mx-auto"
                        style={{
                            background: colors.surface,
                            border: `1px solid ${colors.border}`,
                            boxShadow: colors.shadow,
                        }}
                    >
                        <div
                            className="relative w-full"
                            style={{ paddingBottom: '100%' }}
                        >
                            {/* Capa do cartaz: usa activeCoverType para decidir qual exibir */}
                            {videoFile ? (
                                // Para vídeos: usa a capa ativa (GIF ou imagem)
                                (activeCoverType === 'gif' && gifPreview) ? (
                                    <img src={gifPreview} className="absolute inset-0 w-full h-full object-cover" alt="Capa GIF" />
                                ) : (activeCoverType === 'image' && coverImagePreview) ? (
                                    <img src={coverImagePreview} className="absolute inset-0 w-full h-full object-cover" alt="Capa Foto" />
                                ) : gifPreview ? (
                                    // Fallback: se tem GIF mas não está ativo, mostra o GIF
                                    <img src={gifPreview} className="absolute inset-0 w-full h-full object-cover" alt="Capa GIF" />
                                ) : coverImagePreview ? (
                                    // Fallback: se tem imagem mas não está ativa, mostra a imagem
                                    <img src={coverImagePreview} className="absolute inset-0 w-full h-full object-cover" alt="Capa Foto" />
                                ) : (
                                    // Se não tem capa, mostra o vídeo
                                    <video src={videoPreview || undefined} className="absolute inset-0 w-full h-full object-cover" muted />
                                )
                            ) : mediaType === 'gif' && gifPreview ? (
                                // GIF puro (sem vídeo)
                                <img src={gifPreview} className="absolute inset-0 w-full h-full object-cover" alt="GIF" />
                            ) : preview ? (
                                // Imagem estática
                                <img src={preview} className="absolute inset-0 w-full h-full object-cover" alt="Preview" />
                            ) : (
                                <div className="absolute inset-0 flex items-center justify-center text-4xl font-black" style={{ color: colors.textSecondary }}>
                                    ?
                                </div>
                            )}

                            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent flex flex-col justify-end p-3">
                                <h4 className="text-xs font-bold text-white truncate">
                                    {title || "Título da Publicação"}
                                </h4>
                                <p className="text-[9px] truncate mt-0.5 text-white/80">
                                    {subtitle || "Subtítulo da publicação"}
                                </p>
                            </div>

                            {videoFile && activeCoverType === 'gif' && gifPreview && (
                                <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded-full text-[7px] font-black bg-black/80 text-orange-400 flex items-center gap-1 border border-orange-500/30">
                                    <Film className="w-3 h-3" />
                                    Vídeo + GIF
                                </span>
                            )}

                            {videoFile && activeCoverType === 'image' && coverImagePreview && (
                                <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded-full text-[7px] font-black bg-black/70 text-white flex items-center gap-1">
                                    <Video className="w-3 h-3" />
                                    Vídeo + Foto
                                </span>
                            )}

                            {videoFile && !gifPreview && !coverImagePreview && (
                                <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded-full text-[7px] font-black bg-black/70 text-white flex items-center gap-1">
                                    <Video className="w-3 h-3" />
                                    Vídeo
                                </span>
                            )}

                            {!videoFile && mediaType === 'gif' && (
                                <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded-full text-[7px] font-black bg-black/70 text-white flex items-center gap-1">
                                    <Film className="w-3 h-3" />
                                    GIF
                                </span>
                            )}

                            {buttonDisplay && (
                                <div className="absolute top-3 right-3 z-20">
                                    <button
                                        className="px-3 py-1.5 font-black uppercase text-[8px] tracking-wider text-white shadow-lg transition-all hover:scale-105 rounded-full flex items-center gap-1.5"
                                        style={{
                                            backgroundColor: buttonDisplay.color,
                                        }}
                                        onClick={() =>
                                            buttonDisplay.link &&
                                            window.open(
                                                buttonDisplay.link,
                                                "_blank"
                                            )
                                        }
                                    >
                                        {buttonDisplay.text}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    <p className="text-[8px] text-center mt-2" style={{ color: colors.textSecondary }}>
                        📢 Modo Divulgação: apenas exibe a publicação sem ação de compra
                    </p>
                </div>

                {/* FORMULÁRIO */}
                <div style={glassStyle} className="space-y-6">
                    {/* CAPA */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <label className="block text-[10px] font-black uppercase tracking-wider" style={{ color: colors.textPrimary }}>
                                Capa
                            </label>
                            <span className="text-[8px]" style={{ color: colors.textSecondary }}>
                                {mediaType === 'gif' ? 'GIF' : mediaType === 'video' ? 'Máx. 300MB' : 'Máx. 20MB'}
                            </span>
                        </div>

                        {!preview && !videoPreview && !gifPreview ? (
                            <div
                                onClick={() => setShowMediaPicker(true)}
                                className="w-full h-48 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-3 transition-all group cursor-pointer"
                                style={{
                                    borderColor: colors.border,
                                    background: colors.background,
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.borderColor = '#f97316';
                                    e.currentTarget.style.borderWidth = '3px';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.borderColor = colors.border;
                                    e.currentTarget.style.borderWidth = '2px';
                                }}
                            >
                                {uploading ? (
                                    <div className="flex flex-col items-center gap-2">
                                        <div className="w-12 h-12 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: colors.accent }} />
                                        <span className="text-sm font-bold" style={{ color: colors.accent }}>{uploadProgress}%</span>
                                        <span className="text-xs" style={{ color: colors.textSecondary }}>Processando...</span>
                                    </div>
                                ) : (
                                    <>
                                        <div className="w-16 h-16 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform" style={{ background: colors.accentLight }}>
                                            <ImageIcon className="w-8 h-8" style={{ color: colors.accent }} />
                                        </div>
                                        <div className="text-center">
                                            <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>Adicionar capa</p>
                                            <p className="text-xs" style={{ color: colors.textSecondary }}>Imagem, vídeo ou GIF (máx. 20MB)</p>
                                            <p className="text-[10px] mt-1" style={{ color: colors.textSecondary }}>Vídeos podem ser convertidos em GIF</p>
                                        </div>
                                    </>
                                )}
                            </div>
                        ) : (
                            <>
                                {renderMediaPreview()}

                                {/* Painel de GIF aparece APENAS quando showGifControls é true */}
                                {renderGifControls()}

                                {mediaType === 'video' && videoFile && (
                                    <div className="flex items-center gap-2 text-[10px] mt-2" style={{ color: colors.textSecondary }}>
                                        <Video className="w-3 h-3" />
                                        <span>{(videoFile.size / (1024 * 1024)).toFixed(1)}MB</span>
                                        {videoDuration > 0 && (
                                            <>
                                                <span>•</span>
                                                <span>{Math.round(videoDuration)}s</span>
                                            </>
                                        )}
                                        {!coverImageFile && !gifFile && (
                                            <span className="ml-1 px-2 py-0.5 rounded-full text-[8px] font-bold" style={{ background: '#f9731622', color: '#f97316' }}>
                                                ⚠ Adicione uma capa
                                            </span>
                                        )}
                                    </div>
                                )}
                                {mediaType === 'gif' && gifFile && (
                                    <div className="flex items-center gap-2 text-[10px] mt-2" style={{ color: colors.textSecondary }}>
                                        <Film className="w-3 h-3" />
                                        <span>{(gifFile.size / (1024 * 1024)).toFixed(1)}MB</span>
                                        <span>•</span>
                                        <span>{gifDuration}s</span>
                                    </div>
                                )}
                                {mediaType === 'image' && imageFile && (
                                    <div className="flex items-center gap-2 text-[10px] mt-2" style={{ color: colors.textSecondary }}>
                                        <Camera className="w-3 h-3" />
                                        <span>{(imageFile.size / (1024 * 1024)).toFixed(1)}MB</span>
                                    </div>
                                )}
                            </>
                        )}

                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*,image/gif"
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

                    {/* TÍTULO */}
                    <div className="space-y-2">
                        <label className="block text-[10px] font-black uppercase tracking-wider flex items-center gap-2" style={{ color: colors.textPrimary }}>
                            <Plus className="w-3 h-3" style={{ color: colors.accent }} />
                            Título da Publicação
                        </label>
                        <input
                            placeholder="Ex: Novo Serviço Disponível!"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="w-full border-2 rounded-2xl px-4 py-3 text-sm font-bold uppercase focus:outline-none transition-all placeholder:text-white/20"
                            style={{
                                background: colors.background,
                                borderColor: colors.border,
                                color: colors.textPrimary,
                            }}
                            onFocus={(e) => e.target.style.borderColor = colors.accent}
                            onBlur={(e) => e.target.style.borderColor = colors.border}
                        />
                    </div>

                    {/* SUBTÍTULO */}
                    <div className="space-y-2">
                        <label className="block text-[10px] font-black uppercase tracking-wider" style={{ color: colors.textPrimary }}>
                            Subtítulo
                        </label>
                        <textarea
                            placeholder="Um subtítulo que chame a atenção..."
                            value={subtitle}
                            onChange={(e) => setSubtitle(e.target.value)}
                            rows={3}
                            className="w-full border-2 rounded-2xl px-4 py-3 text-sm focus:outline-none transition-all min-h-[80px] resize-none placeholder:text-white/20"
                            style={{
                                background: colors.background,
                                borderColor: colors.border,
                                color: colors.textPrimary,
                            }}
                            onFocus={(e) => e.target.style.borderColor = colors.accent}
                            onBlur={(e) => e.target.style.borderColor = colors.border}
                        />
                    </div>

                    {/* BOTÃO DO CARTAZ */}
                    <div className="space-y-3 border-t-2 border-dashed pt-4" style={{ borderColor: colors.border }}>
                        <button
                            onClick={() => setShowButtonSettings(!showButtonSettings)}
                            className="w-full flex items-center justify-between py-2.5 px-4 border-2 rounded-2xl transition-all"
                            style={{
                                background: colors.background,
                                borderColor: colors.border,
                            }}
                        >
                            <div className="flex items-center gap-3">
                                <div
                                    className="flex items-center gap-2 px-3 py-1.5 rounded-full"
                                    style={{
                                        background: "#25D366",
                                        color: "#ffffff",
                                    }}
                                >
                                    <span className="text-[9px] font-black uppercase tracking-wider">
                                        WhatsApp
                                    </span>
                                </div>
                                <div className="text-left">
                                    <span className="text-sm font-bold block" style={{ color: colors.textPrimary }}>Botão do Cartaz</span>
                                    <span className="text-[10px]" style={{ color: colors.textSecondary }}>WhatsApp, redes sociais ou link</span>
                                </div>
                            </div>
                            <div className={`transform transition-transform ${showButtonSettings ? 'rotate-180' : ''}`}>
                                <svg className="w-5 h-5" style={{ color: colors.textSecondary }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </div>
                        </button>

                        {showButtonSettings && (
                            <div
                                className="space-y-4 p-4 rounded-2xl border"
                                style={{
                                    background: colors.background,
                                    borderColor: colors.border,
                                }}
                            >
                                <div className="space-y-2">
                                    <label className="block text-[10px] font-black uppercase tracking-wider" style={{ color: colors.textPrimary }}>
                                        Botões
                                    </label>
                                    <div className="flex flex-wrap gap-2">
                                        {PRESET_BUTTONS.map((preset) => {
                                            const isActive = selectedPreset === preset.name && buttonColor === preset.color;
                                            return (
                                                <button
                                                    key={preset.name}
                                                    onClick={() => applyPreset(preset)}
                                                    className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-wider transition-all ${isActive ? 'text-white' : ''
                                                        }`}
                                                    style={{
                                                        background: isActive ? preset.color : colors.background,
                                                        border: `1px solid ${isActive ? preset.color : colors.border}`,
                                                        color: isActive ? 'white' : colors.textPrimary,
                                                    }}
                                                >
                                                    {preset.name}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="border-t border-dashed" style={{ borderColor: colors.border }} />

                                {profileWhatsapp && (
                                    <div className="space-y-2">
                                        <label className="flex items-center gap-3 cursor-pointer">
                                            <input
                                                type="radio"
                                                name="buttonType"
                                                checked={useWhatsappButton}
                                                onChange={() => {
                                                    setUseWhatsappButton(true);
                                                    setButtonText("");
                                                    setButtonLink("");
                                                    setSelectedPreset("WhatsApp");
                                                    setButtonColor("#25D366");
                                                }}
                                                className="w-4 h-4 accent-green-500"
                                            />
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-bold" style={{ color: colors.textPrimary }}>
                                                    WhatsApp do Perfil
                                                </span>
                                                <span className="text-[10px]" style={{ color: colors.textSecondary }}>
                                                    ({profileWhatsapp})
                                                </span>
                                            </div>
                                        </label>
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <label className="flex items-center gap-3 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="buttonType"
                                            checked={!useWhatsappButton}
                                            onChange={() => {
                                                setUseWhatsappButton(false);
                                                setSelectedPreset(null);
                                            }}
                                            className="w-4 h-4 accent-green-500"
                                        />
                                        <span className="text-sm font-bold" style={{ color: colors.textPrimary }}>
                                            Personalizado
                                        </span>
                                    </label>

                                    {!useWhatsappButton && (
                                        <div className="space-y-3 pl-7">
                                            <div className="space-y-2">
                                                <label className="block text-[10px] font-black uppercase tracking-wider flex items-center gap-2" style={{ color: colors.textPrimary }}>
                                                    <Hash className="w-3 h-3" style={{ color: colors.accent }} />
                                                    Texto (máx. 12 caracteres)
                                                </label>
                                                <input
                                                    placeholder="Ex: Comprar, Saber Mais..."
                                                    value={buttonText}
                                                    onChange={(e) => {
                                                        const value = e.target.value.slice(0, 12);
                                                        setButtonText(value);
                                                        setSelectedPreset(null);
                                                    }}
                                                    maxLength={12}
                                                    className="w-full border-2 rounded-2xl px-4 py-3 text-sm font-bold uppercase focus:outline-none transition-all placeholder:text-white/20"
                                                    style={{
                                                        background: colors.background,
                                                        borderColor: colors.border,
                                                        color: colors.textPrimary,
                                                    }}
                                                    onFocus={(e) => e.target.style.borderColor = colors.accent}
                                                    onBlur={(e) => e.target.style.borderColor = colors.border}
                                                />
                                                <span className="text-[8px] block text-right" style={{ color: colors.textSecondary }}>
                                                    {buttonText.length}/12 caracteres
                                                </span>
                                            </div>

                                            <div className="space-y-2">
                                                <label className="block text-[10px] font-black uppercase tracking-wider flex items-center gap-2" style={{ color: colors.textPrimary }}>
                                                    <Link2 className="w-3 h-3" style={{ color: colors.accent }} />
                                                    Link (opcional)
                                                </label>
                                                <input
                                                    placeholder="https://seusite.com/oferta"
                                                    value={buttonLink}
                                                    onChange={(e) => setButtonLink(e.target.value)}
                                                    className="w-full border-2 rounded-2xl px-4 py-3 text-sm focus:outline-none transition-all placeholder:text-white/20"
                                                    style={{
                                                        background: colors.background,
                                                        borderColor: colors.border,
                                                        color: colors.textPrimary,
                                                    }}
                                                    onFocus={(e) => e.target.style.borderColor = colors.accent}
                                                    onBlur={(e) => e.target.style.borderColor = colors.border}
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                <label className="block text-[10px] font-black uppercase tracking-wider flex items-center gap-2" style={{ color: colors.textPrimary }}>
                                                    <Palette className="w-3 h-3" style={{ color: colors.accent }} />
                                                    Cor do Botão
                                                </label>
                                                <div className="flex flex-wrap gap-2">
                                                    {BUTTON_COLORS.map((color) => (
                                                        <button
                                                            key={color.value}
                                                            onClick={() => {
                                                                setButtonColor(color.value);
                                                                setSelectedPreset(null);
                                                            }}
                                                            className={`w-10 h-10 rounded-full transition-all hover:scale-110 ${buttonColor === color.value
                                                                ? 'ring-2 ring-offset-2 scale-110'
                                                                : ''
                                                                }`}
                                                            style={{
                                                                backgroundColor: color.value,
                                                            }}
                                                            title={color.name}
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {buttonDisplay && (
                                    <div className="p-3 rounded-2xl border" style={{
                                        background: colors.background,
                                        borderColor: colors.border,
                                    }}>
                                        <p className="text-[10px] mb-2" style={{ color: colors.textSecondary }}>Preview do botão:</p>
                                        <button
                                            className="px-4 py-2 font-black uppercase text-xs tracking-wider text-white rounded-full transition-all hover:scale-105 flex items-center gap-2"
                                            style={{
                                                backgroundColor: buttonDisplay.color,
                                            }}
                                            onClick={() =>
                                                buttonDisplay.link &&
                                                window.open(
                                                    buttonDisplay.link,
                                                    "_blank"
                                                )
                                            }
                                        >
                                            {buttonDisplay.text}
                                        </button>
                                        {buttonDisplay.link && (
                                            <p className="text-[8px] mt-1 truncate" style={{ color: colors.textSecondary }}>
                                                🔗 {buttonDisplay.link}
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* CATEGORIA */}
                    <div className="space-y-2">
                        <label className="block text-[10px] font-black uppercase tracking-wider" style={{ color: colors.textPrimary }}>Categoria</label>
                        <input
                            placeholder="Ex: Bebidas, Sobremesas..."
                            value={category}
                            onChange={(e) => setCategory(e.target.value)}
                            className="w-full border-2 rounded-2xl px-4 py-3 text-sm font-bold uppercase focus:outline-none transition-all placeholder:text-white/20"
                            style={{
                                background: colors.background,
                                borderColor: colors.border,
                                color: colors.textPrimary,
                            }}
                            onFocus={(e) => e.target.style.borderColor = colors.accent}
                            onBlur={(e) => e.target.style.borderColor = colors.border}
                        />
                        {existingCategories.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-2">
                                {existingCategories.map((cat) => (
                                    <button
                                        key={cat}
                                        onClick={() => setCategory(cat)}
                                        className={`px-3 py-1.5 border-2 rounded-2xl font-black text-[9px] uppercase tracking-wider transition-all ${category === cat
                                            ? "text-white border-transparent"
                                            : "border-2"
                                            }`}
                                        style={{
                                            background: category === cat ? colors.accent : colors.background,
                                            borderColor: category === cat ? 'transparent' : colors.border,
                                            color: category === cat ? 'white' : colors.textPrimary,
                                        }}
                                    >
                                        {cat}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* LOCALIZAÇÃO */}
                    <div className="space-y-3">
                        <label className="block text-[10px] font-black uppercase tracking-wider flex items-center gap-2" style={{ color: colors.textPrimary }}>
                            <MapPinned className="w-3 h-3" style={{ color: colors.accent }} />
                            Localização (opcional)
                        </label>

                        {location ? (
                            <div className="space-y-2">
                                <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-2xl"
                                    style={{
                                        background: `${colors.surface}88`,
                                        border: `1px solid ${colors.accent}44`,
                                    }}
                                >
                                    <div className="flex-shrink-0 mt-0.5">
                                        <div className="w-6 h-6 rounded-full bg-orange-500/20 flex items-center justify-center">
                                            <MoveVertical size={14} style={{ color: '#F97316' }} />
                                        </div>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <span className="text-[10px] font-semibold uppercase tracking-wider opacity-50" style={{ color: colors.textSecondary }}>
                                            Localização selecionada
                                        </span>
                                        <p className="text-xs font-medium mt-0.5 break-words leading-relaxed" style={{ color: colors.textPrimary }}>
                                            {address || 'Carregando endereço...'}
                                        </p>
                                        {addressNumber && (
                                            <p className="text-[11px] mt-0.5 opacity-70" style={{ color: colors.textSecondary }}>
                                                Nº {addressNumber}
                                            </p>
                                        )}
                                        {addressComplement && (
                                            <p className="text-[11px] mt-0.5 opacity-70 italic" style={{ color: colors.textSecondary }}>
                                                "{addressComplement}"
                                            </p>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => {
                                            setLocation(null);
                                            setAddress("");
                                            setAddressNumber("");
                                            setAddressComplement("");
                                            setCity("");
                                            setManualAddress("");
                                            setSuggestions([]);
                                        }}
                                        className="text-xs font-bold hover:opacity-70 transition-opacity flex-shrink-0"
                                        style={{ color: colors.textSecondary }}
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <div className="flex gap-2">
                                    <div className="flex-1 flex items-center pl-0 pr-2 py-0.5 rounded-full text-xs font-semibold"
                                        style={{
                                            background: colors.background,
                                            border: `1px solid ${colors.border}`,
                                        }}
                                    >
                                        <div className="h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0"
                                            style={{ background: colors.background }}>
                                            <Search size={14} style={{ color: colors.textSecondary }} />
                                        </div>
                                        <input
                                            type="text"
                                            value={manualAddress}
                                            onChange={(e) => setManualAddress(e.target.value)}
                                            placeholder="Buscar endereço..."
                                            className="flex-1 bg-transparent outline-none ml-1.5 text-xs"
                                            style={{ color: colors.textPrimary }}
                                            disabled={isSearching}
                                            onKeyDown={(e) => { if (e.key === 'Enter') handleSearchAddress() }}
                                        />
                                        {manualAddress && (
                                            <button
                                                onClick={handleSearchAddress}
                                                disabled={isSearching}
                                                className="px-3 py-1 rounded-full text-xs font-bold transition-opacity hover:opacity-80 text-white"
                                                style={{
                                                    background: GRADIENT,
                                                    boxShadow: '0 2px 8px rgba(249, 115, 22, 0.4)',
                                                }}
                                            >
                                                {isSearching ? <Loader2 size={12} className="animate-spin" /> : 'Ir'}
                                            </button>
                                        )}
                                    </div>

                                    <button
                                        onClick={handleGetCurrentLocation}
                                        disabled={loadingLocation}
                                        className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold transition-all hover:opacity-80 disabled:opacity-50 flex-shrink-0 text-white"
                                        style={{
                                            background: GRADIENT,
                                            boxShadow: '0 2px 8px rgba(249, 115, 22, 0.4)',
                                        }}
                                        title="Usar GPS"
                                    >
                                        {loadingLocation ? <Loader2 size={14} className="animate-spin" /> : <Navigation size={14} />}
                                        <span className="hidden sm:inline">GPS</span>
                                    </button>
                                </div>

                                {searchError && (
                                    <p className="text-red-500 text-xs font-medium">{searchError}</p>
                                )}

                                {suggestions.length > 0 && (
                                    <div className="rounded-2xl overflow-hidden border" style={{
                                        background: colors.surface,
                                        borderColor: colors.border,
                                    }}>
                                        {suggestions.map((s, i) => (
                                            <div
                                                key={i}
                                                onClick={() => selectSuggestion(s)}
                                                className="p-3 cursor-pointer border-b last:border-0 text-sm transition-colors hover:bg-opacity-50"
                                                style={{
                                                    borderColor: colors.border,
                                                    color: colors.textPrimary,
                                                    background: colors.background,
                                                }}
                                                onMouseEnter={(e) => {
                                                    e.currentTarget.style.background = colors.accentLight;
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.background = colors.background;
                                                }}
                                            >
                                                <div className="flex items-start gap-2">
                                                    <MapPin size={14} className="flex-shrink-0 mt-0.5" style={{ color: colors.textSecondary }} />
                                                    <span className="text-xs">{s.place_name}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {(profileAddress || (profileLat != null && profileLng != null)) && (
                                    <button
                                        onClick={useProfileAddress}
                                        className="w-full flex items-center justify-center gap-2 py-2.5 border-2 rounded-2xl font-black uppercase text-[9px] tracking-wider transition-all hover:opacity-80"
                                        style={{
                                            background: `${colors.accent}11`,
                                            borderColor: colors.accent,
                                            color: colors.accent
                                        }}
                                    >
                                        <Home size={14} />
                                        Usar endereço do perfil
                                    </button>
                                )}
                            </div>
                        )}

                        {location && (
                            <div className="flex items-center gap-2 text-[10px]" style={{ color: colors.textSecondary }}>
                                <MapPin size={12} />
                                <span>Lat: {location.lat.toFixed(6)} | Lng: {location.lng.toFixed(6)}</span>
                            </div>
                        )}
                    </div>

                    {/* BOTÃO CRIAR */}
                    <button
                        onClick={handleCreate}
                        disabled={loading}
                        style={{
                            ...pillButtonFullStyle,
                            background: GRADIENT,
                            color: '#ffffff',
                            boxShadow: '0 4px 14px rgba(249, 115, 22, 0.5)',
                        }}
                        className="hover:scale-[1.02] transition-transform disabled:opacity-50"
                    >
                        {loading ? (
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <>
                                <Sparkles className="w-4 h-4" />
                                Fazer Divulgação
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Media Picker Modal */}
            {showMediaPicker && (
                <div className="fixed inset-0 z-[150] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="rounded-2xl max-w-md w-full p-6 shadow-2xl" style={{ background: colors.surface }}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>Escolher mídia</h3>
                            <button onClick={() => setShowMediaPicker(false)} style={{ color: colors.textSecondary }}>
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                            {/* Foto */}
                            <button
                                onClick={() => handleMediaSelection('image')}
                                className="p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2"
                                style={{
                                    borderColor: mediaType === 'image' ? colors.accent : colors.border,
                                    background: colors.background,
                                }}
                            >
                                <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: colors.accentLight }}>
                                    <Camera className="w-6 h-6" style={{ color: colors.accent }} />
                                </div>
                                <span className="font-bold text-xs" style={{ color: colors.textPrimary }}>Foto</span>
                                <span className="text-[8px] text-center" style={{ color: colors.textSecondary }}>JPG, PNG, WEBP</span>
                            </button>

                            {/* Vídeo com capa */}
                            <button
                                onClick={() => handleMediaSelection('video')}
                                className="p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2"
                                style={{
                                    borderColor: mediaType === 'video' ? colors.accent : colors.border,
                                    background: colors.background,
                                }}
                            >
                                <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: colors.accentLight }}>
                                    <Video className="w-6 h-6" style={{ color: colors.accent }} />
                                </div>
                                <span className="font-bold text-xs" style={{ color: colors.textPrimary }}>Vídeo</span>
                                <span className="text-[8px] text-center" style={{ color: colors.textSecondary }}>MP4, WEBM + capa</span>
                            </button>

                            {/* GIF */}
                            <button
                                onClick={() => {
                                    fileInputRef.current?.click();
                                    setShowMediaPicker(false);
                                }}
                                className="p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2"
                                style={{
                                    borderColor: mediaType === 'gif' ? colors.accent : colors.border,
                                    background: colors.background,
                                }}
                            >
                                <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: colors.accentLight }}>
                                    <Film className="w-6 h-6" style={{ color: colors.accent }} />
                                </div>
                                <span className="font-bold text-xs" style={{ color: colors.textPrimary }}>GIF</span>
                                <span className="text-[8px] text-center" style={{ color: colors.textSecondary }}>Escolher GIF</span>
                            </button>
                        </div>

                        {/* Dica sobre vídeo com capa */}
                        <div className="mt-4 p-3 rounded-xl" style={{ background: `${colors.accent}11`, border: `1px solid ${colors.accent}33` }}>
                            <p className="text-[10px] font-bold" style={{ color: colors.accent }}>💡 Sobre o Vídeo</p>
                            <p className="text-[9px] mt-1" style={{ color: colors.textSecondary }}>
                                Ao escolher um vídeo, você poderá adicionar uma <strong>imagem de capa</strong> (thumbnail)
                                que aparece na listagem das publicações.
                                Você também pode gerar um <strong>GIF animado</strong> do vídeo para usar como capa.
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}