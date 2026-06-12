'use client'

import { useState, useRef } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Camera, Save, X } from 'lucide-react'

interface EditarPerfilProps {
    profile: any
    onUpdate: (updatedProfile: any) => void
}

export default function EditarPerfil({ profile, onUpdate }: EditarPerfilProps) {
    const [name, setName] = useState(profile.name || '')
    const [profileSlug, setProfileSlug] = useState(profile.profileSlug || '')
    const [bio, setBio] = useState(profile.bio || '')
    const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url || '')
    const [uploading, setUploading] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        setUploading(true)
        try {
            const fileExt = file.name.split('.').pop()
            const fileName = `${profile.id}-${Date.now()}.${fileExt}`
            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(fileName, file, { upsert: true })
            if (uploadError) throw uploadError
            const { data } = supabase.storage.from('avatars').getPublicUrl(fileName)
            setAvatarUrl(data.publicUrl)
        } catch (err: any) {
            alert('Erro ao enviar foto: ' + err.message)
        } finally {
            setUploading(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    const handleSave = async () => {
        if (!name.trim() || !profileSlug.trim()) {
            alert('Nome e slug são obrigatórios.')
            return
        }
        const updates = {
            name: name.trim(),
            profileSlug: profileSlug.trim(),
            bio: bio.trim(),
            avatar_url: avatarUrl,
        }
        const { error } = await supabase
            .from('profiles')
            .update(updates)
            .eq('id', profile.id)
        if (error) {
            alert('Erro ao salvar: ' + error.message)
            return
        }
        // Atualiza o estado no componente pai
        onUpdate({ ...profile, ...updates })
    }

    return (
        <div className="max-w-xl mx-auto mt-8 space-y-8">
            <h2 className="text-2xl font-black italic text-white text-center">Editar Perfil</h2>

            {/* Avatar */}
            <div className="flex flex-col items-center gap-4">
                <div className="relative group">
                    <div className="w-28 h-28 rounded-full overflow-hidden border-2 border-white/20">
                        {avatarUrl ? (
                            <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-2xl font-black text-white/30 bg-white/10">
                                {name?.charAt(0) || '?'}
                            </div>
                        )}
                    </div>
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        className="absolute bottom-0 right-0 w-8 h-8 rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-transform disabled:opacity-50"
                        style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)', color: '#fff' }}
                    >
                        {uploading ? (
                            <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                            <Camera size={14} />
                        )}
                    </button>
                </div>
                <input type="file" ref={fileInputRef} onChange={handleAvatarUpload} accept="image/*" style={{ display: 'none' }} />
            </div>

            {/* Campos */}
            <div className="space-y-4">
                <div>
                    <label className="block text-xs font-black uppercase text-white/60 mb-1">Nome</label>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full rounded-xl py-3 px-4 text-sm font-bold bg-white/10 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                </div>
                <div>
                    <label className="block text-xs font-black uppercase text-white/60 mb-1">Slug (URL)</label>
                    <input
                        type="text"
                        value={profileSlug}
                        onChange={(e) => setProfileSlug(e.target.value)}
                        className="w-full rounded-xl py-3 px-4 text-sm font-bold bg-white/10 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    <p className="text-[10px] text-white/40 mt-1">Ex: /{profileSlug || 'seu-slug'}</p>
                </div>
                <div>
                    <label className="block text-xs font-black uppercase text-white/60 mb-1">Bio</label>
                    <textarea
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        rows={3}
                        className="w-full rounded-xl py-3 px-4 text-sm font-bold bg-white/10 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                    />
                </div>
            </div>

            {/* Botão Salvar */}
            <button
                onClick={handleSave}
                className="w-full py-4 rounded-xl font-black uppercase text-sm tracking-widest text-white shadow-lg hover:scale-105 transition"
                style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)' }}
            >
                <Save size={18} className="inline mr-2" />
                Salvar Alterações
            </button>
        </div>
    )
}