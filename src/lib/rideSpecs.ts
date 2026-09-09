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
    pet_weight_range?: 'ate_5kg' | '5_a_15kg' | '15_a_30kg' | 'acima_30kg' | null
    pet_has_carrier?: boolean | null
    object_description: string | null
    object_is_sensitive: boolean
    delivery_location?: 'portaria' | 'area_interna' | 'apartamento' | null
    has_special_needs: boolean
    special_needs_description: string | null
    special_needs_wheelchair?: boolean
    special_needs_wheelchair_type?: 'dobravel' | 'grande' | null
    special_needs_visual_impairment?: boolean
    has_guide_dog?: boolean
    payment_method?: 'dinheiro' | 'pix' | null
    cash_change_for?: number | null
}

const PET_WEIGHT_LABELS: Record<string, string> = {
    ate_5kg: 'até 5kg',
    '5_a_15kg': '5 a 15kg',
    '15_a_30kg': '15 a 30kg',
    acima_30kg: 'acima de 30kg',
}

export interface RideSpecRow {
    label: string
    value: string
}

function petWeightCarrierText(ride: RideSpecFields): string | null {
    const weightLabel = ride.pet_weight_range ? PET_WEIGHT_LABELS[ride.pet_weight_range] : null
    const carrierText = ride.pet_has_carrier === true ? 'com caixa de transporte' : ride.pet_has_carrier === false ? 'sem caixa de transporte' : null
    const parts = [weightLabel, carrierText].filter(Boolean)
    return parts.length > 0 ? parts.join(', ') : null
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
            const petDetails = petWeightCarrierText(ride)
            if (petDetails) rows.push({ label: 'Peso/transporte', value: petDetails })
        }
    } else if (ride.ride_type === 'animal') {
        rows.push({ label: 'Animal', value: ride.pet_description || 'não especificado' })
        const petDetails = petWeightCarrierText(ride)
        if (petDetails) rows.push({ label: 'Peso/transporte', value: petDetails })
    } else {
        rows.push({ label: 'Objeto', value: ride.object_description || 'não especificado' })
        if (ride.object_is_sensitive) rows.push({ label: 'Atenção', value: 'sensível/frágil' })
        if (ride.delivery_location) {
            const label = ride.delivery_location === 'portaria' ? 'Portaria' : ride.delivery_location === 'area_interna' ? 'Área interna do condomínio' : 'Apartamento/residência'
            rows.push({ label: 'Entregar em', value: label })
        }
    }

    if (ride.has_special_needs) {
        const parts: string[] = []
        if (ride.special_needs_wheelchair) {
            parts.push(`cadeirante${ride.special_needs_wheelchair_type ? ` (${ride.special_needs_wheelchair_type === 'dobravel' ? 'dobrável' : 'grande'})` : ''}`)
        }
        if (ride.special_needs_visual_impairment) {
            parts.push(`deficiência visual${ride.has_guide_dog ? ' — vem com cão-guia' : ''}`)
        }
        if (ride.special_needs_description) parts.push(ride.special_needs_description)
        rows.push({ label: 'Necessidade especial', value: parts.length > 0 ? parts.join('; ') : 'sim' })

        if (ride.has_guide_dog) {
            rows.push({ label: 'Atenção', value: 'Cão-guia — não é pet comum, não recuse por causa dele' })
        }
    }

    if (ride.payment_method) {
        const changeText = ride.payment_method === 'dinheiro' && ride.cash_change_for != null ? ` (troco para R$ ${ride.cash_change_for.toFixed(2)})` : ''
        rows.push({ label: 'Pagamento', value: `${ride.payment_method === 'dinheiro' ? 'Dinheiro' : 'Pix'}${changeText}` })
    }

    if ((ride.origin_complement || '').trim()) {
        rows.push({ label: 'Complemento (origem)', value: (ride.origin_complement as string).trim() })
    }
    if ((ride.destination_complement || '').trim()) {
        rows.push({ label: 'Complemento (destino)', value: (ride.destination_complement as string).trim() })
    }

    return rows
}
