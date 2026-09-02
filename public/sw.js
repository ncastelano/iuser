// public/sw.js

// ===== DEFINIÇÃO DOS ÍCONES SVG (Lucide) =====
const ICONS = {
    appointment_invite: `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 24 24" fill="none" stroke="#f97316" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
    <line x1="16" y1="2" x2="16" y2="6"></line>
    <line x1="8" y1="2" x2="8" y2="6"></line>
    <line x1="3" y1="10" x2="21" y2="10"></line>
    <circle cx="12" cy="15" r="4"></circle>
    <line x1="12" y1="11" x2="12" y2="15"></line>
    <line x1="12" y1="15" x2="16" y2="15"></line>
  </svg>`,

    appointment_confirmed: `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
    <line x1="16" y1="2" x2="16" y2="6"></line>
    <line x1="8" y1="2" x2="8" y2="6"></line>
    <line x1="3" y1="10" x2="21" y2="10"></line>
    <polyline points="9 16 11 18 15 14"></polyline>
  </svg>`,

    appointment_cancelled: `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
    <line x1="16" y1="2" x2="16" y2="6"></line>
    <line x1="8" y1="2" x2="8" y2="6"></line>
    <line x1="3" y1="10" x2="21" y2="10"></line>
    <line x1="8" y1="14" x2="16" y2="22"></line>
    <line x1="16" y1="14" x2="8" y2="22"></line>
  </svg>`,

    default: `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 24 24" fill="none" stroke="#f97316" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
    <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
    <circle cx="12" cy="12" r="4"></circle>
  </svg>`
};

// ===== FUNÇÃO PARA CRIAR ÍCONE BLOB =====
function createIconBlob(svgString, size = 192) {
    const svg = svgString
        .replace(/width="\d+"/, `width="${size}"`)
        .replace(/height="\d+"/, `height="${size}"`);

    return new Blob([svg], { type: 'image/svg+xml' });
}

// ===== FUNÇÃO PARA CRIAR URL DO ÍCONE =====
function getIconUrl(type, size = 192) {
    const svg = ICONS[type] || ICONS.default;
    const blob = createIconBlob(svg, size);
    return URL.createObjectURL(blob);
}

// ===== INSTALAÇÃO =====
self.addEventListener('install', (event) => {
    console.log('[SW] Instalando...');
    self.skipWaiting();
});

// ===== ATIVAÇÃO =====
self.addEventListener('activate', (event) => {
    console.log('[SW] Ativando...');
    event.waitUntil(self.clients.claim());
});

// ===== PUSH NOTIFICATIONS =====
self.addEventListener('push', (event) => {
    console.log('[SW] Push recebido:', event);

    let data = {
        title: 'iUser',
        body: 'Você tem uma nova notificação!',
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        data: {
            url: '/',
            type: 'default'
        }
    };

    try {
        if (event.data) {
            const parsed = event.data.json();
            data = {
                ...data,
                ...parsed
            };
        }
    } catch (e) {
        data.body = event.data ? event.data.text() : data.body;
    }

    // Determinar o tipo de ícone
    const iconType = data.data?.type || 'default';
    const iconUrl = getIconUrl(iconType, 192);

    // Mensagens personalizadas por tipo
    const typeMessages = {
        'appointment_invite': '📅 Você recebeu um convite!',
        'appointment_confirmed': '✅ Compromisso confirmado!',
        'appointment_cancelled': '❌ Compromisso cancelado'
    };

    let bodyText = data.body;
    if (typeMessages[iconType]) {
        bodyText = `${typeMessages[iconType]} ${data.body}`;
    }

    const options = {
        body: bodyText,
        icon: iconUrl,
        badge: iconUrl,
        vibrate: [100, 50, 100],
        data: {
            url: data.data?.url || '/',
            appointment_id: data.data?.appointment_id || null,
            type: iconType
        },
        requireInteraction: true,
        tag: data.data?.appointment_id || `notification-${Date.now()}`,
        actions: [
            {
                action: 'open',
                title: '📋 Ver Agora'
            },
            {
                action: 'close',
                title: '❌ Fechar'
            }
        ]
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options).then(() => {
            setTimeout(() => URL.revokeObjectURL(iconUrl), 5000);
        })
    );
});

// ===== CLICK NA NOTIFICAÇÃO =====
self.addEventListener('notificationclick', (event) => {
    console.log('[SW] Notificação clicada:', event);

    event.notification.close();

    const notificationData = event.notification.data || {};
    const url = notificationData.url || '/';
    const appointmentId = notificationData.appointment_id;
    const type = notificationData.type;

    let targetUrl = url;
    if (appointmentId) {
        if (type === 'appointment_invite') {
            targetUrl = `/compromissos?invite=${appointmentId}`;
        } else {
            targetUrl = `/compromissos`;
        }
    }

    const action = event.action;
    if (action === 'close') {
        return;
    }

    event.waitUntil(
        clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        }).then((clientList) => {
            for (const client of clientList) {
                if (client.url.includes(self.registration.scope) && 'focus' in client) {
                    client.focus();
                    if (client.url !== targetUrl) {
                        client.navigate(targetUrl);
                    }
                    return client;
                }
            }
            return clients.openWindow(targetUrl);
        })
    );
});

