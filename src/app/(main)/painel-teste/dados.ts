// src/app/(main)/painel-teste/dados.ts — dados de EXEMPLO e constantes comuns dos laboratórios do painel da loja (só teste; nada é real).

export const ORANGE = '#f97316'
// paleta dos pedidos (a do app todo): novos = verde, preparando = amarelo, prontos = roxo, a caminho/finalizados = azul
export const C = { novo: '#22c55e', preparando: '#eab308', pronto: '#a855f7', caminho: '#3b82f6', servico: '#14b8a6', alerta: '#ef4444', ambar: '#f59e0b' }

export type Estado = 'movimentado' | 'tranquilo' | 'nova'
export type Modelo = 'mixed' | 'products' | 'services'
export type Fase = 'novo' | 'preparando' | 'pronto' | 'caminho' | 'finalizado'
export type Pedido = { id: number; quem: string; hora: string; valor: number; item: string; mais: number; entrega: string; fase: Fase }

export const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export const PEDIDOS: Pedido[] = [
    { id: 1, quem: '@carla-cavalcanti', hora: '23:21', valor: 69.8, item: 'Combo Casal', mais: 1, entrega: 'Tito vai buscar o pedido', fase: 'novo' },
    { id: 2, quem: '@ana-barbosa', hora: '23:20', valor: 120.7, item: 'Pizza Portuguesa (grande)', mais: 2, entrega: 'Tito a caminho da loja', fase: 'novo' },
    { id: 3, quem: '@joao-martins', hora: '23:19', valor: 119.3, item: 'Pizza Margherita (grande)', mais: 2, entrega: 'Rafa vai buscar o pedido', fase: 'novo' },
    { id: 4, quem: '@gabriela-carvalho', hora: '23:18', valor: 183.7, item: 'Pizza Quatro Queijos (grande)', mais: 2, entrega: 'Rafa a caminho da loja', fase: 'novo' },
    { id: 5, quem: '@breno-oliveira', hora: '23:18', valor: 256.5, item: 'Pizza Banana com Canela', mais: 3, entrega: 'Léo a caminho da loja', fase: 'novo' },
    { id: 6, quem: '@mateus-pinto', hora: '23:12', valor: 173.8, item: 'Pizza Carne Seca com Abóbora', mais: 2, entrega: 'Dani está na loja esperando', fase: 'preparando' },
    { id: 7, quem: '@marta-moura', hora: '23:09', valor: 98.9, item: 'Pizza Bacon com Cheddar', mais: 1, entrega: 'Cliente retira na loja', fase: 'preparando' },
    { id: 8, quem: '@heitor-martins', hora: '23:05', valor: 142.0, item: 'Combo Doce e Salgada', mais: 0, entrega: 'Léo chega em ~6 min', fase: 'preparando' },
    { id: 9, quem: '@sergio-rodrigues', hora: '22:58', valor: 87.5, item: 'Pizza Napolitana (grande)', mais: 1, entrega: 'Rafa chega em ~3 min', fase: 'pronto' },
    { id: 10, quem: '@larissa-castro', hora: '22:55', valor: 64.9, item: 'Pizza Calabresa + Borda', mais: 0, entrega: 'Cliente retira na loja', fase: 'pronto' },
    { id: 11, quem: '@pedro-lima', hora: '22:49', valor: 131.2, item: 'Pizza Filé com Cheddar', mais: 2, entrega: 'Tito saiu para entregar', fase: 'caminho' },
    { id: 12, quem: '@bia-santos', hora: '22:44', valor: 76.0, item: 'Pizza Brigadeiro Gourmet', mais: 0, entrega: 'Dani saiu para entregar', fase: 'caminho' },
]

/** pedidos JÁ FINALIZADOS hoje (a seção "Finalizados" do funil do painel; a página Pedidos tem a própria lista) */
export const FINALIZADOS_HOJE: Pedido[] = [
    { id: 13, quem: '@lucas-ferreira', hora: '22:30', valor: 88.9, item: 'Pizza Calabresa (grande)', mais: 1, entrega: 'Entregue por Dani', fase: 'finalizado' },
    { id: 14, quem: '@paula-nunes', hora: '22:12', valor: 54.0, item: 'Pizza Margherita (média)', mais: 0, entrega: 'Retirou na loja', fase: 'finalizado' },
    { id: 15, quem: '@rui-castro', hora: '21:50', valor: 142.5, item: 'Combo Família', mais: 2, entrega: 'Entregue por Rafa', fase: 'finalizado' },
    { id: 16, quem: '@sara-melo', hora: '21:20', valor: 63.7, item: 'Pizza Portuguesa (média)', mais: 1, entrega: 'Entregue por Léo', fase: 'finalizado' },
]

export const FASES: { k: Fase; nome: string; cor: string; acao?: string }[] = [
    { k: 'novo', nome: 'Novos', cor: C.novo, acao: 'Aceitar' },
    { k: 'preparando', nome: 'Em preparo', cor: C.preparando, acao: 'Pronto' },
    { k: 'pronto', nome: 'Prontos', cor: C.pronto, acao: 'Retirado' },
    { k: 'caminho', nome: 'A caminho', cor: C.caminho },
]

