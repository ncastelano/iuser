// app/(main)/(shell)/veiculo/[vehicleSlug]/page.tsx
//
// Página de um veículo. O endereço público é iuser.com.br/<vehicleSlug> (o proxy reescreve pra cá), igual às lojas:
// uma pessoa pode ter vários veículos, cada um com a sua página. A tela (cliente e dono) vive em versions/v3/screens.
import VehicleScreen from '@/versions/v3/screens/VehicleScreen'

export default function VeiculoPage() {
    return <VehicleScreen />
}