// ===== MENSAGENS DO CLIENTE =====
self.addEventListener('message', (event) => {
    console.log('[SW] Mensagem recebida:', event.data);

    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }

    if (event.data && event.data.type === 'TEST_NOTIFICATION') {
        const types = ['appointment_invite', 'appointment_confirmed', 'appointment_cancelled', 'default'];
        const randomType = types[Math.floor(Math.random() * types.length)];
        const iconUrl = getIconUrl(randomType);

        const messages = {
            'appointment_invite': '📅 Você recebeu um convite! Clique para aceitar.',
            'appointment_confirmed': '✅ Seu compromisso foi confirmado!',
            'appointment_cancelled': '❌ O compromisso foi cancelado.',
            'default': '🔔 Notificação de teste do iUser!'
        };

        self.registration.showNotification('🧪 Teste de Notificação', {
            body: messages[randomType] || 'Sua conexão está funcionando!',
            icon: iconUrl,
            badge: iconUrl,
            vibrate: [200, 100, 200],
            data: {
                url: '/',
                type: randomType
            },
            actions: [
                {
                    action: 'open',
                    title: '📋 Abrir'
                },
                {
                    action: 'close',
                    title: '❌ Fechar'
                }
            ]
        }).then(() => {
            setTimeout(() => URL.revokeObjectURL(iconUrl), 5000);
        });
    }

    if (event.data && event.data.type === 'REGISTER_PUSH') {
        registerPush(event);
    }
});

// ===== REGISTRO PUSH =====
async function registerPush(event) {
    try {
        // 🔥 Usar a chave VAPID do .env (via env.local)
        // A chave é injetada durante o build ou via substituição
        const vapidKey = VAPID_PUBLIC_KEY;

        if (!vapidKey || vapidKey === 'SUA_VAPID_PUBLIC_KEY_AQUI') {
            console.warn('[SW] ⚠️ VAPID_PUBLIC_KEY não configurada!');
            console.warn('[SW] Execute: npx web-push generate-vapid-keys');
            return;
        }

        let subscription = await self.registration.pushManager.getSubscription();

        if (!subscription) {
            subscription = await self.registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(vapidKey)
            });
        }

        const response = await fetch('/api/push/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                endpoint: subscription.endpoint,
                keys: {
                    auth: subscription.toJSON().keys?.auth,
                    p256dh: subscription.toJSON().keys?.p256dh
                }
            })
        });

        if (response.ok) {
            console.log('[SW] ✅ Push registrado com sucesso');
            const clients = await self.clients.matchAll();
            clients.forEach(client => {
                client.postMessage({
                    type: 'PUSH_REGISTERED',
                    success: true
                });
            });
        } else {
            console.error('[SW] ❌ Erro ao registrar push:', await response.text());
        }
    } catch (error) {
        console.error('[SW] ❌ Erro ao registrar push:', error);
    }
}

// ===== OFFLINE SUPPORT =====
const CACHE_NAME = 'iuser-cache-v1';

self.addEventListener('fetch', (event) => {
    // Não interceptar requisições de API e Next.js
    if (event.request.url.includes('/api/') ||
        event.request.url.includes('/supabase/') ||
        event.request.url.includes('/_next/static/')) {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                if (response) {
                    return response;
                }

                return fetch(event.request)
                    .then((fetchResponse) => {
                        if (!fetchResponse || fetchResponse.status !== 200) {
                            return fetchResponse;
                        }

                        const responseToCache = fetchResponse.clone();
                        caches.open(CACHE_NAME)
                            .then((cache) => {
                                try {
                                    cache.put(event.request, responseToCache);
                                } catch (e) { }
                            });

                        return fetchResponse;
                    })
                    .catch(() => {
                        if (event.request.mode === 'navigate') {
                            return caches.match('/offline.html');
                        }
                    });
            })
    );
});

// ===== SINCronização EM BACKGROUND =====
self.addEventListener('sync', (event) => {
    console.log('[SW] Sync:', event.tag);

    if (event.tag === 'sync-appointments') {
        event.waitUntil(syncAppointments());
    }
});

async function syncAppointments() {
    try {
        const db = await openDatabase();
        const pendingItems = await getPendingItems(db);

        if (pendingItems.length > 0) {
            for (const item of pendingItems) {
                const response = await fetch('/api/appointments/sync', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(item)
                });

                if (response.ok) {
                    await removePendingItem(db, item.id);
                }
            }
        }
    } catch (error) {
        console.error('[SW] Erro na sincronização:', error);
    }
}

// ===== INDEXEDDB HELPERS =====
function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('iUserDB', 1);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('pending')) {
                db.createObjectStore('pending', { keyPath: 'id' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function getPendingItems(db) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('pending', 'readonly');
        const store = transaction.objectStore('pending');
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function removePendingItem(db, id) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('pending', 'readwrite');
        const store = transaction.objectStore('pending');
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// ===== GERENCIAMENTO DE PERMISSÕES =====
self.addEventListener('pushsubscriptionchange', (event) => {
    console.log('[SW] Push subscription change:', event);

    event.waitUntil(
        fetch('/api/push/refresh', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                oldEndpoint: event.oldSubscription?.endpoint,
                newEndpoint: event.newSubscription?.endpoint
            })
        })
    );
});

// ===== VAPID CONFIG =====
// ✅ Use a chave do arquivo .env.local
// Para gerar uma chave, execute: npx web-push generate-vapid-keys
// Depois copie a Public Key para NEXT_PUBLIC_VAPID_PUBLIC_KEY no .env.local
const VAPID_PUBLIC_KEY = 'BJthRQ5myDgc7OSXzPCMftGw-n16F7zQBEN7EUD6XxcfTTvrLGWSIG7y_JmWcVf4YzOo5WvpkdWTk4-6p3iEGkU';

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

console.log('[SW] ✅ Service Worker carregado!');