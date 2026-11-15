'use client'
// O limite do Pós-pago como texto ("R$ 100"), lido do banco (ver lib/postpaid). Serve para frases dentro de componentes grandes, sem criar hook neles.
import { limitText, usePostpaidLimit } from '@/lib/postpaid'

export default function PostpaidLimitText() {
    return <>{limitText(usePostpaidLimit())}</>
}
