// public/sw.js
// Service worker mínimo: só entrega push notifications e trata o clique nelas.

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  let data = { title: 'iUser', body: 'Você tem uma nova notificação!', url: '/' }
  try {
    if (event.data) data = { ...data, ...event.data.json() }
  } catch (e) {
    if (event.data) data.body = event.data.text()
  }

  const options = {
    body: data.body,
    icon: '/android-chrome-192x192.png',
    badge: '/favicon-128x128.png',
    tag: data.tag || `iuser-${Date.now()}`,
    // Som e vibração do sistema: renotify faz tocar de novo mesmo com a mesma tag;
    // urgent (corrida nova, motorista chegando) fica na tela até a pessoa tocar.
    renotify: true,
    silent: false,
    vibrate: data.urgent ? [300, 120, 300, 120, 500] : [200, 100, 200],
    requireInteraction: !!data.urgent,
    data: { url: data.url || '/' },
  }

  event.waitUntil(self.registration.showNotification(data.title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.registration.scope) && 'focus' in client) {
          client.focus()
          if ('navigate' in client) client.navigate(targetUrl)
          return
        }
      }
      return self.clients.openWindow(targetUrl)
    })
  )
})
