const CACHE_NAME = 'vcards-cache-v2'

async function getShellAssets() {
  const shellFiles = new Set(['./', './index.html', './manifest.webmanifest', './icons/icon-192.svg', './icons/icon-512.svg'])

  try {
    const indexUrl = new URL('./index.html', self.registration.scope).toString()
    const response = await fetch(indexUrl, { cache: 'no-cache' })
    const html = await response.text()

    const assetMatches = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
      .map((match) => match[1])
      .filter((url) => url && !url.startsWith('http'))

    for (const asset of assetMatches) {
      shellFiles.add(asset)
    }
  } catch {}

  return [...shellFiles]
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const assets = await getShellAssets()
      const cache = await caches.open(CACHE_NAME)
      await cache.addAll(assets)
    })(),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const responseClone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', responseClone))
          return response
        })
        .catch(() => caches.match('./index.html')),
    )
    return
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached

      return fetch(event.request)
        .then((response) => {
          if (response.ok && new URL(event.request.url).origin === self.location.origin) {
            const responseClone = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone))
          }
          return response
        })
        .catch(() => caches.match('./index.html'))
    }),
  )
})
