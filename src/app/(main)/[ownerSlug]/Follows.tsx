// src/components/owner/Follows.tsx
'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { X, Users, UserCheck, UserPlus, Search, Loader2, User, ArrowLeft } from 'lucide-react'
import { getAvatarUrl } from '@/lib/avatar'
import { toast } from 'sonner'

interface FollowsProps {
    profileId: string
    profileSlug: string
    currentUserId: string | null
    colors: any
    type: 'followers' | 'following'
    onClose: () => void
}

interface FollowUser {
    id: string
    name: string
    profileSlug: string
    avatar_url: string | null
    isFollowing?: boolean
}

export function Follows({
    profileId,
    profileSlug,
    currentUserId,
    colors,
    type,
    onClose
}: FollowsProps) {
    const router = useRouter()
    const [users, setUsers] = useState<FollowUser[]>([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState('')
    const [hasMore, setHasMore] = useState(true)
    const [loadingMore, setLoadingMore] = useState(false)
    const [totalCount, setTotalCount] = useState(0)

    // Refs para controle
    const isLoadingRef = useRef(false)
    const pageRef = useRef(1)
    const initialLoadDoneRef = useRef(false)

    const LIMIT = 20

    // Cores baseadas no tema
    const glassBg = 'rgba(255, 255, 255, 0.05)'
    const glassBgLight = 'rgba(255, 255, 255, 0.08)'
    const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

    // Função para buscar seguidores/seguindo
    const fetchFollows = useCallback(async (reset = true) => {
        // Evitar múltiplas chamadas simultâneas
        if (isLoadingRef.current) return

        isLoadingRef.current = true

        try {
            const currentPage = reset ? 1 : pageRef.current
            const from = (currentPage - 1) * LIMIT
            const to = from + LIMIT - 1

            if (reset) {
                setLoading(true)
                setUsers([])
                setHasMore(true)
                pageRef.current = 1
            } else {
                setLoadingMore(true)
            }

            let query

            if (type === 'followers') {
                // Buscar seguidores (quem segue o perfil)
                query = supabase
                    .from('follows')
                    .select(`
                        follower_id,
                        profiles!follower_id (
                            id,
                            name,
                            avatar_url,
                            profileSlug
                        )
                    `, { count: 'exact' })
                    .eq('following_id', profileId)
                    .order('created_at', { ascending: false })
                    .range(from, to)
            } else {
                // Buscar seguindo (quem o perfil segue)
                query = supabase
                    .from('follows')
                    .select(`
                        following_id,
                        profiles!following_id (
                            id,
                            name,
                            avatar_url,
                            profileSlug
                        )
                    `, { count: 'exact' })
                    .eq('follower_id', profileId)
                    .order('created_at', { ascending: false })
                    .range(from, to)
            }

            const { data, error, count } = await query

            if (error) throw error

            // Extrair os dados do perfil
            let rawUsers: FollowUser[] = []
            if (data && data.length > 0) {
                rawUsers = data.map((item: any) => {
                    const profile = item.profiles
                    const profileData = Array.isArray(profile) ? profile[0] : profile

                    return {
                        id: profileData.id,
                        name: profileData.name || 'Usuário',
                        profileSlug: profileData.profileSlug || profileData.id,
                        avatar_url: profileData.avatar_url,
                        isFollowing: false
                    }
                })
            }

            setTotalCount(count || 0)

            // Se o usuário estiver logado, verifica quem ele já segue
            if (currentUserId && rawUsers.length > 0) {
                const userIds = rawUsers.map(u => u.id)
                const { data: followData } = await supabase
                    .from('follows')
                    .select('following_id')
                    .eq('follower_id', currentUserId)
                    .in('following_id', userIds)

                const followingIds = new Set(followData?.map(f => f.following_id) || [])

                rawUsers = rawUsers.map(u => ({
                    ...u,
                    isFollowing: followingIds.has(u.id)
                }))
            }

            if (reset) {
                setUsers(rawUsers)
            } else {
                setUsers(prev => [...prev, ...rawUsers])
            }

            setHasMore(rawUsers.length === LIMIT)
            pageRef.current = currentPage + 1

        } catch (err: any) {
            console.error('Erro ao buscar:', err)
            if (!reset) {
                toast.error('Erro ao carregar mais')
            }
        } finally {
            isLoadingRef.current = false
            if (reset) {
                setLoading(false)
            } else {
                setLoadingMore(false)
            }
        }
    }, [profileId, type, currentUserId, LIMIT])

    // Carregar dados iniciais
    useEffect(() => {
        if (!initialLoadDoneRef.current) {
            initialLoadDoneRef.current = true
            fetchFollows(true)
        }
    }, [fetchFollows])

    // Filtrar usuários pela busca
    const displayedUsers = searchQuery
        ? users.filter(user => user.name.toLowerCase().includes(searchQuery.toLowerCase()))
        : users

    // Função para seguir/deixar de seguir
    const handleFollowToggle = async (user: FollowUser, e: React.MouseEvent) => {
        e.stopPropagation()

        if (!currentUserId) {
            toast.error('Faça login para seguir usuários')
            return
        }

        if (currentUserId === user.id) return

        try {
            if (user.isFollowing) {
                // Deixar de seguir
                const { error } = await supabase
                    .from('follows')
                    .delete()
                    .eq('follower_id', currentUserId)
                    .eq('following_id', user.id)

                if (error) throw error

                setUsers(prev => prev.map(u =>
                    u.id === user.id ? { ...u, isFollowing: false } : u
                ))
                toast.success(`Você deixou de seguir ${user.name}`)
            } else {
                // Seguir
                const { error } = await supabase
                    .from('follows')
                    .insert({
                        follower_id: currentUserId,
                        following_id: user.id
                    })

                if (error) throw error

                setUsers(prev => prev.map(u =>
                    u.id === user.id ? { ...u, isFollowing: true } : u
                ))
                toast.success(`Você começou a seguir ${user.name}`)
            }
        } catch (err: any) {
            toast.error('Erro ao seguir: ' + err.message)
        }
    }

    // Navegar para o perfil do usuário
    const handleUserClick = (user: FollowUser) => {
        onClose()
        router.push(`/${user.profileSlug}`)
    }

    // Tratar scroll infinito
    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const target = e.target as HTMLDivElement
        const bottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 50

        if (bottom && hasMore && !loadingMore && !loading && !isLoadingRef.current) {
            fetchFollows(false)
        }
    }

    return (
        <div
            className="fixed inset-0 z-[150] flex items-center justify-center p-4 animate-fade-in"
            style={{
                background: 'rgba(0, 0, 0, 0.8)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
            }}
            onClick={onClose}
        >
            <div
                className="w-full max-w-md rounded-3xl p-0 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col animate-slide-up"
                style={{
                    background: colors.surface,
                    border: `1px solid ${colors.border}`,
                    color: colors.textPrimary,
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-4 border-b flex-shrink-0" style={{ borderColor: colors.border }}>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={onClose}
                                className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-white/10 transition"
                                style={{ background: 'rgba(255, 255, 255, 0.08)' }}
                            >
                                <ArrowLeft size={18} style={{ color: colors.textSecondary }} />
                            </button>
                            <div>
                                <h2 className="text-lg font-black" style={{ color: colors.textPrimary }}>
                                    {type === 'followers' ? 'Seguidores' : 'Seguindo'}
                                </h2>
                                <p className="text-xs opacity-60" style={{ color: colors.textSecondary }}>
                                    {totalCount} {type === 'followers' ? 'seguidores' : 'seguindo'}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                                style={{
                                    background: GRADIENT,
                                    color: '#ffffff'
                                }}>
                                <Users size={16} />
                            </div>
                        </div>
                    </div>

                    {/* Search */}
                    <div className="mt-3 relative">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: colors.textSecondary }} />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder={`Buscar ${type === 'followers' ? 'seguidores' : 'seguindo'}...`}
                            className="w-full rounded-xl py-2.5 pl-9 pr-3 text-sm font-medium focus:outline-none transition"
                            style={{
                                background: 'rgba(255, 255, 255, 0.05)',
                                border: `1px solid ${colors.border}`,
                                color: colors.textPrimary,
                            }}
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center hover:bg-white/10 transition"
                            >
                                <X size={14} style={{ color: colors.textSecondary }} />
                            </button>
                        )}
                    </div>
                </div>

                {/* Lista de usuários */}
                <div
                    className="flex-1 overflow-y-auto p-2"
                    onScroll={handleScroll}
                >
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-3">
                            <Loader2 size={32} className="animate-spin" style={{ color: '#f97316' }} />
                            <p className="text-sm" style={{ color: colors.textSecondary }}>
                                Carregando {type === 'followers' ? 'seguidores' : 'seguindo'}...
                            </p>
                        </div>
                    ) : displayedUsers.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-3">
                            <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: 'rgba(255, 255, 255, 0.05)' }}>
                                <Users size={32} style={{ color: colors.textSecondary }} />
                            </div>
                            <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>
                                {searchQuery ? 'Nenhum resultado encontrado' :
                                    type === 'followers' ? 'Nenhum seguidor ainda' : 'Não está seguindo ninguém'}
                            </p>
                            <p className="text-xs" style={{ color: colors.textSecondary }}>
                                {searchQuery ? 'Tente outra busca' :
                                    type === 'followers' ? 'Compartilhe seu perfil para ganhar seguidores' : 'Comece a seguir outros usuários'}
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-1.5">
                            {displayedUsers.map((user) => {
                                const avatarUrl = getAvatarUrl(supabase, user.avatar_url)
                                const isCurrentUser = currentUserId === user.id

                                return (
                                    <div
                                        key={user.id}
                                        onClick={() => handleUserClick(user)}
                                        className="flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all hover:scale-[1.02]"
                                        style={{
                                            background: 'rgba(255, 255, 255, 0.08)',
                                            border: `1px solid ${colors.border}40`,
                                        }}
                                    >
                                        {/* Avatar */}
                                        <div className="flex-shrink-0">
                                            <div
                                                className="w-12 h-12 rounded-full p-[2px]"
                                                style={{ background: GRADIENT }}
                                            >
                                                <div className="w-full h-full rounded-full overflow-hidden bg-white flex items-center justify-center">
                                                    {avatarUrl ? (
                                                        <img
                                                            src={avatarUrl}
                                                            alt={user.name}
                                                            className="w-full h-full object-cover"
                                                        />
                                                    ) : (
                                                        <span className="text-xl font-black" style={{ color: '#f97316' }}>
                                                            {user.name?.charAt(0) || '?'}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Info */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <p className="text-sm font-bold truncate" style={{ color: colors.textPrimary }}>
                                                    {user.name}
                                                </p>
                                                {isCurrentUser && (
                                                    <span className="px-2 py-0.5 rounded-full text-[8px] font-bold uppercase"
                                                        style={{
                                                            background: '#f9731620',
                                                            color: '#f97316'
                                                        }}>
                                                        Você
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-[10px] opacity-60 truncate" style={{ color: colors.textSecondary }}>
                                                @{user.profileSlug}
                                            </p>
                                        </div>

                                        {/* Follow button */}
                                        {currentUserId && !isCurrentUser && (
                                            <button
                                                onClick={(e) => handleFollowToggle(user, e)}
                                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold transition-all hover:scale-105 flex-shrink-0"
                                                style={
                                                    user.isFollowing
                                                        ? {
                                                            background: 'transparent',
                                                            color: '#f97316',
                                                            border: `2px solid ${GRADIENT}`,
                                                        }
                                                        : {
                                                            background: GRADIENT,
                                                            color: '#ffffff',
                                                            boxShadow: '0 2px 8px rgba(249, 115, 22, 0.3)',
                                                            border: 'none',
                                                        }
                                                }
                                            >
                                                {user.isFollowing ? (
                                                    <>
                                                        <UserCheck size={12} />
                                                        Seguindo
                                                    </>
                                                ) : (
                                                    <>
                                                        <UserPlus size={12} />
                                                        Seguir
                                                    </>
                                                )}
                                            </button>
                                        )}
                                    </div>
                                )
                            })}

                            {/* Loading more */}
                            {loadingMore && (
                                <div className="flex justify-center py-4">
                                    <Loader2 size={24} className="animate-spin" style={{ color: '#f97316' }} />
                                </div>
                            )}

                            {/* End of list */}
                            {!hasMore && displayedUsers.length > 0 && (
                                <div className="text-center py-4">
                                    <p className="text-[10px] opacity-50" style={{ color: colors.textSecondary }}>
                                        {type === 'followers' ? 'Todos os seguidores carregados' : 'Todos os seguindo carregados'}
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Estilos globais para animações */}
            <style jsx global>{`
                @keyframes slideUp {
                    from { opacity: 0; transform: translateY(30px) scale(0.95); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
                .animate-slide-up {
                    animation: slideUp 0.3s ease-out forwards;
                }
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                .animate-fade-in {
                    animation: fadeIn 0.2s ease-out forwards;
                }
            `}</style>
        </div>
    )
}