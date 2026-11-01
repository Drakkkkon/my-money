// Service worker My Money: свежие файлы сайта из сети (автообновление), без интернета — из кэша.
// Внешние запросы (Google, курсы, погода, библиотеки) не перехватываются.
const CACHE = 'my-money-v3';
const CORE = [
    './',
    'index.html',
    'css/style.css',
    'css/win95.css',
    'js/config.js',
    'js/sound.js',
    'js/cloud.js',
    'js/oldbook.js',
    'js/script.js',
    'manifest.webmanifest',
    'images/icon-192.png',
    'images/logo.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

    // Сначала сеть (с проверкой свежести у сервера), при ошибке — кэш
    event.respondWith(
        fetch(req, { cache: 'no-cache' })
            .then(res => {
                if (res && res.ok) {
                    const copy = res.clone();
                    caches.open(CACHE).then(cache => cache.put(req, copy));
                }
                return res;
            })
            .catch(() => caches.match(req, { ignoreSearch: true })
                .then(hit => hit || (req.mode === 'navigate' ? caches.match('index.html') : null))
                .then(hit => hit || Response.error()))
    );
});
