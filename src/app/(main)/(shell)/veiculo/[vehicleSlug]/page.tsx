// app/(main)/(shell)/veiculo/[vehicleSlug]/page.tsx
//
// PÁGINA DO VEÍCULO = a página de SERVIÇOS do motorista, para compartilhar (22/11/2026, decisão do dono; voltou depois de sair em 17/11).
// O endereço público é iuser.com.br/<vehicleSlug> (o proxy reescreve pra cá). São duas coisas diferentes: o PERFIL pessoal (que pode ser do
// tipo Motorista, em Informações do perfil) e esta página do veículo, que é o link que o motorista compartilha para chamarem ele.
import VehicleScreen from '@/versions/v3/screens/VehicleScreen'

export default function VeiculoPage() {
    return <VehicleScreen />
}
