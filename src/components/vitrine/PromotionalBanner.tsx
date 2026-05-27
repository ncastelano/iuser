"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Handshake, ArrowRight, Sparkles } from "lucide-react";

export function PromotionalBanner() {
  const router = useRouter();
  const supabase = createClient();

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [storePath, setStorePath] = useState<string | null>(null); // só preenchido se logado + tiver loja
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setIsLoggedIn(!!user);

      if (user) {
        // Busca perfil e loja do usuário
        const { data: profile } = await supabase
          .from("profiles")
          .select("profileSlug")
          .eq("id", user.id)
          .single();

        const { data: stores } = await supabase
          .from("stores")
          .select("storeSlug")
          .eq("owner_id", user.id)
          .limit(1);

        if (profile && stores && stores.length > 0) {
          setStorePath(
            `/${profile.profileSlug}/${stores[0].storeSlug}/criar-produto`
          );
        } else {
          setStorePath(null); // sem loja → não exibe o banner
        }
      }
      setLoading(false);
    };
    checkAuth();
  }, []);

  if (loading) {
    return (
      <div className="mt-12 bg-gradient-to-r from-orange-500 via-red-500 to-yellow-500 rounded-3xl p-6 text-center shadow-xl animate-pulse">
        <div className="h-6 bg-white/20 rounded w-3/4 mx-auto mb-2" />
        <div className="h-4 bg-white/20 rounded w-1/2 mx-auto mb-3" />
        <div className="h-10 bg-white/20 rounded-xl w-40 mx-auto" />
      </div>
    );
  }

  // Caso não esteja logado: banner de convite ao cadastro
  if (!isLoggedIn) {
    return (
      <div className="mt-12 bg-gradient-to-r from-orange-500 via-red-500 to-yellow-500 rounded-3xl p-6 text-center shadow-xl">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Handshake className="w-6 h-6 text-white" />
          <h3 className="text-xl font-black text-white">
            Ofereça seus serviços ou produtos!
          </h3>
        </div>
        <p className="text-white/90 text-sm mb-3">
          faça seu cadastro, é grátis
        </p>
        <button
          onClick={() => router.push("/register")}
          className="inline-flex items-center gap-2 px-6 py-2 bg-white text-orange-600 rounded-xl font-bold hover:scale-105 transition-transform shadow-md"
        >
          Cadastre-se
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    );
  }

  // Se logado mas sem loja, não exibe nada (evita ir para outro canto)
  if (!storePath) {
    return null;
  }

  // Logado e com loja: banner de incentivo a adicionar produto
  return (
    <div className="mt-12 bg-gradient-to-r from-orange-500 via-red-500 to-yellow-500 rounded-3xl p-6 text-center shadow-xl">
      <div className="flex items-center justify-center gap-2 mb-2">
        <Sparkles className="w-6 h-6 text-white" />
        <h3 className="text-xl font-black text-white">Dê o próximo passo!</h3>
      </div>
      <p className="text-white/90 text-sm mb-3">
        adicione um novo produto e conquiste mais clientes
      </p>
      <button
        onClick={() => router.push(storePath)}
        className="inline-flex items-center gap-2 px-6 py-2 bg-white text-orange-600 rounded-xl font-bold hover:scale-105 transition-transform shadow-md"
      >
        Adicionar Produto
        <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}
