'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Plus, Star, User as UserIcon, Settings, Camera, X, Loader2 } from 'lucide-react'

interface StoreStats {
    ratings_count: number
    ratings_avg: number
}

interface Store {
    id: string
    name: string
    storeSlug: string
    logo_url: string | null
    is_active: boolean
    store_stats: StoreStats
}

interface UserProfile {
    avatar_url: string | null
    name: string | null
    id?: string
}

export default function MyProfile() {
    const supabase = createClient()
    const router = useRouter()

    const [stores, setStores] = useState<Store[]>([])
    const [profile, setProfile] = useState<UserProfile | null>(null)
    const [loading, setLoading] = useState(true)
    const [uploading, setUploading] = useState(false)
    const [showUploadModal, setShowUploadModal] = useState(false)
    const [selectedFile, setSelectedFile] = useState<File | null>(null)
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        const fetchMyStores = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
                router.push('/login')
                return
            }

            const { data: profileData } = await supabase
                .from('profiles')
                .select('avatar_url, name, id')
                .eq('id', user.id)
                .single()
            setProfile(profileData)

            const { data, error } = await supabase
                .from('stores')
                .select(`*`)
                .eq('owner_id', user.id)

            if (error) {
                console.error('Erro ao buscar lojas:', error)
            }

            const mapped = (data || []).map(store => ({
                ...store,
                store_stats: {
                    ratings_count: store.ratings_count || 0,
                    ratings_avg: store.ratings_avg || 0
                }
            }))

            setStores(mapped)
            setLoading(false)
        }

        fetchMyStores()
    }, [])

    const getLogoUrl = (logoPath: string | null) =>
        logoPath
            ? supabase.storage.from('store-logos').getPublicUrl(logoPath).data.publicUrl
            : ''

    const getAvatarUrl = (avatarPath: string | null) => {
        if (!avatarPath) return null
        if (avatarPath.startsWith('http')) return avatarPath
        return supabase.storage.from('avatars').getPublicUrl(avatarPath).data.publicUrl
    }

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        // Validar tipo de arquivo
        if (!file.type.startsWith('image/')) {
            alert('Por favor, selecione uma imagem válida')
            return
        }

        // Validar tamanho (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
            alert('A imagem deve ter no máximo 5MB')
            return
        }

        setSelectedFile(file)
        const preview = URL.createObjectURL(file)
        setPreviewUrl(preview)
    }

    const uploadAvatar = async () => {
        if (!selectedFile || !profile?.id) return

        setUploading(true)
        try {
            // Gerar nome único para o arquivo
            const fileExt = selectedFile.name.split('.').pop()
            const fileName = `${profile.id}-${Date.now()}.${fileExt}`
            const filePath = fileName

            // Upload para o storage
            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(filePath, selectedFile, {
                    cacheControl: '3600',
                    upsert: true
                })

            if (uploadError) {
                console.error('Erro no upload:', uploadError)
                alert('Erro ao fazer upload da imagem')
                return
            }

            // Obter URL pública
            const { data: { publicUrl } } = supabase.storage
                .from('avatars')
                .getPublicUrl(filePath)

            // Atualizar o perfil do usuário com a nova URL
            const { error: updateError } = await supabase
                .from('profiles')
                .update({ avatar_url: filePath })
                .eq('id', profile.id)

            if (updateError) {
                console.error('Erro ao atualizar perfil:', updateError)
                alert('Erro ao atualizar foto do perfil')
                return
            }

            // Atualizar estado local
            setProfile({
                ...profile,
                avatar_url: filePath
            })

            // Fechar modal e limpar estados
            setShowUploadModal(false)
            setSelectedFile(null)
            setPreviewUrl(null)

            alert('Foto de perfil atualizada com sucesso!')
        } catch (error) {
            console.error('Erro:', error)
            alert('Ocorreu um erro ao fazer upload')
        } finally {
            setUploading(false)
        }
    }

    const removeAvatar = async () => {
        if (!profile?.id) return

        if (!confirm('Tem certeza que deseja remover sua foto de perfil?')) return

        setUploading(true)
        try {
            // Se existir uma imagem, deletar do storage
            if (profile.avatar_url) {
                const { error: deleteError } = await supabase.storage
                    .from('avatars')
                    .remove([profile.avatar_url])

                if (deleteError) {
                    console.error('Erro ao deletar imagem:', deleteError)
                }
            }

            // Atualizar perfil para null
            const { error: updateError } = await supabase
                .from('profiles')
                .update({ avatar_url: null })
                .eq('id', profile.id)

            if (updateError) {
                alert('Erro ao remover foto do perfil')
                return
            }

            // Atualizar estado local
            setProfile({
                ...profile,
                avatar_url: null
            })

            alert('Foto de perfil removida com sucesso!')
        } catch (error) {
            console.error('Erro:', error)
            alert('Ocorreu um erro ao remover a foto')
        } finally {
            setUploading(false)
        }
    }

    if (loading) return <div className="min-h-screen flex items-center justify-center bg-black text-white">Carregando...</div>

    return (
        <div className="p-4 md:p-8 bg-black text-white min-h-screen">

            {/* Modal de Upload */}
            {showUploadModal && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-neutral-900 rounded-2xl border border-neutral-700 max-w-md w-full p-6">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xl font-bold">Atualizar Foto de Perfil</h3>
                            <button
                                onClick={() => {
                                    setShowUploadModal(false)
                                    setSelectedFile(null)
                                    setPreviewUrl(null)
                                }}
                                className="p-1 hover:bg-neutral-800 rounded-full transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            {/* Preview da imagem */}
                            <div
                                className="w-32 h-32 mx-auto rounded-full overflow-hidden bg-neutral-800 border-2 border-neutral-600 cursor-pointer hover:border-white transition-colors"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                {previewUrl ? (
                                    <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                                ) : profile?.avatar_url ? (
                                    <img src={getAvatarUrl(profile.avatar_url)!} alt="Current avatar" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                        <UserIcon className="w-12 h-12 text-neutral-500" />
                                    </div>
                                )}
                            </div>

                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                onChange={handleFileSelect}
                                className="hidden"
                            />

                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="w-full py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 transition-colors flex items-center justify-center gap-2"
                            >
                                <Camera className="w-4 h-4" />
                                Selecionar Imagem
                            </button>

                            {selectedFile && (
                                <p className="text-xs text-neutral-400 text-center">
                                    Arquivo: {selectedFile.name}
                                </p>
                            )}

                            <div className="flex gap-3 pt-4">
                                {profile?.avatar_url && (
                                    <button
                                        onClick={removeAvatar}
                                        disabled={uploading}
                                        className="flex-1 py-2 rounded-lg bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors disabled:opacity-50"
                                    >
                                        Remover
                                    </button>
                                )}
                                <button
                                    onClick={uploadAvatar}
                                    disabled={!selectedFile || uploading}
                                    className="flex-1 py-2 rounded-lg bg-white text-black font-semibold hover:bg-neutral-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {uploading ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Enviando...
                                        </>
                                    ) : (
                                        'Salvar'
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Header com Avatar e Botão Settings */}
            <div className="flex items-center justify-between gap-4 mb-8 pb-6 border-b border-white/10">
                <div className="flex items-center gap-4">
                    {/* Avatar com opção de editar */}
                    <div className="relative group">
                        <div className="w-16 h-16 rounded-full overflow-hidden bg-neutral-900 border border-white/20 flex items-center justify-center flex-shrink-0">
                            {profile?.avatar_url ? (
                                <img
                                    src={getAvatarUrl(profile.avatar_url)!}
                                    alt="Avatar"
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <UserIcon className="w-8 h-8 text-neutral-500" />
                            )}
                        </div>
                        <button
                            onClick={() => setShowUploadModal(true)}
                            className="absolute inset-0 bg-black/60 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                        >
                            <Camera className="w-6 h-6 text-white" />
                        </button>
                    </div>
                    <div>
                        <h1 className="text-3xl font-extrabold tracking-tight">
                            {profile?.name ?? 'Profile'}
                        </h1>

                        {profile?.name && (
                            <p className="text-neutral-400 text-sm">
                                Bem-vindo!
                            </p>
                        )}
                    </div>
                </div>

                {/* Botão Settings */}
                <button
                    onClick={() => router.push('/configuracoes')}
                    className="p-3 rounded-full bg-neutral-900/80 hover:bg-neutral-800 border border-neutral-700 hover:border-white/30 transition-all duration-300 group"
                    aria-label="Configurações"
                >
                    <Settings className="w-5 h-5 text-neutral-400 group-hover:text-white transition-colors" />
                </button>
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                <h2 className="text-xl font-bold flex items-center gap-3">
                    <span className="w-2 h-6 bg-white rounded-full shadow-[0_0_10px_rgba(255,255,255,0.5)]"></span>
                    Minhas Lojas
                </h2>
                <button
                    onClick={() => router.push('/criar-loja')}
                    className="px-5 py-2.5 bg-white hover:bg-neutral-200 hover:shadow-[0_0_15px_rgba(255,255,255,0.3)] text-black rounded-full font-bold transition-all text-sm whitespace-nowrap flex items-center gap-2"
                >
                    <Plus className="w-4 h-4" /> Criar Loja
                </button>
            </div>

            {stores.length === 0 ? (
                <div className="bg-neutral-900/50 border border-neutral-800 border-dashed rounded-2xl p-8 text-center">
                    <p className="text-neutral-400 font-medium">Você ainda não criou nenhuma loja.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                    {stores.map(store => (
                        <div
                            key={store.id}
                            onClick={() => router.push(`/${store.storeSlug}`)}
                            className="glass-glow-card cursor-pointer hover:scale-105 hover:shadow-[0_10px_30px_rgba(255,255,255,0.1)] hover:border-white/50 transition-all duration-300 group"
                        >
                            {store.logo_url ? (
                                <img
                                    src={getLogoUrl(store.logo_url)}
                                    className="w-full h-44 object-cover border-b border-neutral-800 group-hover:scale-105 transition-transform duration-700"
                                />
                            ) : (
                                <div className="w-full h-44 bg-neutral-950 border-b border-neutral-800 flex items-center justify-center">
                                    <span className="text-neutral-600 font-medium text-sm">Sem Logo</span>
                                </div>
                            )}

                            <div className="p-5 flex flex-col gap-2 relative">
                                <span className={`absolute -top-4 right-4 text-xs font-bold px-3 py-1.5 rounded-lg border shadow-lg backdrop-blur-md ${store.is_active ? 'bg-white/20 text-white border-white/30' : 'bg-red-500/20 text-red-500 border-red-500/30'
                                    }`}>
                                    {store.is_active ? 'Aberto' : 'Fechado'}
                                </span>

                                <h3 className="font-bold text-lg text-white">{store.name}</h3>

                                <div className="flex items-center text-white text-sm mt-1 gap-1">
                                    <Star className="w-3 h-3 fill-white" />
                                    <span>{store.store_stats.ratings_avg.toFixed(1)}</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}