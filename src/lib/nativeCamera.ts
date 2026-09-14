// lib/nativeCamera.ts
// No app nativo (Capacitor), abre o seletor nativo (câmera ou galeria,
// escolhido pelo usuário) em vez do <input type="file"> do navegador —
// devolve um File, pra manter o restante do fluxo de upload idêntico ao
// que já existia. No site normal, não faz nada (os pontos de uso continuam
// clicando no input escondido como antes).
import { Capacitor } from '@capacitor/core'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'

export function isNativePlatform() {
    return Capacitor.isNativePlatform()
}

export async function pickImageFile(fileNamePrefix = 'foto'): Promise<File | null> {
    try {
        const photo = await Camera.getPhoto({
            source: CameraSource.Prompt,
            resultType: CameraResultType.Uri,
            quality: 85,
            promptLabelHeader: 'Foto',
            promptLabelPhoto: 'Escolher da galeria',
            promptLabelPicture: 'Tirar foto',
        })

        if (!photo.webPath) return null

        const response = await fetch(photo.webPath)
        const blob = await response.blob()
        const ext = photo.format || 'jpeg'
        return new File([blob], `${fileNamePrefix}-${Date.now()}.${ext}`, { type: blob.type || `image/${ext}` })
    } catch {
        // Usuário cancelou o seletor nativo — comportamento equivalente a
        // fechar o <input type="file"> sem escolher nada.
        return null
    }
}
