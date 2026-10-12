/* Service worker (สร้างเป็น dist/sw.js ตอน build โดย plugin ใน vite.config.ts)
 * - precache: ไฟล์ทั้งหมดของแอป เพื่อเปิดแบบออฟไลน์ได้ตั้งแต่เข้าครั้งแรก
 * - ฟอนต์ Google: cache แบบ stale-while-revalidate (ต้องออนไลน์ครั้งแรกเพื่อดาวน์โหลดฟอนต์)
 */
const VERSION = /*__VERSION__*/ 'dev'
const PRECACHE_URLS = /*__PRECACHE__*/ []
const CACHE = `pali-memorize-${VERSION}`
const FONT_CACHE = 'pali-memorize-fonts'
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com']

const scoped = (p) => new URL(p, self.registration.scope).href
const INDEX_URL = scoped('index.html')

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS.map(scoped)))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('pali-memorize-') && k !== CACHE && k !== FONT_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

async function navigate(request) {
  const cached = await caches.match(INDEX_URL)
  if (cached) return cached
  try {
    return await fetch(request)
  } catch {
    return new Response('ออฟไลน์ และยังไม่มีข้อมูลในแคช', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok) {
    const cache = await caches.open(CACHE)
    cache.put(request, response.clone())
  }
  return response
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(FONT_CACHE)
  const cached = await cache.match(request)
  const network = fetch(request)
    .then((response) => {
      // ฟอนต์ข้ามโดเมนอาจเป็น opaque response (status 0) ก็เก็บได้
      if (response.ok || response.type === 'opaque') cache.put(request, response.clone())
      return response
    })
    .catch(() => undefined)
  return cached || (await network) || Response.error()
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)

  if (request.mode === 'navigate') {
    event.respondWith(navigate(request))
  } else if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request))
  } else if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(request))
  }
})
