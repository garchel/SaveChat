// NoteThread Service Worker — app shell offline + cache-first para assets.
// Bump CACHE (vN) a cada deploy para invalidar versões anteriores.
const CACHE = 'notethread-v120';
const ASSETS = [
  './', './index.html', './app.js', './styles.css', './CHANGELOG.md',
  './assets/logo.svg', './assets/logo.png',
  './js/utils.js', './js/icons.js', './js/emojis.js', './js/emojis-data.js', './js/markdown.js', './js/petals.js',
  './js/store.js', './js/sound.js', './js/sync-supabase.js', './js/offline-queue.js', './js/confetti.js',
  './js/bg-patterns.js', './js/friendly-names.js', './js/error-tracking.js', './js/updater.js',
  './js/ui/picker.js', './js/ui/navigation.js', './js/ui/messages.js',
  './js/ui/mentions.js', './js/ui/reminders.js',
  './js/ui/settings.js', './js/ui/auth.js', './js/ui/tree.js', './js/ui/tasks.js',
  './js/ui/composer.js', './js/ui/sync-events.js',
  './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png', './icon-1024.png', './favicon-32.png',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-192.png', './icons/icon-maskable-512.png',
  './icons/icon-src.svg', './icons/icon-maskable-src.svg',
  './assets/logo.svg', './assets/logo.png',
  './assets/themes/logo-cozy.svg', './assets/themes/logo-dark.svg', './assets/themes/logo-lavender.svg', './assets/themes/logo-midnight.svg',
  './assets/themes/logo-mint.svg', './assets/themes/logo-mono.svg', './assets/themes/logo-napolitano.svg', './assets/themes/logo-ocean.svg',
  './assets/themes/logo-peach.svg', './assets/themes/logo-sakura.svg',
  './privacy.html', './terms.html', './oauth-callback.html'
];

self.addEventListener('install', (e) => {
  // Regra: NÃO faz skipWaiting aqui. A nova versão fica "waiting" até o usuário
  // clicar em Atualizar app (postMessage SKIP_WAITING) — atualização controlada.
  //
  // Precache à prova de envenenamento: os assets são baixados com query-buster
  // (?precache=…). Um SW antigo cache-first não tem essa chave no cache e vai à
  // REDE — assim o cache novo NUNCA herda asset velho do SW anterior. O
  // conteúdo é guardado sob a chave limpa (sem query) p/ fallback offline.
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    const bust = '?precache=' + Date.now();
    await Promise.all(ASSETS.map(async (a) => {
      try { c.put(a, await fetch(a + bust, { cache: 'reload' })); } catch {}
    }));
  })());
});

// o cliente pediu explicitamente assumir a nova versão (botão Atualizar app)
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// clique numa notificação de lembrete → abre o app no caderno da nota
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const tid = e.notification.data && e.notification.data.threadId;
  e.waitUntil((async () => {
    const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // se já há janela aberta, foca e navega
    for (const client of clientList) {
      await client.focus();
      if (tid) client.postMessage({ type: 'notethread-open-thread', threadId: tid });
      return;
    }
    // sem janela aberta: abre nova
    await self.clients.openWindow(tid ? './?thread=' + encodeURIComponent(tid) : './');
  })());
});

// Estratégia: cache-first para GET estáticos; rede com fallback ao cache para navegação.
self.addEventListener('sync', (e) => {
  if (e.tag === 'notethread-sync') {
    e.waitUntil(
      (async () => {
        // tenta notificar clientes para flush da fila
        const clients = await self.clients.matchAll();
        clients.forEach((c) => c.postMessage({ type: 'notethread-sync' }));
      })()
    );
  }
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return; // não cachear POST/WebSocket
  const url = new URL(req.url);
  if (url.protocol === 'ws:' || url.protocol === 'wss:') return;
  // nunca interceptar o sync server (WebSocket/http de dados)
  if (url.port === '3001') return;
  // fonts: deixar o browser buscar direto (SW fetch cai no connect-src do CSP)
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') return;
  // supabase/esm.sh: idem — não responder via SW
  if (url.hostname.endsWith('.supabase.co') || url.hostname === 'esm.sh') return;

  // o próprio SW nunca é interceptado: o navegador precisa sempre revalidá-lo
  // para descobrir novas versões (redundância com updateViaCache:'none')
  if (url.pathname.endsWith('/sw.js')) return;

  // CSS/JS/CHANGELOG e navegação: network-first — sempre a versão mais nova;
  // cache só como fallback offline. cache:'no-cache' revalida com o servidor
  // mesmo se o HTTP cache do navegador se achar válido.
  const isAsset = url.origin === location.origin && /\.(css|js|mjs|md)$/.test(url.pathname);
  if (isAsset) {
    e.respondWith(
      fetch(req, { cache: 'no-cache' }).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.match(req).then((cached) => cached || new Response('', { status: 504, statusText: 'offline' })))
    );
    return;
  }

  // navegação (index.html): network-first para a versão embarcada (APP_VERSION)
  // sempre refletir o deploy mais novo; cache = fallback offline
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req, { cache: 'no-cache' }).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        // cacheia apenas respostas ok de mesmo origem
        if (res && res.ok && url.origin === location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => {
        // offline: se for navegação, entrega o app shell
        if (req.mode === 'navigate') return caches.match('./index.html');
        return new Response('', { status: 504, statusText: 'offline' });
      });
    })
  );
});
