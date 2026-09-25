// src/lib/phone.ts

// Formata progressivamente um telefone brasileiro conforme a pessoa digita:
// (99) 9999-9999 (fixo) ou (99) 99999-9999 (celular).
export const formatBrazilianPhone = (value: string) => {
    const numbers = value.replace(/\D/g, '')
    if (numbers.length === 0) return ''
    if (numbers.length <= 2) return `(${numbers}`
    if (numbers.length <= 6) return `(${numbers.slice(0, 2)}) ${numbers.slice(2)}`
    if (numbers.length <= 10) return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 6)}-${numbers.slice(6)}`
    return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 7)}-${numbers.slice(7, 11)}`
}

// Remove a formatação, deixando só os dígitos (é assim que o telefone é
// gravado no banco).
export const cleanPhoneNumber = (value: string) => value.replace(/\D/g, '')
