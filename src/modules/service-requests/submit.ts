// src/modules/service-requests/submit.ts
//
// Envia o pedido: sobe as fotos (bucket service-request-photos) e grava a linha em service_requests.
import type { SupabaseClient } from '@supabase/supabase-js'

export interface SubmitServiceRequest {
    serviceType: string
    customService: string
    customIcon: string | null
    address: string
    needsAccess: boolean
    accessNotes: string
    description: string
    photos: File[]
}

export async function submitServiceRequest(client: SupabaseClient, userId: string, req: SubmitServiceRequest): Promise<void> {
    const photoUrls: string[] = []
    for (const file of req.photos) {
        const ext = file.name.split('.').pop()
        const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
        const { data, error } = await client.storage.from('service-request-photos').upload(path, file)
        if (error) throw error
        if (data) photoUrls.push(client.storage.from('service-request-photos').getPublicUrl(data.path).data.publicUrl)
    }

    const isOther = req.serviceType === 'outro'
    const { error } = await client.from('service_requests').insert({
        requester_id: userId,
        service_type: req.serviceType,
        custom_service: isOther ? req.customService.trim() || null : null,
        custom_icon: isOther ? req.customIcon || 'briefcase' : null,
        location_address: req.address.trim(),
        location_needs_access: req.needsAccess,
        location_access_notes: req.needsAccess ? req.accessNotes.trim() || null : null,
        description: req.description.trim(),
        photo_urls: photoUrls,
        notes: null,
    })
    if (error) throw error
}
