// app/(main)/carrinho/page.tsx — carrinho na interface 2.0 (a 3.0 é servida por /v3/carrinho; ver src/versions)
import CarrinhoScreen from '@/versions/shared/screens/CarrinhoScreen'

export default function CarrinhoPage() {
    return <CarrinhoScreen ui="v2" />
}
