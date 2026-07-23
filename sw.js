/* 水神的工具箱 — Service Worker（PWA 離線殼層）
 *
 * 策略：
 *  - 導覽請求（HTML）：network-first。線上一律拿最新頁面（部署更新即時生效），
 *    離線時回退快取；連快取都沒有才回退首頁。
 *  - 同源靜態資源（css / js / json / 圖示）：stale-while-revalidate。
 *    先回快取讓畫面秒開，背景再更新快取供下次使用。
 *  - 跨源請求（XIVAPI / Universalis / 外部圖床）：完全不介入，直接走網路，
 *    確保市價等即時資料不被快取污染。
 *  - 大檔（> MAX_CACHE_BYTES，如 glamour 的 10MB js）：不寫入快取，避免撐爆配額。
 *
 * 換版：改 CACHE_VERSION 字串即可在 activate 時淘汰所有舊快取。
 *
 * 注意：本站為 GitHub Pages 使用者頁（根網域託管），故 scope／start_url 皆為 "/"。
 */
const CACHE_VERSION = 'sgt-v1';
const MAX_CACHE_BYTES = 5 * 1024 * 1024;

// 安裝時預先快取的最小殼層（全站共用資源 + 首頁）
const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/assets/css/common.css',
  '/assets/css/theme.css',
  '/assets/js/theme.js',
  '/assets/js/patch-gate.js',
  '/assets/icons/icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      // 個別加入：任一資源 404 不致讓整個安裝失敗
      .then((cache) => Promise.all(PRECACHE.map((u) => cache.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function tooBig(res) {
  const len = res.headers.get('content-length');
  return len && parseInt(len, 10) > MAX_CACHE_BYTES;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }

  // 跨源（API、外部圖床）不介入
  if (url.origin !== self.location.origin) return;

  // 導覽（HTML）：network-first
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('/index.html')))
    );
    return;
  }

  // 同源靜態資源：stale-while-revalidate
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok && res.type === 'basic' && !tooBig(res)) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
