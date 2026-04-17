'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { 
    Heart, 
    MessageCircle, 
    Share2, 
    MoreHorizontal,
    Send,
    Loader2,
    Trash2,
    MoreVertical
} from 'lucide-react'
import Link from 'next/link'

interface Profile {
    name: string
    profileSlug: string
    avatar_url: string | null
}

interface Comment {
    id: string
    content: string
    created_at: string
    profile_id: string
    profiles: Profile
}

interface MuralPostProps {
    post: {
        id: string
        content: string
        image_url: string | null
        created_at: string
        profile_id: string
        profiles: Profile
    }
    currentUserId?: string | null
    onDelete?: (postId: string) => void
}

export function MuralPost({ post, currentUserId, onDelete }: MuralPostProps) {
    const supabase = createClient()
    const [liked, setLiked] = useState(false)
    const [likesCount, setLikesCount] = useState(0)
    const [comments, setComments] = useState<Comment[]>([])
    const [commentsCount, setCommentsCount] = useState(0)
    const [showComments, setShowComments] = useState(false)
    const [newComment, setNewComment] = useState('')
    const [submittingComment, setSubmittingComment] = useState(false)
    const [loadingComments, setLoadingComments] = useState(false)

    useEffect(() => {
        fetchInteractionCounts()
        if (currentUserId) {
            checkIfLiked()
        }
    }, [post.id, currentUserId])

    const fetchInteractionCounts = async () => {
        const { count: likes } = await supabase
            .from('mural_likes')
            .select('*', { count: 'exact', head: true })
            .eq('post_id', post.id)
        
        const { count: comments } = await supabase
            .from('mural_comments')
            .select('*', { count: 'exact', head: true })
            .eq('post_id', post.id)

        setLikesCount(likes || 0)
        setCommentsCount(comments || 0)
    }

    const checkIfLiked = async () => {
        const { data } = await supabase
            .from('mural_likes')
            .select('*')
            .eq('post_id', post.id)
            .eq('profile_id', currentUserId)
            .single()
        
        setLiked(!!data)
    }

    const handleLike = async () => {
        if (!currentUserId) return

        if (liked) {
            setLiked(false)
            setLikesCount(prev => prev - 1)
            await supabase.from('mural_likes').delete().eq('post_id', post.id).eq('profile_id', currentUserId)
        } else {
            setLiked(true)
            setLikesCount(prev => prev + 1)
            await supabase.from('mural_likes').insert({ post_id: post.id, profile_id: currentUserId })
        }
    }

    const fetchComments = async () => {
        setLoadingComments(true)
        const { data, error } = await supabase
            .from('mural_comments')
            .select('*, profiles(name, profileSlug, avatar_url)')
            .eq('post_id', post.id)
            .order('created_at', { ascending: true })
        
        if (!error && data) {
            setComments(data)
        }
        setLoadingComments(false)
    }

    const handleToggleComments = () => {
        const nextState = !showComments
        setShowComments(nextState)
        if (nextState) {
            fetchComments()
        }
    }

    const handleSubmitComment = async () => {
        if (!newComment.trim() || !currentUserId) return
        setSubmittingComment(true)

        const { data, error } = await supabase
            .from('mural_comments')
            .insert({
                post_id: post.id,
                profile_id: currentUserId,
                content: newComment
            })
            .select('*, profiles(name, profileSlug, avatar_url)')
            .single()

        if (!error && data) {
            setComments([...comments, data])
            setCommentsCount(prev => prev + 1)
            setNewComment('')
        }
        setSubmittingComment(false)
    }

    const getAvatarUrl = (path: string | null) => {
        if (!path) return null
        if (path.startsWith('http')) return path
        return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl
    }

    const getImageUrl = (path: string | null) => {
        if (!path) return null
        return supabase.storage.from('mural-images').getPublicUrl(path).data.publicUrl
    }

    return (
        <article className="bg-card/40 backdrop-blur-md border border-border rounded-[48px] overflow-hidden shadow-2xl group hover:border-primary/20 transition-all">
            <div className="p-8 space-y-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href={`/${post.profiles?.profileSlug}`} className="w-14 h-14 rounded-[20px] overflow-hidden bg-background border border-border hover:scale-105 transition-transform">
                            {post.profiles?.avatar_url ? (
                                <img src={getAvatarUrl(post.profiles.avatar_url)!} className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-muted-foreground/20 text-2xl font-black italic">{post.profiles?.name?.charAt(0)}</div>
                            )}
                        </Link>
                        <div>
                            <Link href={`/${post.profiles?.profileSlug}`} className="text-xl font-black italic uppercase tracking-tighter text-white hover:text-primary transition-colors leading-none">{post.profiles?.name}</Link>
                            <p className="text-[10px] font-black uppercase tracking-widest text-primary mt-1">/{post.profiles?.profileSlug}</p>
                        </div>
                    </div>
                    {currentUserId === post.profile_id && onDelete && (
                        <button onClick={() => onDelete(post.id)} className="w-10 h-10 flex items-center justify-center rounded-2xl bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all">
                            <Trash2 className="w-5 h-5" />
                        </button>
                    )}
                </div>

                {post.content && (
                    <p className="text-lg font-bold italic text-foreground/90 whitespace-pre-wrap leading-relaxed px-2">
                        {post.content}
                    </p>
                )}

                {post.image_url && (
                    <div className="rounded-[36px] overflow-hidden border border-border bg-background shadow-2xl">
                        <img src={getImageUrl(post.image_url)!} className="w-full max-h-[600px] object-cover" />
                    </div>
                )}

                <div className="pt-6 border-t border-border flex items-center justify-between">
                    <div className="flex items-center gap-6">
                        <button 
                            onClick={handleLike}
                            className={`flex items-center gap-2 group/btn transition-colors ${liked ? 'text-red-500' : 'text-muted-foreground'}`}
                        >
                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${liked ? 'bg-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.4)]' : 'bg-secondary/30 group-hover/btn:bg-red-500/10 group-hover/btn:text-red-500'}`}>
                                <Heart className={`w-6 h-6 ${liked ? 'fill-current' : ''}`} />
                            </div>
                            <span className="text-xs font-black italic">{likesCount}</span>
                        </button>
                        <button 
                            onClick={handleToggleComments}
                            className={`flex items-center gap-2 group/btn transition-colors ${showComments ? 'text-primary' : 'text-muted-foreground'}`}
                        >
                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${showComments ? 'bg-primary text-background shadow-[0_0_20px_rgba(var(--primary),0.4)]' : 'bg-secondary/30 group-hover/btn:bg-primary/10 group-hover/btn:text-primary'}`}>
                                <MessageCircle className="w-6 h-6" />
                            </div>
                            <span className="text-xs font-black italic">{commentsCount}</span>
                        </button>
                    </div>
                    <button className="w-12 h-12 rounded-2xl bg-secondary/30 flex items-center justify-center hover:bg-foreground hover:text-background transition-all">
                        <Share2 className="w-5 h-5" />
                    </button>
                </div>

                {/* Comments Section */}
                {showComments && (
                    <div className="pt-6 mt-6 border-t border-border space-y-6 animate-in slide-in-from-top-4 duration-300">
                        <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                            {loadingComments ? (
                                <div className="flex justify-center py-4">
                                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                                </div>
                            ) : comments.length === 0 ? (
                                <p className="text-center py-4 text-xs font-black uppercase tracking-widest text-neutral-600 italic">Nenhum comentário ainda.</p>
                            ) : (
                                comments.map(comment => (
                                    <div key={comment.id} className="flex gap-3">
                                        <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0 border border-border">
                                            {comment.profiles?.avatar_url ? (
                                                <img src={getAvatarUrl(comment.profiles.avatar_url)!} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-[10px] font-black italic bg-neutral-900">{comment.profiles?.name?.charAt(0)}</div>
                                            )}
                                        </div>
                                        <div className="flex-1 bg-white/5 p-3 rounded-2xl border border-white/5">
                                            <p className="text-[10px] font-black uppercase text-primary tracking-widest mb-1">{comment.profiles?.name}</p>
                                            <p className="text-sm font-medium text-foreground leading-relaxed">{comment.content}</p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        {currentUserId && (
                            <div className="flex gap-3 pt-4 border-t border-border">
                                <div className="flex-1 relative">
                                    <input 
                                        value={newComment}
                                        onChange={(e) => setNewComment(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleSubmitComment()}
                                        placeholder="Escreva um comentário..."
                                        className="w-full bg-secondary/50 border border-border rounded-xl px-4 py-3 text-sm font-medium outline-none focus:border-primary/50 transition-all"
                                    />
                                    <button 
                                        onClick={handleSubmitComment}
                                        disabled={submittingComment || !newComment.trim()}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg bg-foreground text-background flex items-center justify-center hover:opacity-90 disabled:opacity-30 transition-all"
                                    >
                                        {submittingComment ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </article>
    )
}
