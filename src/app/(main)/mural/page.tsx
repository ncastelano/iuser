'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { 
    Users, 
    Image as ImageIcon, 
    Send, 
    MoreHorizontal, 
    Heart, 
    MessageCircle, 
    Share2, 
    Camera,
    X,
    Loader2,
    Globe
} from 'lucide-react'
import Link from 'next/link'

import { MuralPost } from '@/components/MuralPost'

type MuralFilter = 'mundo' | 'cidade' | 'sigo'

export default function MuralPage() {
    const supabase = createClient()
    const router = useRouter()
    
    const [posts, setPosts] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [profile, setProfile] = useState<any>(null)
    const [currentUser, setCurrentUser] = useState<any>(null)
    const [content, setContent] = useState('')
    const [uploading, setUploading] = useState(false)
    const [selectedFile, setSelectedFile] = useState<File | null>(null)
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Filtering
    const [muralFilter, setMuralFilter] = useState<MuralFilter>('mundo')
    const [followingIds, setFollowingIds] = useState<string[]>([])
    const [loadingFilter, setLoadingFilter] = useState(false)

    useEffect(() => {
        const fetchMuralData = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            setCurrentUser(user)

            if (user) {
                const { data: profileData } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', user.id)
                    .single()
                setProfile(profileData)
            }

            const { data: postsData, error } = await supabase
                .from('mural_posts')
                .select(`
                    *,
                    profiles (
                        name,
                        profileSlug,
                        avatar_url,
                        address
                    )
                `)
                .order('created_at', { ascending: false })

            if (!error && postsData) {
                setPosts(postsData)
            }

            // Fetch following list
            if (user) {
                const { data: followingData } = await supabase
                    .from('follows')
                    .select('following_id')
                    .eq('follower_id', user.id)
                setFollowingIds((followingData || []).map(f => f.following_id))
            }

            setLoading(false)
        }

        fetchMuralData()
    }, [])

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) {
            setSelectedFile(file)
            setPreviewUrl(URL.createObjectURL(file))
        }
    }

    const handlePost = async () => {
        if (!content.trim() && !selectedFile) return
        if (!profile) return

        setUploading(true)
        try {
            let imageUrl = null

            if (selectedFile) {
                const fileExt = selectedFile.name.split('.').pop()
                const filePath = `mural/${profile.id}/${Date.now()}.${fileExt}`
                const { error: uploadError } = await supabase.storage
                    .from('mural-images')
                    .upload(filePath, selectedFile)
                
                if (uploadError) throw uploadError
                imageUrl = filePath
            }

            const { data: newPost, error } = await supabase
                .from('mural_posts')
                .insert({
                    profile_id: profile.id,
                    content,
                    image_url: imageUrl
                })
                .select(`
                    *,
                    profiles (
                        name,
                        profileSlug,
                        avatar_url,
                        address
                    )
                `)
                .single()

            if (error) throw error

            setPosts([newPost, ...posts])
            setContent('')
            setSelectedFile(null)
            setPreviewUrl(null)
        } catch (error) {
            console.error('Error posting to mural:', error)
            alert('Erro ao publicar no mural')
        } finally {
            setUploading(false)
        }
    }

    const handleDeletePost = async (postId: string) => {
        const { error } = await supabase.from('mural_posts').delete().eq('id', postId)
        if (!error) {
            setPosts(posts.filter(p => p.id !== postId))
        }
    }

    const getAvatarUrl = (path: string | null) => {
        if (!path) return null
        if (path.startsWith('http')) return path
        return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl
    }

    const getFilteredPosts = () => {
        if (muralFilter === 'mundo') return posts

        if (muralFilter === 'cidade') {
            const userCity = profile?.address?.split(',')[2]?.split('-')[0]?.trim()?.toLowerCase()
            if (!userCity) return []
            
            return posts.filter(post => {
                const postCity = post.profiles?.address?.split(',')[2]?.split('-')[0]?.trim()?.toLowerCase()
                return postCity === userCity
            })
        }

        if (muralFilter === 'sigo') {
            return posts.filter(post => followingIds.includes(post.profile_id))
        }

        return []
    }

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground italic">Carregando Mural...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-background pb-32">
            <div className="max-w-2xl mx-auto px-4 pt-10 space-y-12">
                {/* Header Section */}
                <header className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 bg-foreground text-background rounded-2xl flex items-center justify-center shadow-2xl rotate-3">
                            <Globe className="w-8 h-8" />
                        </div>
                        <div>
                            <h1 className="text-4xl font-black italic uppercase tracking-tighter text-foreground leading-none">Mural<span className="text-primary">.</span></h1>
                            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-muted-foreground mt-1">Conectando o ecossistema iUser</p>
                        </div>
                    </div>
                </header>

                {/* Create Post Section */}
                {profile && (
                    <div className="bg-card/40 backdrop-blur-md border border-border p-6 rounded-[40px] shadow-2xl space-y-6">
                        <div className="flex gap-4">
                            <div className="w-12 h-12 rounded-2xl overflow-hidden bg-background flex-shrink-0 border border-border">
                                {profile.avatar_url ? (
                                    <img src={getAvatarUrl(profile.avatar_url)!} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-muted-foreground/20 text-xl font-black italic">{profile.name?.charAt(0)}</div>
                                )}
                            </div>
                            <textarea
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                placeholder={`O que está acontecendo agora, ${profile.name?.split(' ')[0]}?`}
                                className="flex-1 bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground/30 font-bold italic text-lg p-2 resize-none min-h-[100px]"
                            />
                        </div>

                        {previewUrl && (
                            <div className="relative rounded-[32px] overflow-hidden border border-border bg-background group">
                                <img src={previewUrl} className="w-full max-h-[400px] object-cover" />
                                <button 
                                    onClick={() => { setSelectedFile(null); setPreviewUrl(null) }}
                                    className="absolute top-4 right-4 w-10 h-10 bg-background/80 backdrop-blur-md text-foreground rounded-2xl flex items-center justify-center border border-border hover:bg-foreground hover:text-background transition-all"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        )}

                        <div className="flex items-center justify-between pt-4 border-t border-border">
                            <button 
                                onClick={() => fileInputRef.current?.click()}
                                className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-secondary/50 text-muted-foreground hover:text-foreground transition-all group"
                            >
                                <Camera className="w-5 h-5 group-hover:scale-110 transition-transform" />
                                <span className="text-[10px] font-black uppercase tracking-widest">Foto</span>
                            </button>
                            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />

                            <button 
                                onClick={handlePost}
                                disabled={uploading || (!content.trim() && !selectedFile)}
                                className="px-10 py-4 bg-foreground text-background rounded-2xl font-black uppercase text-[10px] tracking-widest hover:opacity-90 transition-all flex items-center gap-2 disabled:opacity-30"
                            >
                                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Postar <Send className="w-4 h-4" /></>}
                            </button>
                        </div>
                    </div>
                )}

                {/* Feed Filtering */}
                <div className="flex justify-center flex-wrap gap-4">
                    {(['mundo', 'cidade', 'sigo'] as MuralFilter[]).map(f => {
                        let label = f === 'cidade'
                            ? (profile?.address?.split(',')[2]?.trim() || 'Cidade')
                            : f.charAt(0).toUpperCase() + f.slice(1)

                        return (
                            <button
                                key={f}
                                onClick={() => setMuralFilter(f)}
                                className={`px-8 py-3 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${muralFilter === f ? 'bg-primary text-background shadow-lg shadow-primary/20 scale-105' : 'bg-card/40 border border-border text-muted-foreground hover:text-foreground'}`}
                            >
                                {label}
                            </button>
                        )
                    })}
                </div>

                {/* Feed Section */}
                <div className="space-y-8">
                    {getFilteredPosts().length === 0 ? (
                        <div className="py-24 text-center rounded-[40px] border border-dashed border-border bg-card/10">
                            <Users className="w-16 h-16 text-muted-foreground/20 mx-auto mb-6" />
                            <p className="text-muted-foreground text-xl font-bold uppercase italic tracking-wider">
                                {muralFilter === 'mundo' ? 'O Mural está vazio.' : 'Nada encontrado neste filtro.'}
                            </p>
                        </div>
                    ) : (
                        getFilteredPosts().map((post) => (
                            <MuralPost 
                                key={post.id} 
                                post={post} 
                                currentUserId={currentUser?.id} 
                                onDelete={handleDeletePost}
                            />
                        ))
                    )}
                </div>
            </div>
        </div>
    )
}
