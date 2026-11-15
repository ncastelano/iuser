'use client'

// Os atalhos de configuração da loja (3.0), UMA lista só usada em dois lugares: a grade "Gerenciar a loja" do painel e a página
// "Editar loja" (agrupada). Cada um tem a SUA cor e o ESTADO real (verde = ligado, cinza = desligado, vermelho = falta algo) e uma
// chave `k` que vira `/editar-loja/<slug>?secao=<k>` — abre direto na folha/página daquela coisa (mesmo desenho do laboratório /painel-teste).
import type { ReactNode } from 'react'
import { CalendarDays, Crown, Megaphone, Package, Store, Tag, Timer, Truck, Users, Wallet, Zap, CalendarCheck } from 'lucide-react'

export type Est = 'on' | 'off' | 'warn'
export type SecaoKey = 'dados' | 'catalogo' | 'promocoes' | 'entrega' | 'pagamento' | 'horarios' | 'agenda' | 'regras' | 'equipe' | 'publicacoes' | 'clube' | 'whatsapp'
export interface ItemGerenciar { k: SecaoKey; t: string; ic: ReactNode; cor: string; texto: string; est: Est }

export const SELO: Record<Est, string> = { on: '#16a34a', off: '#9ca3af', warn: '#ef4444' }
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/** os atalhos com o estado de agora (puro: só lê a linha da loja) */
export function gerenciarItens(store: any, hasServices: boolean, opts: { whatsapp?: boolean; agendaNoPainel?: boolean } = {}): ItemGerenciar[] {
    const horarios = !!store.business_hours && Object.keys(store.business_hours).length > 0
    const itens: ItemGerenciar[] = [
        { k: 'dados', t: 'Dados da loja', ic: <Store size={19} />, cor: '#6366f1', texto: store.description ? 'logo, links, modelo' : 'falta a descrição', est: store.description ? 'on' : 'warn' },
        { k: 'catalogo', t: 'Catálogo', ic: <Package size={19} />, cor: '#3b82f6', texto: hasServices ? 'produtos, digitais e serviços' : 'produtos e digitais', est: 'on' },
        { k: 'promocoes', t: 'Promoções', ic: <Tag size={19} />, cor: '#ef4444', texto: 'montar combos', est: 'on' },
        { k: 'entrega', t: 'Entrega', ic: <Truck size={19} />, cor: '#22c55e', texto: store.iuser_delivery_enabled ? 'iUser ligado' : store.accepts_delivery ? 'eu entrego' : store.accepts_pickup ? 'só retirada' : 'desligada', est: store.accepts_delivery || store.iuser_delivery_enabled ? 'on' : 'off' },
        { k: 'pagamento', t: 'Pagamento', ic: <Wallet size={19} />, cor: '#16a34a', texto: store.pix_key ? `Pix ✓${store.accepts_card ? ' · cartão' : ''}` : 'falta o Pix', est: store.pix_key ? 'on' : 'warn' },
        { k: 'horarios', t: 'Horários', ic: <Timer size={19} />, cor: '#eab308', texto: horarios ? 'definidos' : 'falta definir', est: horarios ? 'on' : 'warn' },
    ]
    if (hasServices) {
        itens.push({ k: 'agenda', t: 'Agenda', ic: <CalendarDays size={19} />, cor: '#8b5cf6', texto: store.allow_scheduling ? 'ligada · ver horários' : 'desligada', est: store.allow_scheduling ? 'on' : 'off' })
        if (!opts.agendaNoPainel) itens.push({ k: 'regras', t: 'Regras da agenda', ic: <CalendarCheck size={19} />, cor: '#7c3aed', texto: store.deposit_mode && store.deposit_mode !== 'none' ? 'com entrada' : 'sem entrada', est: 'on' })
    }
    itens.push(
        { k: 'equipe', t: 'Equipe', ic: <Users size={19} />, cor: '#06b6d4', texto: store.iuser_delivery_enabled ? 'desligada · entrega iUser' : 'entregadores e funcionários', est: store.iuser_delivery_enabled ? 'off' : 'on' },
        { k: 'publicacoes', t: 'Publicações', ic: <Megaphone size={19} />, cor: '#f97316', texto: 'posts da loja', est: 'on' },
        { k: 'clube', t: 'Clube VIP', ic: <Crown size={19} />, cor: '#d97706', texto: store.vip_club_enabled ? (store.vip_club_price ? `${brl(Number(store.vip_club_price))}/mês` : 'grátis') : 'desligado', est: store.vip_club_enabled ? 'on' : 'off' },
    )
    if (opts.whatsapp !== false) itens.push({ k: 'whatsapp', t: 'WhatsApp', ic: <Zap size={19} />, cor: '#10b981', texto: store.whatsapp_bot_status === 'connected' ? 'avisos ligados' : 'desligado', est: store.whatsapp_bot_status === 'connected' ? 'on' : 'off' })
    return itens
}

/** FOLHA (sobe de baixo) = interruptor + poucas decisões; PÁGINA = lista editada item a item (o mesmo critério do laboratório) */
export const TIPO_SECAO: Record<SecaoKey, 'folha' | 'pagina'> = {
    dados: 'folha', entrega: 'folha', pagamento: 'folha', horarios: 'folha', regras: 'folha', clube: 'folha', whatsapp: 'folha',
    catalogo: 'pagina', promocoes: 'pagina', equipe: 'pagina', publicacoes: 'pagina', agenda: 'pagina',
}
