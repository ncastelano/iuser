// src/lib/rideCycle.ts
//
// Quantas corridas iguais cabem em 1 hora, contando sempre pelo TEMPO: cada corrida leva `cycleMin` (do deslocamento até o
// passageiro até a chegada) e, entre uma corrida e a próxima, há uma folga de RIDE_GAP_MIN minutos.
// n corridas gastam n × cycleMin + (n − 1) × folga, e esse total tem de caber nos 60 minutos (só corridas inteiras).
// Ex.: corrida de 18 min → 18n + 3(n − 1) ≤ 60 → 3 corridas (18 + 3 + 18 + 3 + 18 = 60 min).
// Puro (sem React/Supabase), testado em scripts/test-tariff-summary.mjs.

/** Folga entre uma corrida e a próxima (minutos) */
export const RIDE_GAP_MIN = 3

/** Janela de cálculo (minutos) */
export const HOUR_MIN = 60

/** Quantas corridas inteiras de `cycleMin` cabem em 1 hora com a folga entre elas (0 se uma só já passa de 1 hora) */
export function ridesInOneHour(cycleMin: number, gapMin = RIDE_GAP_MIN): number {
    if (!(cycleMin > 0)) return 0
    // n × ciclo + (n − 1) × folga ≤ 60  ⇔  n ≤ (60 + folga) ÷ (ciclo + folga); a tolerância evita erro de ponto flutuante
    return Math.max(0, Math.floor((HOUR_MIN + gapMin) / (cycleMin + gapMin) + 1e-9))
}
