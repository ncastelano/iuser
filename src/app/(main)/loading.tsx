// app/(main)/loading.tsx — as páginas FORA da casca (perfis, lojas, painéis...) também mostram algo NA HORA enquanto carregam
// (antes só as de dentro da casca tinham), em vez de a página antiga ficar parada.
export default function MainLoading() {
    return (
        <div className="flex justify-center py-24" aria-busy="true">
            <span className="w-8 h-8 rounded-full border-[3px] border-orange-500 border-t-transparent animate-spin" />
        </div>
    )
}
