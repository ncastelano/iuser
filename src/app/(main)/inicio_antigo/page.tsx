'use client'

import { useState } from 'react'
import {
  MapPin,
  Search,
  ChevronRight
} from 'lucide-react'

export default function Home() {
  const [activeFilter, setActiveFilter] = useState('proximas')

  return (
    <div className="flex flex-col gap-6 text-white">

      {/* 🔝 Header */}
      <div className="flex flex-col gap-4">

        {/* Linha 1: Avatar + Localização */}
        <div className="flex items-center gap-3">

          {/* Avatar */}
          <div className="w-11 h-11 rounded-full bg-orange-500 text-black flex items-center justify-center font-extrabold cursor-pointer border-2 border-transparent hover:border-white transition">
            N
          </div>

          {/* Localização */}
          <div className="flex items-center gap-2">
            <div className="bg-neutral-900 p-2 rounded-full border border-neutral-800">
                <MapPin size={16} className="text-orange-500" />
            </div>
            <div className="text-sm">
              <p className="text-neutral-500 text-xs font-semibold uppercase tracking-wider">Localização</p>
              <p className="font-bold text-white">Rua Carambola...</p>
            </div>
          </div>

        </div>

        {/* Linha 2: Search */}
        <div className="flex items-center gap-3 bg-neutral-900 border border-neutral-800 rounded-2xl px-4 py-3.5 focus-within:border-orange-500 focus-within:ring-1 focus-within:ring-orange-500 transition shadow-inner">
          <Search className="text-neutral-500" size={20} />
          <input
            type="text"
            placeholder="Procure entre produto, serviço ou loja"
            className="bg-transparent outline-none text-sm w-full text-white placeholder-neutral-600 font-medium"
          />
        </div>

      </div>

      {/* 🎯 Banner */}
      <div className="w-full h-44 bg-gradient-to-r from-orange-600 to-orange-400 rounded-2xl flex items-center justify-center shadow-[0_10px_30px_rgba(249,115,22,0.2)]">
        <span className="text-white font-extrabold text-xl tracking-tight">
          Banner / Promoções
        </span>
      </div>

      {/* 🔥 LISTAS */}
      <Section title="Produtos mais pedidos hoje">
        <HorizontalList />
      </Section>

      <Section title="Lojas mais pedidas hoje">
        <HorizontalList />
      </Section>

      <Section title="Serviços mais pedidos hoje">
        <HorizontalList />
      </Section>

      {/* 🏪 FILTRO */}
      <div className="flex gap-2 bg-neutral-900 p-1.5 rounded-full border border-neutral-800 inline-flex w-max">
        <button
          onClick={() => setActiveFilter('proximas')}
          className={`px-5 py-2 rounded-full text-sm font-bold transition-all ${activeFilter === 'proximas'
            ? 'bg-orange-500 text-black shadow-md'
            : 'text-neutral-400 hover:text-white'
            }`}
        >
          Próximas
        </button>

        <button
          onClick={() => setActiveFilter('melhores')}
          className={`px-5 py-2 rounded-full text-sm font-bold transition-all ${activeFilter === 'melhores'
            ? 'bg-orange-500 text-black shadow-md'
            : 'text-neutral-400 hover:text-white'
            }`}
        >
          Melhores
        </button>
      </div>

      {/* 🏪 LISTA DE LOJAS */}
      <div className="flex flex-col gap-4">
        {[1, 2, 3, 4].map((item) => (
          <div
            key={item}
            className="glass-glow-card p-4 flex items-center justify-between hover:border-orange-500/50 hover:bg-neutral-800/80 transition-all cursor-pointer group"
          >
            <div className="flex items-center gap-4">
              {/* Logo */}
              <div className="w-14 h-14 bg-neutral-800 rounded-xl border border-neutral-700" />

              {/* Info */}
              <div>
                <p className="font-bold text-white text-lg">Loja {item}</p>
                <p className="text-sm text-neutral-400 font-medium">
                  Melhor loja da região
                </p>
              </div>
            </div>

            <ChevronRight className="text-neutral-500 group-hover:text-orange-500 transition-colors" />
          </div>
        ))}
      </div>
    </div>
  )
}


// 🔹 Seção
function Section({ title, children }: any) {
  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <h2 className="font-extrabold text-white tracking-tight">{title}</h2>
        <span className="text-sm font-semibold text-orange-500 hover:text-orange-400 cursor-pointer transition">
          Ver todos
        </span>
      </div>
      {children}
    </div>
  )
}


// 🔹 Lista horizontal
function HorizontalList() {
  return (
    <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
      {[1, 2, 3, 4].map((item) => (
        <div
          key={item}
          className="min-w-[140px] glass-glow-card p-3 flex flex-col gap-3 hover:border-orange-500/50 hover:shadow-[0_5px_15px_rgba(249,115,22,0.1)] transition-all cursor-pointer"
        >
          <div className="h-24 bg-neutral-800 rounded-xl border border-neutral-700 w-full" />
          <p className="text-sm font-bold text-white px-1">Item {item}</p>
        </div>
      ))}
    </div>
  )
}
