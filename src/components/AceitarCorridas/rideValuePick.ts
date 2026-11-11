// O card enxuto (RideSummaryCard) e o card completo aberto dentro dele (RideOfferCard) conversam por aqui: a pessoa ESCOLHE o valor na lista do
// card aberto e o valor grande + o "deslize para se candidatar" do card enxuto passam a ser esse. Sem o contexto (mapa, alerta, candidaturas),
// o RideOfferCard segue com os botões dele de sempre.
import { createContext } from 'react'

export interface RideValuePick {
    /** o valor que o card enxuto mostra antes de a pessoa escolher (a lista começa marcada nele) */
    initial: number
    /** só mostrar os valores (home): sem escolher e sem candidatar */
    viewOnly: boolean
    /** valores marcados (o primeiro é o menor = o principal; null = nenhum válido), se não puderem ser enviados, por quê, e `own` = o "Outro valor" está aberto
     *  (ele tem o PRÓPRIO botão "Enviar valor"; o deslizar do card enxuto some para não ter dois jeitos de mandar a mesma coisa) */
    set: (prices: number[] | null, blocked: string | null, own: boolean) => void
}
export const RideValuePickContext = createContext<RideValuePick | null>(null)
