// app/(main)/(shell)/loading.tsx
//
// Enquanto a página nova carrega, o cartão do app já troca (a aba clara desliza e o conteúdo mostra isto) em vez de a
// barra andar e a página antiga ficar parada — é o que deixava a troca de aba "separada".
export default function ShellLoading() {
    return (
        <div className="flex justify-center py-24" aria-busy="true">
            <span className="w-8 h-8 rounded-full border-[3px] border-orange-500 border-t-transparent animate-spin" />
        </div>
    )
}
