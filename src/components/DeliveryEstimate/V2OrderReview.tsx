// Revisão do pedido no caminho V2 (ainda desligado em produção): Produtos / Entrega estimada / Total estimado, o aviso de que
// o valor da entrega pode ser ajustado e o botão "Enviar pedido". Aqui NINGUÉM paga: o pedido só segue para a loja decidir.
// Puramente apresentacional — recebe os números prontos do servidor.
import type { DeliveryEstimate } from '@/modules/delivery-estimate'
import { V2_SUBMIT_LABEL } from '@/modules/delivery-estimate'
import { DeliveryEstimateSummary } from './DeliveryEstimateSummary'

export function V2OrderReview(props: {
    itemsTotal: number
    estimate: DeliveryEstimate | null
    loading: boolean
    error: string | null
    submitting: boolean
    onBack: () => void
    onSubmit: () => void
    onRetry: () => void
}) {
    const { itemsTotal, estimate, loading, error, submitting, onBack, onSubmit, onRetry } = props
    return (
        <div className="space-y-3">
            {estimate ? (
                <DeliveryEstimateSummary itemsTotal={itemsTotal} estimatedFreight={estimate.estimatedFreight} />
            ) : (
                <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
                    {loading ? 'Calculando a entrega…' : error || 'Não foi possível calcular a entrega.'}
                    {!loading && (
                        <button type="button" onClick={onRetry} className="ml-2 font-semibold underline">Tentar de novo</button>
                    )}
                </div>
            )}
            <div className="flex gap-2">
                <button type="button" onClick={onBack} className="flex-1 rounded-xl border py-2.5 text-xs font-bold">Voltar</button>
                <button
                    type="button"
                    onClick={onSubmit}
                    disabled={!estimate || loading || submitting}
                    className="flex-1 rounded-xl py-2.5 text-xs font-bold text-white disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg,#f97316,#ef4444)' }}
                >
                    {submitting ? 'Enviando…' : V2_SUBMIT_LABEL}
                </button>
            </div>
        </div>
    )
}
