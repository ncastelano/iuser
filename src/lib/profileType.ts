// TIPOS DE PERFIL (coluna `profiles.profile_type`, migration 20261130000071; 17/11/2026): como o modelo da loja, mudam só a APRESENTAÇÃO da página
// pública do perfil — o botão principal e o que aparece primeiro. Nenhuma permissão, preço ou pedido depende do tipo. A pessoa escolhe no cadastro
// e troca no painel do perfil. Testes: scripts/test-profile-type.mjs (npm run test:profile-type).
//   pessoal      → publicações primeiro; Seguir e Enviar mensagem (o padrão)
//   servicos     → serviços primeiro; botão "Contratar" (abre a conversa ou os serviços)
//   agendamentos → botão "Agendar com <nome>" em destaque; serviços primeiro
//   motorista    → botão "Solicitar corrida" (o pedido já vai com o valor da tarifa DELE) e o cartão do veículo
export type ProfileType = 'pessoal' | 'servicos' | 'agendamentos' | 'motorista'
export type ProfileTab = 'publications' | 'services' | 'profile_comments'

export const PROFILE_TYPES: { id: ProfileType; title: string; desc: string; main: string; color: string }[] = [
    { id: 'pessoal', title: 'Pessoal', desc: 'Para publicar, seguir e conversar com as pessoas.', main: 'Botões: Seguir e Enviar mensagem', color: '#f97316' },
    { id: 'servicos', title: 'Serviços', desc: 'Você faz serviços (pedreiro, diarista, técnico, aulas...).', main: 'Botão principal: Contratar', color: '#0d9488' },
    { id: 'agendamentos', title: 'Agendamentos', desc: 'Você atende com hora marcada (salão, consultório, estúdio...).', main: 'Botão principal: Agendar', color: '#7c3aed' },
    { id: 'motorista', title: 'Motorista', desc: 'Você dirige pelo iUser (carro, moto ou bicicleta).', main: 'Botão principal: Solicitar corrida', color: '#16a34a' },
]
const ALL: ProfileType[] = ['pessoal', 'servicos', 'agendamentos', 'motorista']

export function parseProfileType(v: unknown): ProfileType {
    return ALL.includes(v as ProfileType) ? (v as ProfileType) : 'pessoal'
}

export const profileTypeInfo = (t: ProfileType) => PROFILE_TYPES.find((p) => p.id === t)!

/** A aba que a página do perfil abre por padrão (o `?aba=` da URL continua mandando) */
export function defaultProfileTab(t: ProfileType, counts: { publications: number; services: number }): ProfileTab {
    if ((t === 'servicos' || t === 'agendamentos') && counts.services > 0) return 'services'
    return 'publications'
}

/** A ordem das abas: no perfil de serviços e de agendamentos, Serviços vem primeiro */
export function profileTabOrder(t: ProfileType): ProfileTab[] {
    return t === 'servicos' || t === 'agendamentos' ? ['services', 'publications', 'profile_comments'] : ['publications', 'services', 'profile_comments']
}

/**
 * O botão principal da página para quem VISITA (o dono vê "Editar perfil"):
 *  - agendamentos com a agenda ligada → Agendar; sem agenda → cai em Contratar (conversa) se o chat está ligado
 *  - motorista com veículo → Solicitar corrida; sem veículo → nada de especial
 *  - servicos → Contratar (conversa, se ligada; senão a aba Serviços)
 *  - pessoal → nenhum (Seguir e Enviar mensagem, como sempre)
 */
export type MainAction = 'schedule' | 'ride' | 'hire' | null
export function profileMainAction(t: ProfileType, s: { allowScheduling: boolean; hasVehicle: boolean; chatEnabled: boolean; services: number }): MainAction {
    if (t === 'agendamentos') return s.allowScheduling ? 'schedule' : (s.chatEnabled || s.services > 0 ? 'hire' : null)
    if (t === 'motorista') return s.hasVehicle ? 'ride' : null
    if (t === 'servicos') return s.chatEnabled || s.services > 0 ? 'hire' : null
    return null
}

/** O que falta para o tipo funcionar (o dono vê um aviso com o atalho): agenda desligada, nenhum veículo, nenhum serviço */
export function profileTypeMissing(t: ProfileType, s: { allowScheduling: boolean; hasVehicle: boolean; services: number }): 'agenda' | 'vehicle' | 'service' | null {
    if (t === 'agendamentos' && !s.allowScheduling) return 'agenda'
    if (t === 'motorista' && !s.hasVehicle) return 'vehicle'
    if (t === 'servicos' && s.services === 0) return 'service'
    return null
}
