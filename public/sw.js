// Service Worker para notificações e PWA
self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

// Listener para Push Notifications (quando o browser está fechado)
// Nota: Isso requer integração com um servidor de Push (VAPID/FCM)
self.addEventListener('push', (event) => {
    let data = { title: 'Novo Pedido', body: 'Você tem uma nova atualização no iUser.' };
    
    try {
        if (event.data) {
            data = event.data.json();
        }
    } catch (e) {
        data.body = event.data.text();
    }

    const options = {
        body: data.body,
        icon: '/icon.png',
        badge: '/icon.png',
        vibrate: [100, 50, 100],
        data: {
            url: self.registration.scope
        }
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

// Ao clicar na notificação, abre o app
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window' }).then((clientList) => {
            if (clientList.length > 0) {
                return clientList[0].focus();
            }
            return clients.openWindow('/');
        })
    );
});
