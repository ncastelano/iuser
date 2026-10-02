// public/sw.js
// Service worker mínimo: entrega push notifications e trata o clique nelas.
// Notificação de corrida nova ("rideAlert") ganha botões de valor — Tarifa
// iUser, Minha tarifa e "Outro valor" (campo de texto) — que mandam a
// candidatura direto, sem abrir o app. Tocar no corpo abre o mapa da corrida.

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

const formatBRL = (v) => 'R$ ' + Number(v).toFixed(2).replace('.', ',')

// Monta os botões conforme o que o aparelho suporta: Notification.maxActions
// é 2 em alguns Androids/desktops e 3 em outros. Com só 2, fica "Minha tarifa
// (ou iUser, se não tiver) + Outro valor".
function rideActions(alert) {
  if (alert.offeredPrice != null) {
    return [{ action: 'apply-offered', title: 'Aceitar frete ' + formatBRL(alert.offeredPrice) }]
  }
  const platform = { action: 'apply-platform', title: 'iUser ' + formatBRL(alert.platformPrice) }
  const custom = alert.customPrice != null ? { action: 'apply-custom', title: 'Minha ' + formatBRL(alert.customPrice) } : null
  const edit = { action: 'apply-edit', type: 'text', title: 'Outro valor', placeholder: 'Valor em R$ (ex: 25,50)' }
  const max = (self.Notification && self.Notification.maxActions) || 2
  if (max >= 3) return custom ? [platform, custom, edit] : [platform, edit]
  return [custom || platform, edit]
}

function showPushNotification(data) {
  const alert = data.rideAlert
  const options = {
    body: alert ? data.body + '\nToque para ver no mapa' : data.body,
    icon: '/android-chrome-192x192.png',
    badge: '/favicon-128x128.png',
    tag: data.tag || `iuser-${Date.now()}`,
    // Som e vibração do sistema: renotify faz tocar de novo mesmo com a mesma tag;
    // urgent (corrida nova, motorista chegando) fica na tela até a pessoa tocar.
    renotify: true,
    silent: false,
    vibrate: data.urgent ? [300, 120, 300, 120, 500] : [200, 100, 200],
    requireInteraction: !!data.urgent,
    data: { url: data.url || '/', rideAlert: alert || null },
  }
  if (alert) options.actions = rideActions(alert)
  return self.registration.showNotification(data.title, options)
}

self.addEventListener('push', (event) => {
  let data = { title: 'iUser', body: 'Você tem uma nova notificação!', url: '/' }
  try {
    if (event.data) data = { ...data, ...event.data.json() }
  } catch (e) {
    if (event.data) data.body = event.data.text()
  }
  event.waitUntil(showPushNotification(data))
})

// O app aberto (DriverRideAlertListener) pede a mesma notificação pelo
// service worker, assim o formato dos botões fica num lugar só.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'show-ride-alert') {
    event.waitUntil(showPushNotification(event.data.payload))
  }
})

function openApp(targetUrl) {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
    for (const client of clientList) {
      if (client.url.includes(self.registration.scope) && 'focus' in client) {
        client.focus()
        if ('navigate' in client) client.navigate(targetUrl)
        return
      }
    }
    return self.clients.openWindow(targetUrl)
  })
}

async function applyFromNotification(event, data) {
  const alert = data.rideAlert
  const targetUrl = data.url || '/aceitar-corridas'
  let price = null
  if (event.action === 'apply-platform') price = alert.platformPrice
  else if (event.action === 'apply-custom') price = alert.customPrice
  else if (event.action === 'apply-offered') price = alert.offeredPrice
  else if (event.action === 'apply-edit') {
    // Sem campo de texto (navegador sem suporte): abre o mapa pra digitar lá.
    if (!event.reply) return openApp(targetUrl)
    price = parseFloat(String(event.reply).replace(/[^0-9,.]/g, '').replace(',', '.'))
  }

  const notify = (title, body, url) =>
    self.registration.showNotification(title, {
      body,
      icon: '/android-chrome-192x192.png',
      badge: '/favicon-128x128.png',
      tag: `ride-apply-${alert.rideId}`,
      data: { url },
    })

  if (!(price > 0)) return notify('Valor inválido', 'Toque para abrir a corrida e digitar o valor.', targetUrl)

  try {
    const res = await fetch('/api/rides/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ rideId: alert.rideId, price }),
    })
    const json = await res.json().catch(() => ({}))
    if (res.ok) {
      return notify('Candidatura enviada!', 'Você se candidatou por ' + formatBRL(price) + '. Aguarde o passageiro decidir.', '/aceitar-corridas')
    }
    const body = res.status === 401 ? 'Abra o iUser e entre na sua conta pra se candidatar.' : (json.error || 'Toque para abrir a corrida.')
    return notify('Não deu pra se candidatar', body, targetUrl)
  } catch (e) {
    return notify('Sem conexão', 'Não deu pra enviar sua candidatura. Toque para abrir a corrida.', targetUrl)
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const data = event.notification.data || {}

  if (event.action && event.action.startsWith('apply-') && data.rideAlert) {
    event.waitUntil(applyFromNotification(event, data))
    return
  }

  event.waitUntil(openApp(data.url || '/'))
})
