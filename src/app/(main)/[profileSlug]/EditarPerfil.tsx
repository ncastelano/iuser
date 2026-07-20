// app/(main)/[profileSlug]/EditarPerfil.tsx

'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Save, CheckCircle, AlertCircle, ArrowLeft } from 'lucide-react'
import { useTheme } from '@/app/theme'

interface EditarPerfilProps {
    profile: any
    onUpdate: (updated: any) => void
    onClose: () => void // Tornar obrigatório
}

export default function EditarPerfil({ profile, onUpdate, onClose }: EditarPerfilProps) {
    const { colors } = useTheme()
    const [name, setName] = useState(profile.name || '')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [showSuccessDialog, setShowSuccessDialog] = useState(false)

    const handleSave = async () => {
        if (!name.trim()) {
            setError('O nome é obrigatório')
            return
        }

        setLoading(true)
        setError(null)

        try {
            const { error: updateError } = await supabase
                .from('profiles')
                .update({ name: name.trim() })
                .eq('id', profile.id)

            if (updateError) throw updateError

            // Atualizar o profile local
            onUpdate({ ...profile, name: name.trim() })

            // Mostrar diálogo de sucesso
            setShowSuccessDialog(true)

        } catch (err: any) {
            console.error('Erro ao salvar:', err)
            setError(err.message || 'Erro ao salvar alterações')
        } finally {
            setLoading(false)
        }
    }

    const handleCloseSuccessAndExit = () => {
        setShowSuccessDialog(false)
        onClose() // Fecha o modo edição e volta para o perfil
    }

    const handleCancel = () => {
        onClose() // Volta para o perfil sem salvar
    }

    return (
        <>
            <div className="max-w-2xl mx-auto">
                <div className="rounded-3xl p-8 space-y-6" style={{
                    background: colors.surface,
                    border: `1px solid ${colors.border}`,
                    backdropFilter: 'blur(12px)'
                }}>
                    {/* Cabeçalho */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={handleCancel}
                                className="p-2 rounded-xl hover:bg-white/10 transition"
                                style={{ color: colors.textSecondary }}
                            >
                                <ArrowLeft size={20} />
                            </button>
                            <h2 className="text-2xl font-black" style={{ color: colors.textPrimary }}>
                                Editar Perfil
                            </h2>
                        </div>
                    </div>

                    {/* Mensagem de erro */}
                    {error && (
                        <div className="p-4 rounded-xl flex items-center gap-3"
                            style={{ background: '#ef444410', border: '1px solid #ef444430' }}>
                            <AlertCircle size={20} style={{ color: '#ef4444' }} />
                            <p className="text-sm font-bold" style={{ color: '#ef4444' }}>{error}</p>
                        </div>
                    )}

                    <div className="space-y-6">
                        {/* Nome */}
                        <div>
                            <label className="text-xs font-bold uppercase tracking-wider mb-2 block"
                                style={{ color: colors.textSecondary }}>
                                Nome *
                            </label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full rounded-xl py-4 px-5 text-base font-bold focus:outline-none focus:ring-2 transition-all"
                                style={{
                                    background: colors.background,
                                    border: `1px solid ${colors.border}`,
                                    color: colors.textPrimary,
                                }}
                                placeholder="Seu nome completo"
                                autoFocus
                            />
                        </div>

                        {/* Preview do perfil */}
                        <div className="rounded-2xl p-4 flex items-center gap-4"
                            style={{ background: `${colors.accent}10`, border: `1px solid ${colors.border}` }}>
                            <div className="w-16 h-16 rounded-full overflow-hidden flex-shrink-0"
                                style={{ background: colors.accentLight }}>
                                {profile.avatar_url ? (
                                    <img
                                        src={profile.avatar_url.startsWith('http')
                                            ? profile.avatar_url
                                            : supabase.storage.from('avatars').getPublicUrl(profile.avatar_url).data.publicUrl
                                        }
                                        className="w-full h-full object-cover"
                                        alt=""
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-2xl font-black"
                                        style={{ color: colors.accent }}>
                                        {name.charAt(0) || profile.name?.charAt(0)}
                                    </div>
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold" style={{ color: colors.textSecondary }}>
                                    Visualização do nome:
                                </p>
                                <p className="text-xl font-black truncate" style={{ color: colors.textPrimary }}>
                                    {name || 'Seu nome aparecerá aqui'}
                                </p>
                                <p className="text-xs font-bold mt-1" style={{ color: colors.accent }}>
                                    @{profile.profileSlug}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Botões */}
                    <div className="flex gap-3 pt-4">
                        <button
                            onClick={handleCancel}
                            className="flex-1 py-4 rounded-xl font-bold text-sm uppercase tracking-wider hover:bg-white/5 transition"
                            style={{
                                background: 'transparent',
                                border: `1px solid ${colors.border}`,
                                color: colors.textSecondary,
                            }}
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={loading || !name.trim()}
                            className="flex-1 py-4 rounded-xl font-black text-sm uppercase tracking-wider shadow-lg hover:scale-105 transition-all disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-2"
                            style={{
                                background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentLight})`,
                                color: colors.accentText,
                            }}
                        >
                            {loading ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    Salvando...
                                </>
                            ) : (
                                <>
                                    <Save size={18} />
                                    Salvar Alterações
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {/* Diálogo de Sucesso */}
            {showSuccessDialog && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
                    <div className="w-full max-w-md rounded-3xl p-8 shadow-2xl space-y-6"
                        style={{
                            background: colors.surface,
                            border: `1px solid ${colors.border}`
                        }}>
                        {/* Ícone de sucesso */}
                        <div className="flex justify-center">
                            <div className="w-20 h-20 rounded-full flex items-center justify-center"
                                style={{ background: '#10b98120' }}>
                                <CheckCircle size={48} style={{ color: '#10b981' }} />
                            </div>
                        </div>

                        {/* Mensagem */}
                        <div className="text-center space-y-2">
                            <h3 className="text-2xl font-black" style={{ color: colors.textPrimary }}>
                                Perfil Atualizado!
                            </h3>
                            <p className="text-sm font-medium" style={{ color: colors.textSecondary }}>
                                Suas alterações foram salvas com sucesso.
                            </p>
                        </div>

                        {/* Preview rápido */}
                        <div className="rounded-2xl p-4 flex items-center gap-4"
                            style={{ background: `${colors.accent}10` }}>
                            <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0"
                                style={{ background: colors.accentLight }}>
                                {profile.avatar_url ? (
                                    <img
                                        src={profile.avatar_url.startsWith('http')
                                            ? profile.avatar_url
                                            : supabase.storage.from('avatars').getPublicUrl(profile.avatar_url).data.publicUrl
                                        }
                                        className="w-full h-full object-cover"
                                        alt=""
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-xl font-black"
                                        style={{ color: colors.accent }}>
                                        {name.charAt(0)}
                                    </div>
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-lg font-black truncate" style={{ color: colors.textPrimary }}>
                                    {name}
                                </p>
                                <p className="text-xs font-bold" style={{ color: colors.accent }}>
                                    @{profile.profileSlug}
                                </p>
                            </div>
                        </div>

                        {/* Botão */}
                        <button
                            onClick={handleCloseSuccessAndExit}
                            className="w-full py-4 rounded-xl font-black uppercase text-sm tracking-widest shadow-lg hover:scale-105 transition-transform"
                            style={{
                                background: `linear-gradient(135deg, #10b981, #059669)`,
                                color: '#fff',
                            }}
                        >
                            <ArrowLeft size={18} className="inline mr-2" />
                            Voltar para o Perfil
                        </button>
                    </div>
                </div>
            )}
        </>
    )
}