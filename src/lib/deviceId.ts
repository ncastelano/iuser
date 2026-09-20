// src/lib/deviceId.ts
// Identificador estável do aparelho/navegador, guardado no localStorage.
// É uma trava de fricção (limpar os dados do app gera outro id) — a trava
// forte contra várias contas é o CPF/CNPJ único por conta pós-paga.
const KEY = 'iuser_device_id_v1'

export function getDeviceId(): string {
    if (typeof window === 'undefined') return ''
    try {
        let id = localStorage.getItem(KEY)
        if (!id) {
            id = crypto.randomUUID()
            localStorage.setItem(KEY, id)
        }
        return id
    } catch {
        return ''
    }
}
