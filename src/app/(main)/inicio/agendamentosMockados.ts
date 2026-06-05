// src/app/(main)/inicio/agendamentosMockados.ts

export interface Agendamento {
    id: number
    profileSlug: string
    avatar: string
    imagem: string
    loja: string
    servico: string
    horario: string
    status: 'confirmado' | 'pendente' | 'concluido'
    tipo: 'cliente' | 'meu'
}

export const agendamentosMockados: Agendamento[] = [
    // 🟠 EU AGENDANDO COM OUTRAS PESSOAS
    {
        id: 1,
        profileSlug: 'barbearia-elite',
        avatar: 'https://randomuser.me/api/portraits/men/32.jpg',
        imagem: 'https://images.unsplash.com/photo-1621605815971-fbc98d665033',
        loja: 'Barbearia Elite',
        servico: 'Corte Masculino',
        horario: 'Hoje • 14:30',
        status: 'confirmado',
        tipo: 'meu',
    },
    {
        id: 2,
        profileSlug: 'studio-beleza',
        avatar: 'https://randomuser.me/api/portraits/women/44.jpg',
        imagem: 'https://images.unsplash.com/photo-1595476108010-b4d1f102b1b1',
        loja: 'Studio Beleza',
        servico: 'Escova Progressiva',
        horario: 'Hoje • 16:00',
        status: 'pendente',
        tipo: 'meu',
    },

    // 🔵 OUTROS AGENDAMENTOS (clientes ou sistema)
    {
        id: 3,
        profileSlug: 'pedro-almeida',
        avatar: 'https://randomuser.me/api/portraits/men/68.jpg',
        imagem: 'https://images.unsplash.com/photo-1579684385127-1ef15d508118',
        loja: 'Clínica Saúde',
        servico: 'Consulta Nutricional',
        horario: 'Amanhã • 09:00',
        status: 'confirmado',
        tipo: 'cliente',
    },
    {
        id: 4,
        profileSlug: 'ana-costa',
        avatar: 'https://randomuser.me/api/portraits/women/63.jpg',
        imagem: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438',
        loja: 'Academia PowerFit',
        servico: 'Avaliação Física',
        horario: 'Amanhã • 10:30',
        status: 'concluido',
        tipo: 'cliente',
    },
    {
        id: 5,
        profileSlug: 'lucas-rocha',
        avatar: 'https://randomuser.me/api/portraits/men/75.jpg',
        imagem: 'https://images.unsplash.com/photo-1601758125946-6ec2ef64daf8',
        loja: 'Pet Care',
        servico: 'Banho e Tosa',
        horario: 'Sexta • 15:00',
        status: 'confirmado',
        tipo: 'cliente',
    },
    {
        id: 6,
        profileSlug: 'carla-mendes',
        avatar: 'https://randomuser.me/api/portraits/women/12.jpg',
        imagem: 'https://images.unsplash.com/photo-1582095133179-bfd08e2fc6b3',
        loja: 'Spa Relax',
        servico: 'Massagem Terapêutica',
        horario: 'Hoje • 18:00',
        status: 'pendente',
        tipo: 'cliente',
    },
    {
        id: 7,
        profileSlug: 'ricardo-lima',
        avatar: 'https://randomuser.me/api/portraits/men/21.jpg',
        imagem: 'https://images.unsplash.com/photo-1558611848-73f7eb4001a1',
        loja: 'Oficina AutoPrime',
        servico: 'Revisão Completa',
        horario: 'Segunda • 08:00',
        status: 'confirmado',
        tipo: 'cliente',
    },
    {
        id: 8,
        profileSlug: 'fernanda-oliveira',
        avatar: 'https://randomuser.me/api/portraits/women/28.jpg',
        imagem: 'https://images.unsplash.com/photo-1520975916090-3105956dac38',
        loja: 'Studio Nails',
        servico: 'Alongamento de Unhas',
        horario: 'Terça • 13:00',
        status: 'concluido',
        tipo: 'cliente',
    },
    {
        id: 9,
        profileSlug: 'gabriel-santos',
        avatar: 'https://randomuser.me/api/portraits/men/45.jpg',
        imagem: 'https://images.unsplash.com/photo-1556745757-8d76bdb6984b',
        loja: 'Tech Assist',
        servico: 'Manutenção de Notebook',
        horario: 'Quarta • 11:00',
        status: 'pendente',
        tipo: 'cliente',
    },
    {
        id: 10,
        profileSlug: 'minha-conta',
        avatar: 'https://randomuser.me/api/portraits/men/1.jpg',
        imagem: 'https://images.unsplash.com/photo-1521737604893-d14cc237f11d',
        loja: 'Meu Estúdio',
        servico: 'Sessão Fotográfica',
        horario: 'Hoje • 20:00',
        status: 'confirmado',
        tipo: 'meu',
    },
]