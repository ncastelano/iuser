// src/lib/rideSpecs.ts
//
// Resumo (rótulo: valor) das especificações que o passageiro confirmou em
// /pedir-motorista, a partir da linha salva em ride_requests. Usado no board
// de /aceitar-corridas pra o motorista decidir se aceita a corrida sabendo
// exatamente o que ela envolve (criança, pet, compras, objeto sensível...),
// no lugar de só mostrar o tipo de veículo.

export interface RideSpecFields {
    ride_type: 'pessoa' | 'objeto' | 'animal'
    origin_complement?: string | null
    destination_complement?: string | null
    passenger_count: number
    has_child: boolean
    children_count: number | null
    child_age: string | null
    child_needs_car_seat: boolean | null
    has_shopping: boolean
    bag_count: number | null
    has_extra_object: boolean
    extra_object_description: string | null
    has_pet: boolean
    pet_description: string | null
    object_description: string | null
    object_is_sensitive: boolean
    has_special_needs: boolean
    special_needs_description: string | null
}

export interface RideSpecRow {
    label: string
    value: string
}

export function buildRideSpecRows(ride: RideSpecFields): RideSpecRow[] {
    const rows: RideSpecRow[] = []

    if (ride.ride_type === 'pessoa') {
        const peopleText = ride.passenger_count === 1 ? '1 pessoa' : `${ride.passenger_count} pessoas`
        rows.push({ label: 'Passageiros', value: peopleText })

        if (ride.has_child) {
            const countText = (ride.children_count ?? 1) === 1 ? '1 criança' : `${ride.children_count} crianças`
            const ageRaw = (ride.child_age || '').trim()
            const ageText = ageRaw ? ` de ${ageRaw}${/anos?\b/i.test(ageRaw) ? '' : ' anos'}` : ''
            const carSeatText =
                ride.child_needs_car_seat === true ? ', precisa de cadeirinha' :
                    ride.child_needs_car_seat === false ? ', não precisa de cadeirinha' : ''
            rows.push({ label: 'Criança', value: `${countText}${ageText}${carSeatText}` })
        }

        if (ride.has_shopping) {
            rows.push({ label: 'Compras', value: `de mercado${ride.bag_count ? ` (${ride.bag_count} ${ride.bag_count === 1 ? 'sacola' : 'sacolas'})` : ''}` })
        }

        if (ride.has_extra_object) {
            rows.push({ label: 'Objeto extra', value: ride.extra_object_description || 'não especificado' })
        }

        if (ride.has_pet) {
            rows.push({ label: 'Pet', value: ride.pet_description || 'não especificado' })
        }
    } else if (ride.ride_type === 'animal') {
        rows.push({ label: 'Animal', value: ride.pet_description || 'não especificado' })
    } else {
        rows.push({ label: 'Objeto', value: ride.object_description || 'não especificado' })
        if (ride.object_is_sensitive) rows.push({ label: 'Atenção', value: 'sensível/frágil' })
    }

    if (ride.has_special_needs) {
        rows.push({ label: 'Necessidade especial', value: ride.special_needs_description || 'sim' })
    }

    if ((ride.origin_complement || '').trim()) {
        rows.push({ label: 'Complemento (origem)', value: (ride.origin_complement as string).trim() })
    }
    if ((ride.destination_complement || '').trim()) {
        rows.push({ label: 'Complemento (destino)', value: (ride.destination_complement as string).trim() })
    }

    return rows
}
