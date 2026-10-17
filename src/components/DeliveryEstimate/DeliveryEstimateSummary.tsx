// Resumo do carrinho/checkout do novo fluxo de entrega (V2): Produtos / Entrega ESTIMADA / Total ESTIMADO + aviso.
// Puramente apresentacional: recebe os números já calculados pelo servidor. Ainda NÃO é usado por nenhuma tela do V1.
import { ESTIMATE_MESSAGE, estimateTotals, formatBRLFromCents } from '@/modules/delivery-estimate'

export function DeliveryEstimateSummary({ itemsTotal, estimatedFreight }: { itemsTotal: number; estimatedFreight: number }) {
    const t = estimateTotals(itemsTotal, estimatedFreight)
    return (
        <div className="space-y-2 rounded-xl border bg-card p-4 text-sm">
            <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Produtos</span>
                <span>{formatBRLFromCents(t.itemsCents)}</span>
            </div>
            <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Entrega estimada</span>
                <span>{formatBRLFromCents(t.freightCents)}</span>
            </div>
            <div className="flex items-center justify-between border-t pt-2 font-semibold">
                <span>Total estimado</span>
                <span>{formatBRLFromCents(t.totalCents)}</span>
            </div>
            <p className="pt-1 text-xs text-muted-foreground">{ESTIMATE_MESSAGE}</p>
        </div>
    )
}
