// src/components/StoreDashboard/ProductAddonsManager.tsx
//
// Lista de adicionais (ingredientes extras) de um produto — só aparece
// quando a loja liga "permite adicionais" nesse produto. Cada adicional
// tem nome e preço próprios, definidos pela loja.
'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Plus, Trash2, EyeOff, Eye } from 'lucide-react'
import { Spinner } from '@/components/Spinner'

interface Addon {
    id: string
    name: string
    price: number
    is_active: boolean
}

interface ProductAddonsManagerProps {
    productId: string
    storeId: string
    colors: any
}

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

export default function ProductAddonsManager({ productId, storeId, colors }: ProductAddonsManagerProps) {
    const [addons, setAddons] = useState<Addon[]>([])
    const [loading, setLoading] = useState(true)
    const [newName, setNewName] = useState('')
    const [newPrice, setNewPrice] = useState('')
    const [saving, setSaving] = useState(false)
    // Adicionais já cadastrados na loja (em qualquer produto), prontos pra reaproveitar.
    const [library, setLibrary] = useState<{ id: string; name: string; price: number }[]>([])

    const load = async () => {
        setLoading(true)
        const { data } = await supabase
            .from('product_addons')
            .select('id, name, price, is_active')
            .eq('product_id', productId)
            .order('sort_order', { ascending: true })
        setAddons((data || []) as Addon[])
        setLoading(false)
    }

    const loadLibrary = async () => {
        const { data } = await supabase
            .from('store_addon_library')
            .select('id, name, price')
            .eq('store_id', storeId)
            .order('name', { ascending: true })
        setLibrary((data || []) as { id: string; name: string; price: number }[])
    }

    useEffect(() => { load() }, [productId])
    useEffect(() => { loadLibrary() }, [storeId])

    // Guarda (ou atualiza o preço de) um adicional na biblioteca da loja.
    const saveToLibrary = async (name: string, price: number) => {
        const existing = library.find((l) => l.name.trim().toLowerCase() === name.trim().toLowerCase())
        if (existing) {
            if (Number(existing.price) !== price) {
                await supabase.from('store_addon_library').update({ price }).eq('id', existing.id)
            }
        } else {
            await supabase.from('store_addon_library').insert({ store_id: storeId, name, price })
        }
        loadLibrary()
    }

    const addFromLibrary = async (item: { name: string; price: number }) => {
        const { error } = await supabase.from('product_addons').insert({
            product_id: productId,
            store_id: storeId,
            name: item.name,
            price: item.price,
            sort_order: addons.length,
        })
        if (error) {
            toast.error('Erro ao adicionar: ' + error.message)
            return
        }
        load()
    }

    const removeFromLibrary = async (id: string) => {
        const { error } = await supabase.from('store_addon_library').delete().eq('id', id)
        if (error) {
            toast.error('Erro ao remover: ' + error.message)
            return
        }
        setLibrary((prev) => prev.filter((l) => l.id !== id))
    }

    const handleAdd = async () => {
        if (!newName.trim()) {
            toast.error('Dê um nome ao adicional')
            return
        }
        setSaving(true)
        const price = parseFloat(newPrice.replace(',', '.')) || 0
        const { error } = await supabase.from('product_addons').insert({
            product_id: productId,
            store_id: storeId,
            name: newName.trim(),
            price,
            sort_order: addons.length,
        })
        if (!error) await saveToLibrary(newName.trim(), price)
        setSaving(false)
        if (error) {
            toast.error('Erro ao adicionar: ' + error.message)
            return
        }
        setNewName('')
        setNewPrice('')
        load()
    }

    const handleDelete = async (id: string) => {
        const { error } = await supabase.from('product_addons').delete().eq('id', id)
        if (error) {
            toast.error('Erro ao remover: ' + error.message)
            return
        }
        setAddons((prev) => prev.filter((a) => a.id !== id))
    }

    const handleToggleActive = async (addon: Addon) => {
        const { error } = await supabase.from('product_addons').update({ is_active: !addon.is_active }).eq('id', addon.id)
        if (error) {
            toast.error('Erro ao atualizar: ' + error.message)
            return
        }
        setAddons((prev) => prev.map((a) => (a.id === addon.id ? { ...a, is_active: !a.is_active } : a)))
    }

    const formatPrice = (price: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price)

    return (
        <div className="space-y-3">
            {loading ? (
                <div className="flex justify-center py-4">
                    <Spinner size={18} color={colors.accent} />
                </div>
            ) : addons.length === 0 ? (
                <p className="text-xs" style={{ color: colors.textSecondary }}>
                    Nenhum adicional cadastrado ainda.
                </p>
            ) : (
                <div className="space-y-2">
                    {addons.map((addon) => (
                        <div
                            key={addon.id}
                            className="flex items-center gap-2 p-2.5 rounded-xl"
                            style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${colors.border}`, opacity: addon.is_active ? 1 : 0.5 }}
                        >
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold truncate" style={{ color: colors.textPrimary }}>
                                    {addon.name}
                                </p>
                                <p className="text-xs font-bold" style={{ color: '#f97316' }}>
                                    {formatPrice(addon.price)}
                                </p>
                            </div>
                            <button
                                onClick={() => handleToggleActive(addon)}
                                title={addon.is_active ? 'Desativar' : 'Ativar'}
                                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                                style={{ color: colors.textSecondary }}
                            >
                                {addon.is_active ? <Eye size={16} /> : <EyeOff size={16} />}
                            </button>
                            <button
                                onClick={() => handleDelete(addon.id)}
                                title="Excluir"
                                className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors"
                                style={{ color: '#ef4444' }}
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Salvos na loja: reaproveita em outros produtos sem digitar de novo */}
            {(() => {
                const onProduct = new Set(addons.map((a) => a.name.trim().toLowerCase()))
                const available = library.filter((l) => !onProduct.has(l.name.trim().toLowerCase()))
                if (available.length === 0) return null
                return (
                    <div className="space-y-1.5">
                        <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                            Salvos na sua loja — toque para oferecer aqui
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {available.map((item) => (
                                <div
                                    key={item.id}
                                    className="flex items-center rounded-full overflow-hidden text-xs font-bold"
                                    style={{ border: `1px solid ${colors.border}`, background: 'rgba(255,255,255,0.05)' }}
                                >
                                    <button
                                        onClick={() => addFromLibrary(item)}
                                        className="pl-3 pr-2 py-1.5 flex items-center gap-1 hover:bg-white/10 transition-colors"
                                        style={{ color: colors.textPrimary }}
                                    >
                                        <Plus size={12} style={{ color: '#f97316' }} />
                                        {item.name} · {formatPrice(Number(item.price))}
                                    </button>
                                    <button
                                        onClick={() => removeFromLibrary(item.id)}
                                        title="Tirar dos salvos"
                                        className="px-2 py-1.5 hover:bg-red-500/10 transition-colors"
                                        style={{ color: '#ef4444' }}
                                    >
                                        ×
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )
            })()}

            <div className="flex gap-2">
                <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Ex: Bacon extra"
                    className="flex-1 px-3 py-2 rounded-lg border text-sm focus:outline-none"
                    style={{ background: colors.surface, borderColor: colors.border, color: colors.textPrimary }}
                />
                <input
                    type="text"
                    inputMode="decimal"
                    value={newPrice}
                    onChange={(e) => setNewPrice(e.target.value.replace(/[^0-9,.]/g, ''))}
                    placeholder="Preço"
                    className="w-24 px-3 py-2 rounded-lg border text-sm focus:outline-none"
                    style={{ background: colors.surface, borderColor: colors.border, color: colors.textPrimary }}
                />
                <button
                    onClick={handleAdd}
                    disabled={saving}
                    className="px-3 py-2 rounded-lg font-bold text-sm flex items-center gap-1 transition-all hover:scale-105 disabled:opacity-50"
                    style={{ background: GRADIENT, color: '#ffffff' }}
                >
                    {saving ? <Spinner size={14} /> : <Plus size={16} />}
                </button>
            </div>
        </div>
    )
}
