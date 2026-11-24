// 오프라인/홈 화면 설치용 서비스 워커: 네트워크 우선 + 캐시 폴백.
// 온라인이면 항상 최신 파일을 받아 캐시를 갱신하고, 오프라인이면 마지막 캐시로 동작합니다.
// 파일 이름에 버전 쿼리(?v=)를 붙이지 않으므로, 데이터/코드가 바뀌면 CACHE_VERSION 만 올리면 됩니다.
const CACHE_VERSION = "v7";
const CACHE_NAME = `toeic-voca-${CACHE_VERSION}`;

const CORE = [
  "./", "./index.html", "./manifest.json", "./css/style.css",
  "./js/app.js", "./js/logic.js", "./js/store.js", "./js/srs.js", "./js/tts.js", "./js/ui.js", "./js/render.js",
  "./js/views/home.js", "./js/views/day.js", "./js/views/study.js", "./js/views/quiz.js", "./js/views/stats.js", "./js/views/listen.js", "./js/views/typing.js",
  "./js/crypto.js", "./js/sync.js", "./js/firebase-config.js",
  "./data/words.json", "./data/words.enc", "./data/toc.json",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/apple-touch-icon.png", "./icons/favicon.ico",
];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  // 배포본에는 words.json 이, 개발본에는 words.enc 가 없으므로 하나씩 담고 실패는 무시
  e.waitUntil(caches.open(CACHE_NAME).then((c) => Promise.allSettled(CORE.map((u) => c.add(u)))));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req, { cache: "no-cache" }) // 브라우저 HTTP 캐시가 아닌 서버의 최신본인지 매번 확인
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});
