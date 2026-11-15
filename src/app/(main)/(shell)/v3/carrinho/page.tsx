// app/(main)/(shell)/v3/carrinho/page.tsx — o carrinho na 3.0 vive na Atividade (/atividade?aba=carrinho|pedidos|biblioteca): o endereço antigo só leva até lá
import AtividadeLegacy from '@/versions/v3/screens/AtividadeLegacy'

export default function CarrinhoV3Page() {
    return <AtividadeLegacy fallback="/atividade?aba=carrinho" />
}
