import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'

const EXPO_PUSH_API = 'https://exp.host/--/api/v2/push/send'

interface PushMessage {
  to: string
  title: string
  body: string
  data?: any
  sound?: 'default' | null
}

Deno.serve(async (req) => {
  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Buscar itens pendentes na fila (Batch de 100 por vez para respeitar limites do Expo)
    const { data: queueItems, error: fetchError } = await supabaseClient
      .from('notifications_queue')
      .select(`
        id,
        attempts,
        push_token_id,
        notification:notification_id (
          title,
          body,
          data
        ),
        token:push_token_id (
          token
        )
      `)
      .eq('status', 'pending')
      .lt('attempts', 3) // Máximo de 3 tentativas
      .limit(100)

    if (fetchError) throw fetchError
    if (!queueItems || queueItems.length === 0) {
      return new Response(JSON.stringify({ message: 'No pending notifications' }), { status: 200 })
    }

    // 2. Preparar as mensagens para o Expo
    const messages: PushMessage[] = []
    const queueMap: Record<string, string> = {} // Token -> Queue ID Mapping

    queueItems.forEach((item: any) => {
      if (item.token?.token) {
        messages.push({
          to: item.token.token,
          title: item.notification.title,
          body: item.notification.body,
          data: item.notification.data,
          sound: 'default'
        })
        queueMap[item.token.token] = item.id
      }
    })

    // 3. Enviar para o Expo em Lote
    const expoResponse = await fetch(EXPO_PUSH_API, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    })

    const result = await expoResponse.json()
    const expoData = result.data

    // 4. Tratar resultados e atualizar banco
    const updates = []
    const tokenDeletions = []

    for (let i = 0; i < expoData.length; i++) {
      const response = expoData[i]
      const originalMessage = messages[i]
      const queueId = queueMap[originalMessage.to]

      if (response.status === 'ok') {
        updates.push(
          supabaseClient
            .from('notifications_queue')
            .update({ status: 'sent', updated_at: new Date() })
            .eq('id', queueId)
        )
      } else {
        const error = response.details?.error
        console.error(`Push Error for token ${originalMessage.to}:`, error)

        // Se o dispositivo não está mais registrado, removemos o token
        if (error === 'DeviceNotRegistered') {
          tokenDeletions.push(
            supabaseClient
              .from('push_tokens')
              .delete()
              .eq('token', originalMessage.to)
          )
        }

        updates.push(
          supabaseClient
            .from('notifications_queue')
            .update({ 
              status: 'failed', 
              attempts: queueItems.find(it => it.id === queueId).attempts + 1,
              last_error: error || 'Unknown Error',
              updated_at: new Date() 
            })
            .eq('id', queueId)
        )
      }
    }

    await Promise.all([...updates, ...tokenDeletions])

    return new Response(JSON.stringify({ 
      processed: queueItems.length,
      success: expoData.filter((r: any) => r.status === 'ok').length 
    }), { status: 200 })

  } catch (err) {
    console.error('Edge Function Error:', err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})
