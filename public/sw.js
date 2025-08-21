self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

const PROFILE_CACHE = 'oshi-profile-v1';
async function setProfile(p) {
  const cache = await caches.open(PROFILE_CACHE);
  await cache.put('/__profile__/current',
    new Response(JSON.stringify(p), { headers: { 'Content-Type': 'application/json' } })
  );
}

self.addEventListener('message', (event) => {
  const { type, ip, cara } = event.data || {};
  if (type === 'setProfile' && ip && cara) {
    event.waitUntil(setProfile({ ip, cara }));
  } else if (type === 'clearProfile') {
    event.waitUntil(caches.delete(PROFILE_CACHE));
  }
});

// PWA から /api/bootstrap を叩くと、ここでキャッシュを返す
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.pathname === '/api/bootstrap') {
    event.respondWith((async () => {
      const cache = await caches.open(PROFILE_CACHE);
      const res = await cache.match('/__profile__/current');
      return res || new Response(null, { status: 204 });
    })());
  }
});
