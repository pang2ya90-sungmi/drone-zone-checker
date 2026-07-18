// Service Worker: 앱 캐싱 + 새 버전 자동 감지
// - HTML: 네트워크 우선 (항상 최신 확인, 오프라인 시 캐시 폴백)
// - JS/CSS/아이콘: stale-while-revalidate (캐시 즉시 응답 + 백그라운드 갱신)
// - API 호출(Worker, Kakao 등): 건들지 않음 (항상 네트워크)
// - 새 SW 설치되면 클라이언트에 skipWaiting 메시지로 활성화 유도

const CACHE_NAME = 'drone-zone-v2';

const APP_SHELL = [
  './',
  './index.html',
  './zones.js',
  './spots.js',
  './checklist.js',
  './pwa.js',
  './icon.svg',
  './icon-maskable.svg',
  './manifest.webmanifest',
];

// 캐시 우회 도메인 (동적 데이터, 지도 타일)
const BYPASS_HOSTS = [
  'drone-zone-proxy.pang2ya90.workers.dev',
  'nominatim.openstreetmap.org',
  'dapi.kakao.com',
  'api.vworld.kr',
];
const isTileHost = (h) => /tile\.openstreetmap\.org$/.test(h) || h.includes('tile.openstreetmap.org');

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((c) => c.addAll(APP_SHELL))
      // 새 SW를 즉시 waiting으로 이동시켜 pwa.js가 감지할 수 있게 함
      // 실제 활성화는 사용자 배너 클릭 시 skipWaiting
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // 옛 캐시 삭제
    const names = await caches.keys();
    await Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)));
    // 즉시 페이지 컨트롤
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 캐시 우회: API/외부 서비스
  if (BYPASS_HOSTS.some(h => url.hostname === h)) return;
  // 지도 타일도 우회 (용량 크고 브라우저 캐시로 충분)
  if (isTileHost(url.hostname)) return;

  // HTML: 네트워크 우선, 실패 시 캐시
  const isNavigation = req.mode === 'navigate'
    || (req.headers.get('accept') || '').includes('text/html');
  if (isNavigation) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const clone = fresh.clone();
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, clone);
        return fresh;
      } catch {
        const cached = await caches.match(req);
        return cached || caches.match('./index.html');
      }
    })());
    return;
  }

  // 그 외: stale-while-revalidate
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);
    const fetchPromise = fetch(req).then((res) => {
      if (res && res.status === 200) cache.put(req, res.clone());
      return res;
    }).catch(() => cached);
    return cached || fetchPromise;
  })());
});
